# NeoGuide — Implementation Guide

This document tells AI agents how to implement features in NeoGuide. It covers the patterns already in use, integration specifics for Gemini and ElevenLabs, and conventions to follow.

## Architecture Patterns

### Components (`src/components/`)

The app is a **single-page dashboard**. `Dashboard.jsx` is the only component today and it contains all the UI panels, state, and the analysis loop.

When adding a new visual section:

1. Create a new file in `src/components/` (e.g., `AirwayModel.jsx`).
2. Export a default function component.
3. Import and compose it inside `Dashboard.jsx`'s render tree.
4. Pass data down via props — the `analysis` state object is the primary data source for child components.

The Dashboard currently uses **inline style objects** (a `styles` constant at the bottom of the file). New components should follow the same pattern for consistency. See `Docs/UI.md` for the color and spacing system.

### Services (`src/services/`)

Services are **stateless modules** that wrap external API calls. They export pure async functions and never hold React state.

| Service | Exports | Talks to |
|---|---|---|
| `geminiVision.js` | `analyzeFrame()`, `captureFrame()` | Google Gemini Vision API |
| `voiceAlerts.js` | `speakAlert()`, `speakCustom()`, `preloadAlerts()`, `determineAlert()`, `ALERT_DEFINITIONS` | ElevenLabs REST API |

When adding a new external integration:

1. Create a new file in `src/services/`.
2. Read the API key from `import.meta.env.VITE_<KEY_NAME>`.
3. Export async functions that accept plain arguments and return structured data.
4. Handle errors with try/catch and return a safe default on failure (see `analyzeFrame`'s error return for the pattern).
5. Add the new env var to `.env.example`.

### Hooks (`src/hooks/`)

Custom hooks encapsulate **browser or device APIs** and expose a clean interface to components.

`useWebcam.js` is the reference implementation. It:

- Manages a `ref` for the `<video>` element.
- Handles `getUserMedia` permissions and errors.
- Provides `startCamera()` / `stopCamera()` callbacks.
- Cleans up the stream on unmount.

When adding a new hook:

1. Create a file in `src/hooks/` named `use<Thing>.js`.
2. Return an object with refs, state booleans, and callbacks.
3. Always clean up resources (streams, intervals, event listeners) in a `useEffect` return function.

## Gemini Vision Integration

### Model and configuration

- **Model**: `gemini-3-pro-preview` (set in `geminiVision.js` line 43)
- **Temperature**: 0.1 (low, for deterministic clinical output)
- **Max output tokens**: 1024

### Prompt structure

The system prompt (`SYSTEM_PROMPT` constant) instructs Gemini to:

1. Act as a neonatal intubation guidance AI.
2. Analyze the image for six anatomical landmarks: epiglottis, vocal cords, tracheal rings, carina, esophagus, glottis.
3. Return **only** valid JSON (no markdown, no explanation).
4. Include: `landmarks`, `depth_zone`, `safety_status`, `guidance_message`, `estimated_depth_cm`, `image_quality`.

When modifying the prompt:

- Always request JSON-only output — the parser depends on it.
- Keep the depth zone and safety status enums exactly as listed. The Dashboard and voice alert system match on these string values.
- If adding new fields, add them to the expected JSON schema in the prompt **and** handle them in the parse fallbacks.

### Response parsing

`analyzeFrame()` has a **four-level fallback chain** for parsing Gemini's response:

1. **Direct `JSON.parse`** on the cleaned text.
2. **Regex extract** the first `{...}` block, then parse.
3. **Fix common issues** (trailing commas, single quotes) then regex extract and parse.
4. **Field-by-field regex extraction** as a last resort — always returns a valid object.

This chain exists because Gemini occasionally wraps its response in markdown code fences or includes commentary. Never simplify this to a single parse call.

### Adding a new landmark

1. Add the landmark to the `landmarks` object in the `SYSTEM_PROMPT` JSON schema.
2. Add it to the Approach 4 fallback parser (the `data = { landmarks: { ... } }` block).
3. Add it to the error return object at the bottom of `analyzeFrame()`.
4. The Dashboard `landmarkGrid` renders all keys from `analysis.landmarks` automatically — no Dashboard change needed.

## Voice Alert Integration

### How alerts work

1. `determineAlert(current, previous)` in `voiceAlerts.js` compares two consecutive analysis results.
2. If a meaningful **transition** occurred (e.g., vocal cords newly visible, depth zone changed, safety status escalated), it returns an alert key string.
3. `speakAlert(key)` looks up the key in `ALERT_DEFINITIONS`, pushes it onto the audio queue with its priority, and starts processing.
4. The queue processes items **sequentially**, sorted by priority (higher number = more urgent). Audio is generated via the ElevenLabs REST API and played through an `<audio>` element.
5. Generated audio is cached in a `Map` so repeat alerts play instantly.

### Alert priority levels

| Priority | Meaning | Examples |
|---|---|---|
| 1 | Informational | Epiglottis detected, tracheal rings visible, poor image quality |
| 2 | Navigational | Vocal cords detected, entering trachea |
| 3 | Confirmation | Optimal depth reached, placement confirmed |
| 4 | Warning | Approaching carina |
| 5 | Critical/Danger | Bronchial intubation, esophageal intubation |

### Adding a new voice alert

1. Add an entry to `ALERT_DEFINITIONS` in `voiceAlerts.js`:
   ```js
   new_alert_key: {
     text: 'The spoken text for this alert.',
     priority: 2,  // choose 1-5
   },
   ```
2. Add trigger logic to `determineAlert()`. Alerts should fire on **transitions only** — compare `curr` vs `prev` to avoid repeating the same alert every 3 seconds.
3. If the alert is critical and should play with zero latency, add its key to the `criticalAlerts` array inside `preloadAlerts()`.

### ElevenLabs specifics

- **Voice**: Rachel (`21m00Tcm4TlvDq8ikWAM`) — clear, professional female voice.
- **Model**: `eleven_turbo_v2_5` — fastest available model.
- **Voice settings**: stability 0.85, similarity boost 0.75, style 0.1, speaker boost on.
- The codebase calls the ElevenLabs REST API directly via `fetch()` rather than using the `elevenlabs` npm package. The package is listed in `package.json` but unused in the current code.

## State Management

All application state lives in `Dashboard.jsx` as local React state (`useState`):

| State variable | Type | Purpose |
|---|---|---|
| `analysis` | Object or null | Latest Gemini analysis result |
| `eventLog` | Array | Timestamped event entries (max 50, newest first) |
| `isAnalyzing` | Boolean | Guards against overlapping analysis calls |
| `analysisInterval` | Number or null | `setInterval` ID for the 3-second loop |
| `voiceEnabled` | Boolean | Whether voice alerts are active |
| `voiceStatus` | String | Key of the last triggered alert |
| `alertsPreloaded` | Boolean | Whether critical alerts have been cached |
| `fps` | Number | Frames analyzed per second |
| `vitals` | Object | `{ spo2, heartRate, respRate }` — animated values |

`analysisRef` (`useRef`) holds the previous analysis result for transition detection. It is updated in the same callback as `setAnalysis`.

There is **no global state store** (no Redux, Zustand, Context, etc.). Keep it that way unless the component tree becomes deeply nested and prop-drilling becomes painful. If a global store becomes necessary, prefer Zustand for its simplicity.

## Environment Variables

All env vars **must** be prefixed with `VITE_` to be accessible in browser code (Vite requirement).

Access pattern:
```js
const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
```

When adding a new integration that needs a key:

1. Add `VITE_<SERVICE>_API_KEY=` to `.env.example`.
2. Add the actual key to `.env` (never committed).
3. Access it via `import.meta.env.VITE_<SERVICE>_API_KEY` in the service file.

## General Conventions

- **File naming**: Components use PascalCase (`Dashboard.jsx`). Hooks use camelCase with `use` prefix (`useWebcam.js`). Services use camelCase (`geminiVision.js`).
- **Exports**: Components use `export default`. Services and hooks use named exports.
- **Error handling**: try/catch with `console.error` and a descriptive prefix string. Return safe defaults — never let an API failure crash the UI.
- **No TypeScript**: The codebase is plain JSX. `@types/react` is installed for IDE support only. Do not convert files to `.tsx` unless explicitly asked.
- **Analysis interval**: 3 seconds. This is a balance between responsiveness and API rate limits. Do not reduce it below 2 seconds without considering Gemini quota.
