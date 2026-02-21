/**
 * NeoGuide Dashboard - Main Component
 * 
 * Real-time intubation guidance dashboard with:
 * - Live webcam feed with AI overlay
 * - 3D airway visualization
 * - Depth gauge with anatomical zones
 * - Vitals monitoring panel
 * - Event log with timestamped alerts
 * - Voice alert status
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useWebcam } from '../hooks/useWebcam';
import { analyzeFrame, captureFrame } from '../services/geminiVision';
import { speakAlert, speakCustom, determineAlert, preloadAlerts, ALERT_DEFINITIONS } from '../services/voiceAlerts';

// ═══════════════════════════════════════
// STABLE STATE HELPER
// Majority vote over the last N results to suppress hallucination flip-flops
// ═══════════════════════════════════════
function getMajority(arr, key) {
  if (!arr.length) return null;
  const counts = {};
  for (const item of arr) {
    const v = item?.[key];
    if (v != null) counts[v] = (counts[v] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

// ═══════════════════════════════════════
// DEPTH ZONE CONFIGURATION
// ═══════════════════════════════════════
const DEPTH_ZONES = [
  { id: 'pre_glottic', label: 'Pre-Glottic', range: '0-1 cm', color: '#06B6D4', bgColor: 'rgba(6,182,212,0.15)' },
  { id: 'glottic', label: 'Glottic', range: '1-2 cm', color: '#10B981', bgColor: 'rgba(16,185,129,0.15)' },
  { id: 'subglottic', label: 'Sub-Glottic', range: '2-3 cm', color: '#10B981', bgColor: 'rgba(16,185,129,0.15)' },
  { id: 'tracheal', label: 'Tracheal', range: '3-5 cm', color: '#22C55E', bgColor: 'rgba(34,197,94,0.2)' },
  { id: 'carinal', label: 'Carinal', range: '5-6 cm', color: '#F59E0B', bgColor: 'rgba(245,158,11,0.15)' },
  { id: 'bronchial', label: 'Bronchial', range: '6+ cm', color: '#EF4444', bgColor: 'rgba(239,68,68,0.15)' },
];

const STATUS_CONFIG = {
  safe: { color: '#10B981', label: 'SAFE', glow: '0 0 20px rgba(16,185,129,0.4)' },
  warning: { color: '#F59E0B', label: 'WARNING', glow: '0 0 20px rgba(245,158,11,0.4)' },
  danger: { color: '#EF4444', label: 'DANGER', glow: '0 0 20px rgba(239,68,68,0.5)' },
};

export default function Dashboard() {
  // ═══════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════
  const { videoRef, isActive, startCamera, stopCamera } = useWebcam();
  const [analysis, setAnalysis] = useState(null);       // raw latest result (for landmarks)
  const [stableAnalysis, setStableAnalysis] = useState(null); // majority-voted (for status/depth)
  const [eventLog, setEventLog] = useState([]);
  const [analysisInterval, setAnalysisInterval] = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [fps, setFps] = useState(0);
  const [vitals, setVitals] = useState({ spo2: 94, heartRate: 142, respRate: 48 });

  // Refs that survive renders without triggering re-renders
  const isAnalyzingRef = useRef(false);       // gate: prevent overlapping calls
  const historyRef    = useRef([]);           // rolling window of last 3 results
  const stableRef     = useRef(null);         // latest stable state (for alert comparison)
  const lastAlertTs   = useRef(0);            // timestamp of last voice alert
  const runAnalysisRef = useRef(null);        // always points to latest runAnalysis fn

  const ALERT_COOLDOWN_MS = 1500;

  // Add event to log
  const addEvent = useCallback((message, status = 'safe') => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setEventLog(prev => [{ time, message, status }, ...prev].slice(0, 50));
  }, []);

  // ═══════════════════════════════════════
  // ANALYSIS LOOP
  // ═══════════════════════════════════════
  const runAnalysis = useCallback(async () => {
    if (!videoRef.current || !isActive || isAnalyzingRef.current) return;

    isAnalyzingRef.current = true;
    const startTime = performance.now();

    try {
      const { base64, mimeType } = captureFrame(videoRef.current);
      const result = await analyzeFrame(base64, mimeType);

      // Rolling history: keep last 3 results for majority vote
      historyRef.current = [...historyRef.current.slice(-2), result];
      const history = historyRef.current;

      // Stable state via majority vote (suppresses hallucination flip-flops)
      const stableZone   = getMajority(history, 'depth_zone')   || result.depth_zone;
      const stableStatus = getMajority(history, 'safety_status') || result.safety_status;
      const stable = { ...result, depth_zone: stableZone, safety_status: stableStatus };

      const prevStable = stableRef.current;
      setAnalysis(result);         // raw → landmark grid (fast, always fresh)
      setStableAnalysis(stable);   // smoothed → status badge + depth gauge
      stableRef.current = stable;

      // FPS
      const elapsed = performance.now() - startTime;
      setFps(Math.round(1000 / elapsed));

      // Voice alerts: only on stable-state transition + cooldown
      const now = Date.now();
      if (voiceEnabled && result.success && (now - lastAlertTs.current) >= ALERT_COOLDOWN_MS) {
        const alertKey = determineAlert(stable, prevStable);
        if (alertKey) {
          speakAlert(alertKey);
          lastAlertTs.current = now;
          addEvent(ALERT_DEFINITIONS[alertKey]?.text || alertKey, stable.safety_status);
        }
      }

      // Log depth zone changes (based on stable state)
      if (result.success && result.image_quality !== 'no_airway_visible') {
        if (!prevStable || stable.depth_zone !== prevStable.depth_zone) {
          addEvent(`Depth zone: ${stable.depth_zone} (${stable.estimated_depth_cm?.toFixed(1)}cm)`, stable.safety_status);
        }
      }
    } catch (err) {
      console.error('Analysis error:', err);
    }

    isAnalyzingRef.current = false;
  }, [isActive, voiceEnabled, addEvent]);

  // Keep runAnalysisRef current so the interval always calls the latest version
  useEffect(() => { runAnalysisRef.current = runAnalysis; }, [runAnalysis]);

  // ═══════════════════════════════════════
  // CONTROLS
  // ═══════════════════════════════════════
  const startAnalysis = useCallback(() => {
    if (analysisInterval) return;
    // Interval calls via ref — avoids stale closure on runAnalysis
    const interval = setInterval(() => runAnalysisRef.current?.(), 2000);
    setAnalysisInterval(interval);
    addEvent('NeoGuide analysis started', 'safe');
  }, [analysisInterval, addEvent]);

  const stopAnalysis = useCallback(() => {
    if (analysisInterval) {
      clearInterval(analysisInterval);
      setAnalysisInterval(null);
    }
    addEvent('Analysis paused', 'safe');
  }, [analysisInterval, addEvent]);

  // Preload voice alerts on mount
  useEffect(() => {
    preloadAlerts().catch(console.error);
  }, []);

  // Status driven by stable analysis (not raw) — prevents flicker
  const currentStatus = stableAnalysis?.safety_status || 'safe';
  const statusConfig = STATUS_CONFIG[currentStatus];

  // Animate vitals — values drift based on current safety status
  useEffect(() => {
    const id = setInterval(() => {
      setVitals(prev => {
        const danger = currentStatus === 'danger';
        const warning = currentStatus === 'warning';
        const spo2Target = danger ? 78 : warning ? 88 : 96;
        const hrTarget  = danger ? 85 : warning ? 115 : 142;
        const rrTarget  = danger ? 65 : warning ? 55 : 48;
        return {
          spo2:      Math.round(prev.spo2      + (spo2Target - prev.spo2)     * 0.12 + (Math.random() - 0.5) * 1.5),
          heartRate: Math.round(prev.heartRate + (hrTarget   - prev.heartRate) * 0.1  + (Math.random() - 0.5) * 3),
          respRate:  Math.round(prev.respRate  + (rrTarget   - prev.respRate)  * 0.1  + (Math.random() - 0.5) * 1),
        };
      });
    }, 900);
    return () => clearInterval(id);
  }, [currentStatus]);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (analysisInterval) clearInterval(analysisInterval);
    };
  }, [analysisInterval]);

  // ═══════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════
  return (
    <div style={styles.container}>
      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.logo}>
            <span style={{ color: '#06B6D4' }}>Neo</span>
            <span style={{ color: '#FFFFFF' }}>Guide</span>
          </h1>
          <span style={styles.tagline}>Neonatal Intubation Guidance System</span>
        </div>
        <div style={styles.headerRight}>
          <div style={{ ...styles.statusBadge, backgroundColor: statusConfig.color + '20', borderColor: statusConfig.color, boxShadow: statusConfig.glow }}>
            <div style={{ ...styles.statusDot, backgroundColor: statusConfig.color }} />
            <span style={{ color: statusConfig.color, fontWeight: 700, fontFamily: 'JetBrains Mono' }}>{statusConfig.label}</span>
          </div>
          <span style={styles.fpsCounter}>{fps} FPS</span>
        </div>
      </header>

      {/* MAIN GRID */}
      <div style={styles.grid}>
        {/* LEFT COLUMN: Camera + Controls */}
        <div style={styles.leftCol}>
          {/* Camera Feed */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelIcon}>📷</span>
              <span style={styles.panelTitle}>CAMERA FEED</span>
              <span style={{ ...styles.liveIndicator, opacity: isActive ? 1 : 0.3 }}>
                <span style={styles.liveDot} /> LIVE
              </span>
            </div>
            <div style={styles.cameraContainer}>
              <video
                ref={videoRef}
                style={styles.video}
                autoPlay
                playsInline
                muted
              />
              {!isActive && (
                <div style={styles.cameraOverlay}>
                  <span style={{ fontSize: 48 }}>📹</span>
                  <p style={{ color: '#94A3B8', marginTop: 12 }}>Camera not active</p>
                </div>
              )}
              {/* AI Detection Overlay */}
              {analysis?.success && analysis.image_quality !== 'no_airway_visible' && (
                <div style={styles.detectionOverlay}>
                  <span style={styles.overlayText}>
                    {analysis.guidance_message}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div style={styles.controlBar}>
            {!isActive ? (
              <button style={styles.btnPrimary} onClick={() => startCamera()}>
                ▶ Start Camera
              </button>
            ) : (
              <button style={styles.btnDanger} onClick={stopCamera}>
                ⏹ Stop Camera
              </button>
            )}
            {isActive && !analysisInterval && (
              <button style={styles.btnSuccess} onClick={startAnalysis}>
                🔍 Start Analysis
              </button>
            )}
            {analysisInterval && (
              <button style={styles.btnWarning} onClick={stopAnalysis}>
                ⏸ Pause Analysis
              </button>
            )}
            <button
              style={{ ...styles.btnSecondary, opacity: voiceEnabled ? 1 : 0.5 }}
              onClick={() => setVoiceEnabled(!voiceEnabled)}
            >
              {voiceEnabled ? '🔊' : '🔇'} Voice {voiceEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Landmark Detection Panel */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelIcon}>🔬</span>
              <span style={styles.panelTitle}>LANDMARK DETECTION</span>
            </div>
            <div style={styles.landmarkGrid}>
              {analysis?.landmarks && Object.entries(analysis.landmarks).map(([key, value]) => {
                const isEsophagus = key === 'esophagus';
                const activeColor = isEsophagus ? '#EF4444' : '#10B981';
                return (
                <div key={key} style={{
                  ...styles.landmarkItem,
                  borderColor: value.visible ? activeColor : '#334155',
                  backgroundColor: value.visible ? (isEsophagus ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.1)') : 'transparent',
                }}>
                  <span style={styles.landmarkName}>{key.replace(/_/g, ' ')}{isEsophagus && value.visible ? ' ⚠' : ''}</span>
                  <span style={{
                    ...styles.landmarkStatus,
                    color: value.visible ? activeColor : '#64748B',
                  }}>
                    {value.visible ? `✓ ${Math.round(value.confidence * 100)}%` : '—'}
                  </span>
                </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Depth Gauge */}
        <div style={styles.centerCol}>
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelIcon}>📏</span>
              <span style={styles.panelTitle}>DEPTH GAUGE</span>
            </div>
            <div style={styles.depthGauge}>
              {DEPTH_ZONES.map((zone) => {
                const isCurrentZone = stableAnalysis?.depth_zone === zone.id;
                return (
                  <div
                    key={zone.id}
                    style={{
                      ...styles.depthZone,
                      borderColor: isCurrentZone ? zone.color : '#1E293B',
                      backgroundColor: isCurrentZone ? zone.bgColor : 'transparent',
                      boxShadow: isCurrentZone ? `0 0 15px ${zone.color}33` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isCurrentZone && (
                        <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: zone.color, boxShadow: `0 0 8px ${zone.color}` }} />
                      )}
                      <span style={{ color: isCurrentZone ? zone.color : '#94A3B8', fontWeight: isCurrentZone ? 700 : 400, fontFamily: 'JetBrains Mono', fontSize: 13 }}>
                        {zone.label}
                      </span>
                    </div>
                    <span style={{ color: isCurrentZone ? zone.color : '#64748B', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
                      {zone.range}
                    </span>
                  </div>
                );
              })}
              
              {/* Depth readout */}
              <div style={styles.depthReadout}>
                <span style={{ color: '#94A3B8', fontSize: 12, fontFamily: 'JetBrains Mono' }}>EST. DEPTH</span>
                <span style={{ color: '#FFFFFF', fontSize: 32, fontWeight: 700, fontFamily: 'JetBrains Mono' }}>
                  {stableAnalysis?.estimated_depth_cm?.toFixed(1) || '0.0'}
                  <span style={{ fontSize: 16, color: '#64748B' }}> cm</span>
                </span>
              </div>
            </div>
          </div>

          {/* Vitals Panel */}
          <div style={styles.panel}>
            <div style={styles.panelHeader}>
              <span style={styles.panelIcon}>❤️</span>
              <span style={styles.panelTitle}>VITALS</span>
            </div>
            <div style={styles.vitalsGrid}>
              <div style={styles.vitalItem}>
                <span style={styles.vitalLabel}>SpO₂</span>
                <span style={{ ...styles.vitalValue, color: vitals.spo2 >= 90 ? '#10B981' : '#EF4444' }}>
                  {vitals.spo2}%
                </span>
              </div>
              <div style={styles.vitalItem}>
                <span style={styles.vitalLabel}>HR</span>
                <span style={{ ...styles.vitalValue, color: '#06B6D4' }}>
                  {vitals.heartRate}
                </span>
                <span style={styles.vitalUnit}>bpm</span>
              </div>
              <div style={styles.vitalItem}>
                <span style={styles.vitalLabel}>RR</span>
                <span style={{ ...styles.vitalValue, color: '#F59E0B' }}>
                  {vitals.respRate}
                </span>
                <span style={styles.vitalUnit}>/min</span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Event Log */}
        <div style={styles.rightCol}>
          <div style={{ ...styles.panel, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={styles.panelHeader}>
              <span style={styles.panelIcon}>📋</span>
              <span style={styles.panelTitle}>EVENT LOG</span>
              <span style={{ color: '#64748B', fontSize: 12, fontFamily: 'JetBrains Mono' }}>{eventLog.length} events</span>
            </div>
            <div style={styles.eventLog}>
              {eventLog.length === 0 ? (
                <p style={{ color: '#64748B', textAlign: 'center', marginTop: 40 }}>
                  Start camera and analysis to see events
                </p>
              ) : (
                eventLog.map((event, i) => (
                  <div key={i} style={{
                    ...styles.eventItem,
                    borderLeftColor: STATUS_CONFIG[event.status]?.color || '#64748B',
                  }}>
                    <span style={styles.eventTime}>{event.time}</span>
                    <span style={styles.eventMessage}>{event.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Guidance Message */}
          <div style={{
            ...styles.panel,
            borderColor: statusConfig.color + '44',
            background: `linear-gradient(135deg, ${statusConfig.color}08, ${statusConfig.color}03)`,
          }}>
            <div style={styles.panelHeader}>
              <span style={styles.panelIcon}>💬</span>
              <span style={styles.panelTitle}>AI GUIDANCE</span>
            </div>
            {analysis?.image_quality === 'no_airway_visible' && analysis?.identified_as && (
              <p style={{ color: '#F59E0B', fontSize: 12, fontFamily: 'JetBrains Mono', marginBottom: 8 }}>
                DETECTED: {analysis.identified_as}
              </p>
            )}
            <p style={{ color: '#E2E8F0', fontSize: 15, lineHeight: 1.5, margin: 0 }}>
              {analysis?.guidance_message || 'Awaiting camera feed and analysis...'}
            </p>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer style={styles.footer}>
        <span>NeoGuide v1.0 • Hacklytics 2026</span>
        <span>Powered by Gemini Vision + ElevenLabs</span>
        <span>Team: Stephen, Tylin, Min Young</span>
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════
// STYLES
// ═══════════════════════════════════════
const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#0A0F1C',
    color: '#E2E8F0',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    borderBottom: '1px solid #1E293B',
    background: 'linear-gradient(180deg, #0F172A 0%, #0A0F1C 100%)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 16 },
  logo: { margin: 0, fontSize: 28, fontWeight: 800, fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '-0.02em' },
  tagline: { color: '#64748B', fontSize: 13, fontFamily: 'JetBrains Mono' },
  statusBadge: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 16px', borderRadius: 8,
    border: '1px solid', fontSize: 13,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: '50%',
    animation: 'pulse 2s infinite',
  },
  fpsCounter: { color: '#64748B', fontSize: 12, fontFamily: 'JetBrains Mono' },

  grid: {
    display: 'grid',
    gridTemplateColumns: '1.4fr 0.8fr 1fr',
    gap: 16,
    padding: 16,
    flex: 1,
    minHeight: 0,
  },
  leftCol: { display: 'flex', flexDirection: 'column', gap: 16 },
  centerCol: { display: 'flex', flexDirection: 'column', gap: 16 },
  rightCol: { display: 'flex', flexDirection: 'column', gap: 16 },

  panel: {
    backgroundColor: '#0F172A',
    border: '1px solid #1E293B',
    borderRadius: 12,
    padding: 16,
    overflow: 'hidden',
  },
  panelHeader: {
    display: 'flex', alignItems: 'center', gap: 8,
    marginBottom: 12, paddingBottom: 8,
    borderBottom: '1px solid #1E293B',
  },
  panelIcon: { fontSize: 16 },
  panelTitle: { color: '#94A3B8', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', fontFamily: 'JetBrains Mono', flex: 1 },

  cameraContainer: {
    position: 'relative', width: '100%',
    aspectRatio: '4/3', backgroundColor: '#000',
    borderRadius: 8, overflow: 'hidden',
  },
  video: { width: '100%', height: '100%', objectFit: 'cover' },
  cameraOverlay: {
    position: 'absolute', inset: 0,
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  detectionOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '8px 12px',
    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
  },
  overlayText: {
    color: '#06B6D4', fontSize: 13, fontFamily: 'JetBrains Mono', fontWeight: 500,
  },
  liveIndicator: {
    display: 'flex', alignItems: 'center', gap: 4,
    color: '#EF4444', fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono',
  },
  liveDot: {
    width: 6, height: 6, borderRadius: '50%', backgroundColor: '#EF4444',
  },

  controlBar: {
    display: 'flex', gap: 8, flexWrap: 'wrap',
  },
  btnPrimary: {
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    backgroundColor: '#06B6D4', color: '#FFF', fontWeight: 600, fontSize: 13,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  btnDanger: {
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    backgroundColor: '#EF4444', color: '#FFF', fontWeight: 600, fontSize: 13,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  btnSuccess: {
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    backgroundColor: '#10B981', color: '#FFF', fontWeight: 600, fontSize: 13,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  btnWarning: {
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    backgroundColor: '#F59E0B', color: '#000', fontWeight: 600, fontSize: 13,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  btnSecondary: {
    padding: '8px 16px', borderRadius: 8, border: '1px solid #334155', cursor: 'pointer',
    backgroundColor: 'transparent', color: '#E2E8F0', fontWeight: 600, fontSize: 13,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },

  landmarkGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
  },
  landmarkItem: {
    padding: '8px 12px', borderRadius: 8, border: '1px solid #334155',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  landmarkName: { color: '#CBD5E1', fontSize: 12, fontFamily: 'JetBrains Mono', textTransform: 'capitalize' },
  landmarkStatus: { fontSize: 12, fontWeight: 600, fontFamily: 'JetBrains Mono' },

  depthGauge: { display: 'flex', flexDirection: 'column', gap: 6 },
  depthZone: {
    padding: '10px 12px', borderRadius: 8,
    border: '1px solid #1E293B',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    transition: 'all 0.3s ease',
  },
  depthReadout: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '16px 0', marginTop: 8,
    borderTop: '1px solid #1E293B',
  },

  vitalsGrid: { display: 'flex', gap: 12, justifyContent: 'space-around' },
  vitalItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 },
  vitalLabel: { color: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 600 },
  vitalValue: { fontSize: 28, fontWeight: 700, fontFamily: 'JetBrains Mono' },
  vitalUnit: { color: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono' },

  eventLog: {
    maxHeight: 400, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4,
    paddingRight: 4,
  },
  eventItem: {
    padding: '6px 10px', borderLeft: '3px solid',
    backgroundColor: 'rgba(15,23,42,0.5)', borderRadius: '0 6px 6px 0',
    display: 'flex', gap: 8, alignItems: 'flex-start',
  },
  eventTime: { color: '#64748B', fontSize: 11, fontFamily: 'JetBrains Mono', whiteSpace: 'nowrap' },
  eventMessage: { color: '#CBD5E1', fontSize: 12, lineHeight: 1.4 },

  footer: {
    display: 'flex', justifyContent: 'space-between',
    padding: '8px 24px', borderTop: '1px solid #1E293B',
    color: '#475569', fontSize: 11, fontFamily: 'JetBrains Mono',
  },
};
