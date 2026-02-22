/**
 * NeoGuide - ElevenLabs Voice Alert System
 * 
 * Provides real-time spoken guidance during intubation.
 * Hands-free, eyes-free alerts so clinicians stay focused on the airway.
 */

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY;
const VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // "Rachel" - clear, professional female voice
const API_URL = 'https://api.elevenlabs.io/v1';

// Audio queue to prevent overlapping alerts
let isPlaying = false;
const audioQueue = [];

// Cache for pre-generated alerts
const audioCache = new Map();

// Reference to currently playing audio element (for interruption)
let currentAudio = null;

// Alert definitions with priority levels
const ALERT_DEFINITIONS = {
  // Landmark detections
  epiglottis_detected: {
    text: 'Epiglottis detected. Advancing toward vocal cords.',
    priority: 1,
  },
  vocal_cords_detected: {
    text: 'Vocal cords detected. Align for insertion.',
    priority: 2,
  },
  entering_trachea: {
    text: 'Entering trachea. Advance to optimal depth.',
    priority: 2,
  },
  tracheal_rings_visible: {
    text: 'Tracheal rings visible. Tube in trachea.',
    priority: 1,
  },

  // Depth zone alerts
  optimal_depth: {
    text: 'Optimal depth reached. Safe to secure tube.',
    priority: 3,
  },
  warning_deep: {
    text: 'Warning. Approaching carina. Do not advance further.',
    priority: 4,
  },
  danger_bronchial: {
    text: 'Danger. Bronchial intubation detected. Withdraw immediately.',
    priority: 5,
  },

  // Safety alerts
  esophageal_warning: {
    text: 'Warning. Possible esophageal intubation. Verify placement.',
    priority: 5,
  },
  poor_image: {
    text: 'Poor image quality. Reposition camera.',
    priority: 1,
  },

  // Status
  system_ready: {
    text: 'NeoGuide active. Camera feed detected.',
    priority: 1,
  },
  placement_confirmed: {
    text: 'Tube placement confirmed. Monitoring active.',
    priority: 3,
  },
};

/**
 * Generate speech audio from text using ElevenLabs API
 * @param {string} text - Text to convert to speech
 * @returns {ArrayBuffer} Audio data
 */
async function generateSpeech(text) {
  const response = await fetch(`${API_URL}/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: {
        stability: 0.85,
        similarity_boost: 0.75,
        style: 0.1,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
  }

  return await response.arrayBuffer();
}

/**
 * Play audio from ArrayBuffer
 * @param {ArrayBuffer} audioData
 */
function playAudio(audioData) {
  // Stop whatever is currently playing before starting new audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  return new Promise((resolve, reject) => {
    const blob = new Blob([audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = 0.75;
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = (e) => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(e);
    };

    audio.play().catch(reject);
  });
}

/**
 * Immediately interrupt any current audio and speak an urgent alert.
 * Use for critical danger events (esophageal intubation, bronchial) where
 * every second counts — bypasses the queue entirely.
 * @param {string} alertKey - Key from ALERT_DEFINITIONS
 */
export async function speakUrgent(alertKey) {
  const alert = ALERT_DEFINITIONS[alertKey];
  if (!alert) return;

  // Seize control: clear queue and block normal playback immediately
  audioQueue.length = 0;
  isPlaying = true;

  // Stop current audio right away
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  let audioData = audioCache.get(alert.text);
  if (!audioData) {
    try {
      audioData = await generateSpeech(alert.text);
      audioCache.set(alert.text, audioData);
    } catch (e) {
      console.error('Urgent alert generation failed:', e);
      isPlaying = false;
      return;
    }
  }

  try {
    await playAudio(audioData);
  } catch (e) {
    console.error('Urgent alert playback failed:', e);
  }

  isPlaying = false;
  processQueue();
}

/**
 * Process the audio queue sequentially
 */
async function processQueue() {
  if (isPlaying || audioQueue.length === 0) return;

  isPlaying = true;

  // Sort by priority (higher = more urgent)
  audioQueue.sort((a, b) => b.priority - a.priority);

  const item = audioQueue.shift();

  try {
    let audioData;

    // Check cache first
    if (audioCache.has(item.text)) {
      audioData = audioCache.get(item.text);
    } else {
      audioData = await generateSpeech(item.text);
      audioCache.set(item.text, audioData);
    }

    await playAudio(audioData);
  } catch (error) {
    console.error('Voice alert error:', error);
  }

  isPlaying = false;
  processQueue(); // Process next in queue
}

/**
 * Speak a predefined alert
 * @param {string} alertKey - Key from ALERT_DEFINITIONS
 */
export function speakAlert(alertKey) {
  const alert = ALERT_DEFINITIONS[alertKey];
  if (!alert) {
    console.warn(`Unknown alert key: ${alertKey}`);
    return;
  }

  audioQueue.push({ text: alert.text, priority: alert.priority });
  processQueue();
}

/**
 * Speak custom text (for dynamic alerts)
 * @param {string} text - Custom text to speak
 * @param {number} priority - Priority level (1-5, 5 = most urgent)
 */
export function speakCustom(text, priority = 2) {
  audioQueue.push({ text, priority });
  processQueue();
}

/**
 * Pre-generate and cache common alerts for instant playback
 * Call this on app startup
 */
export async function preloadAlerts() {
  const criticalAlerts = [
    'vocal_cords_detected',
    'optimal_depth',
    'warning_deep',
    'danger_bronchial',
    'esophageal_warning',  // must be pre-cached for instant interrupt playback
    'system_ready',
  ];

  console.log('Pre-loading critical voice alerts...');

  for (const key of criticalAlerts) {
    try {
      const alert = ALERT_DEFINITIONS[key];
      const audioData = await generateSpeech(alert.text);
      audioCache.set(alert.text, audioData);
      console.log(`Cached: ${key}`);
    } catch (error) {
      console.error(`Failed to cache ${key}:`, error);
    }
  }

  console.log('Voice alerts pre-loaded!');
}

/**
 * Determine which alert to trigger based on Gemini analysis results
 * @param {Object} currentAnalysis - Current frame analysis from Gemini
 * @param {Object} previousAnalysis - Previous frame analysis
 * @returns {string|null} Alert key to trigger, or null
 */
export function determineAlert(currentAnalysis, previousAnalysis) {
  if (!currentAnalysis.success) return null;

  const curr = currentAnalysis;
  const prev = previousAnalysis;

  // Priority 1: Danger alerts — only on transition to avoid repeat spam
  if (curr.safety_status === 'danger') {
    if (curr.depth_zone === 'bronchial' && prev?.depth_zone !== 'bronchial') return 'danger_bronchial';
    if (curr.landmarks.esophagus?.visible && !prev?.landmarks?.esophagus?.visible) return 'esophageal_warning';
  }

  // Priority 2: Warning alerts
  if (curr.safety_status === 'warning' && prev?.safety_status !== 'warning') {
    return 'warning_deep';
  }

  // Priority 3: Positive confirmations (only on transitions)
  if (prev) {
    // Vocal cords just became visible
    if (curr.landmarks.vocal_cords?.visible && !prev.landmarks?.vocal_cords?.visible) {
      return 'vocal_cords_detected';
    }

    // Epiglottis just became visible
    if (curr.landmarks.epiglottis?.visible && !prev.landmarks?.epiglottis?.visible) {
      return 'epiglottis_detected';
    }

    // Entered trachea
    if (curr.depth_zone === 'tracheal' && prev.depth_zone !== 'tracheal') {
      return 'optimal_depth';
    }

    // Entered subglottic from glottic
    if (curr.depth_zone === 'subglottic' && prev.depth_zone === 'glottic') {
      return 'entering_trachea';
    }
  }

  // Image quality warning
  if (curr.image_quality === 'poor' && prev?.image_quality !== 'poor') {
    return 'poor_image';
  }

  return null;
}

/**
 * Stop all audio immediately and clear the queue.
 * Call this when analysis is paused/stopped.
 */
export function stopAllAudio() {
  audioQueue.length = 0;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  isPlaying = false;
}

export { ALERT_DEFINITIONS };
