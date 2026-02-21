# NeoGuide — Bug Tracking & Debugging Guide

This document is for AI agents working on NeoGuide. It explains the critical data flow, where bugs typically surface, and how to diagnose them systematically.

## Critical Data Flow (the "happy path")

Every user-facing behavior in NeoGuide flows through this pipeline:

```
Webcam (getUserMedia)
  → useWebcam.js (stream lifecycle)
    → captureFrame() in geminiVision.js (video → base64 JPEG)
      → analyzeFrame() in geminiVision.js (Gemini API call → JSON)
        → Dashboard.jsx state update (setAnalysis)
          → determineAlert() in voiceAlerts.js (transition logic)
            → speakAlert() → ElevenLabs TTS → audio playback
```

Bugs almost always appear at the **handoff points** between these stages. When triaging an issue, identify which stage is broken before making changes.

## Debugging by Symptom

### No video feed / camera not starting

1. Check `src/hooks/useWebcam.js` — the `startCamera()` function calls `navigator.mediaDevices.getUserMedia`. If permissions are denied, the error is caught and stored in the `error` state.
2. Look for `"Camera error:"` in the browser console (logged at line 55 of `useWebcam.js`).
3. Verify the `<video>` element ref is wired correctly in `Dashboard.jsx` — `videoRef` must be passed to the `<video ref={videoRef}>` tag.
4. On some systems `enumerateDevices()` returns an empty list until the user grants permission at least once. This is expected browser behavior, not a bug.

### Camera works but no AI analysis results

1. Confirm the analysis loop is actually running. `Dashboard.jsx` uses `setInterval(runAnalysis, 3000)` — check whether `startAnalysis()` was called (it is a separate button from "Start Camera").
2. Check the `VITE_GEMINI_API_KEY` in `.env`. If it is missing or invalid, `analyzeFrame()` will throw and the catch block logs `"Gemini analysis error:"` to the console.
3. Check `captureFrame()` — it draws the video element onto a temporary canvas. If `videoElement.videoWidth` is 0 (camera not ready yet), the captured frame is blank and Gemini returns `image_quality: "no_airway_visible"`.
4. Check the Gemini response parsing chain in `geminiVision.js` (lines 78–131). There are four fallback approaches. If all four fail, the field-extraction fallback (Approach 4) always returns *something*, so a total parse failure usually means Gemini returned a non-JSON error message — look at the `"Gemini raw response:"` console log.

### AI results appear but voice alerts never fire

1. Voice must be enabled — `voiceEnabled` state in `Dashboard.jsx` defaults to `true`, but the user can toggle it. Check the button state.
2. `determineAlert()` in `voiceAlerts.js` only returns an alert key on **transitions** (e.g., vocal cords becoming visible for the first time, or entering a new depth zone). If the same analysis result repeats, no alert fires. This is intentional.
3. Check `VITE_ELEVENLABS_API_KEY` in `.env`. If invalid, `generateSpeech()` throws and the error is logged as `"Voice alert error:"`.
4. The audio queue (`audioQueue` array in `voiceAlerts.js`) processes items sequentially. If `isPlaying` gets stuck as `true` (e.g., an audio element never fires `onended`), the entire queue stalls. Look for this if alerts play once and then stop.
5. Browser autoplay policies can block the first `audio.play()` call if there has been no user interaction. Clicking any button on the dashboard (like "Start Camera") satisfies this requirement.

### Dashboard UI not updating / stale state

1. The analysis result is stored in `analysis` state via `setAnalysis(result)` in `Dashboard.jsx`. If the UI is not updating, verify that `result.success` is `true` — many UI elements are gated behind `analysis?.success`.
2. `analysisRef.current` is used to track the *previous* result for transition detection. If it is not being updated (line 67), `determineAlert()` will misbehave.
3. The vitals panel is driven by a separate `setInterval` (every 900ms) that drifts toward target values based on `currentStatus`. If vitals appear frozen, check that the interval cleanup is not running prematurely.

### Build / dev server issues

1. `npm run dev` starts Vite on port 3000 with auto-open. If port 3000 is occupied, Vite picks the next available port — check the terminal output.
2. Environment variables must be prefixed with `VITE_` for Vite to expose them to client code. A variable named `GEMINI_API_KEY` (without the prefix) will be `undefined` at runtime.
3. If `npm install` fails, delete `node_modules` and `package-lock.json` and retry.

## Error Handling Conventions

- The codebase uses **try/catch with `console.error`** throughout. Never swallow errors silently — always log them.
- Service functions (`analyzeFrame`, `generateSpeech`) return a structured error object on failure rather than throwing to the caller. `analyzeFrame` returns `{ success: false, error: error.message, ... }`.
- The Dashboard catch block (line 89–91) logs `"Analysis error:"` and then sets `isAnalyzing = false` so the interval can retry on the next tick.
- When adding new error handling, follow the same pattern: catch, log with a descriptive prefix, and return a safe default so the UI does not crash.

## Console Log Reference

| Log message | Source file | Meaning |
|---|---|---|
| `"Gemini raw response: ..."` | `geminiVision.js:71` | First 200 chars of Gemini's reply — useful for debugging parse failures |
| `"Gemini analysis error: ..."` | `geminiVision.js:139` | The API call or parsing threw an exception |
| `"Camera error: ..."` | `useWebcam.js:55` | getUserMedia failed (permissions, device not found, etc.) |
| `"Error enumerating devices: ..."` | `useWebcam.js:25` | Could not list video devices |
| `"Voice alert error: ..."` | `voiceAlerts.js:155` | ElevenLabs API call or audio playback failed |
| `"Unknown alert key: ..."` | `voiceAlerts.js:169` | `speakAlert()` called with a key not in `ALERT_DEFINITIONS` |
| `"Pre-loading critical voice alerts..."` | `voiceAlerts.js:200` | App startup — caching common alerts |
| `"Cached: ..."` | `voiceAlerts.js:207` | A single alert was successfully pre-cached |
| `"Failed to cache ...: ..."` | `voiceAlerts.js:209` | Pre-caching failed for one alert (API key issue or network) |

## Pre-flight Checklist

Before investigating any bug, verify these basics first:

1. `.env` exists in the project root with both `VITE_GEMINI_API_KEY` and `VITE_ELEVENLABS_API_KEY` set.
2. `npm install` has been run (check for `node_modules/` existence).
3. The dev server is running (`npm run dev`).
4. The browser has granted camera permissions.
5. The user has clicked "Start Camera" **and** "Start Analysis" (these are separate actions).
