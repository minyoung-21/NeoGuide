# NeoGuide 🏥

**Smart Sensor-Guided Neonatal Intubation System**

*Hacklytics 2026 | Healthcare Track | Georgia Tech*

---

## The Problem

Nearly **half of all neonatal intubations fail** on the first attempt. Each failed attempt causes airway swelling and trauma, making subsequent attempts harder. Multiple attempts increase the risk of severe complications — including brain bleeds, chronic lung disease, and death — by **6.7×**.

Current tools give doctors a light and a blade. Nothing tells them *where* the tube is, *how deep* it's gone, or *whether it's in the right place*.

## Our Solution

NeoGuide is a **real-time intubation guidance system** that uses a camera, AI, and voice alerts to guide clinicians through neonatal intubation. Think of it as a **GPS for breathing tubes**.

### Core Features
- 🎥 **Live Camera Feed** — Camera on the stylet tip shows the airway in real-time
- 🧠 **AI Landmark Detection** — Google Gemini Vision identifies anatomical structures (vocal cords, epiglottis, tracheal rings, carina)
- 📏 **Depth Guidance** — Color-coded depth gauge shows exactly where the tube is
- 🔊 **Voice Alerts** — ElevenLabs TTS provides hands-free spoken guidance ("Vocal cords detected", "Optimal depth reached", "Warning — too deep")
- 📊 **3D Visualization** — Real-time 3D airway model showing tube position

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | React + Three.js | Dashboard UI, 3D airway visualization |
| AI Vision | Google Gemini API | Anatomical landmark detection |
| Voice | ElevenLabs TTS | Real-time spoken guidance |
| CV Model | TensorFlow Lite | On-device inference (Raspberry Pi) |
| Camera | Logitech Webcam | Simulated stylet camera |

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/neoguide.git
cd neoguide

# Install dependencies
npm install

# Create .env file with your API keys
cp .env.example .env
# Edit .env and add your Gemini and ElevenLabs API keys

# Start development server
npm run dev
```

### Environment Variables

Create a `.env` file in the root directory:

```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

## Project Structure

```
neoguide/
├── index.html              # Entry HTML
├── package.json            # Dependencies
├── vite.config.js          # Vite configuration
├── .env                    # API keys (not committed)
├── .gitignore
├── src/
│   ├── main.jsx            # App entry point
│   ├── components/
│   │   └── Dashboard.jsx   # Main dashboard component
│   ├── services/
│   │   ├── geminiVision.js # Gemini AI landmark detection
│   │   └── voiceAlerts.js  # ElevenLabs voice alert system
│   └── hooks/
│       └── useWebcam.js    # Webcam stream management
└── public/
```

## How It Works

```
Webcam → Browser captures frame → Gemini Vision API analyzes image
→ Returns JSON (landmarks, depth zone, safety status)
→ Dashboard updates (3D model, depth gauge, landmark detection)
→ If landmark transition detected → ElevenLabs speaks alert
```

1. **Camera Feed**: Logitech webcam captures live video via getUserMedia API
2. **AI Analysis**: Every 3 seconds, a frame is sent to Gemini Vision for landmark detection
3. **Voice Alerts**: When landmark transitions occur (e.g., vocal cords detected), ElevenLabs speaks an alert
4. **Dashboard**: React dashboard displays all data in real-time — camera feed, depth gauge, landmarks, vitals, event log

## Datasets

Trained on **64,883 expert-annotated medical images** from 5 public datasets:

| Dataset | Size | Source |
|---------|------|--------|
| BAGLS | 59,250 images | Glottis segmentation, 7 hospitals |
| Laryngoscope8 | 3,057 images | 8-class laryngeal classification |
| Vocal Folds | 536 images | 7-class with intubation labels |
| NBI-InfFrames | 720 images | Frame quality classification |
| CE-NBI | 1,320 images | Tissue analysis |

## Sponsor Prizes

- **Google Gemini** — Best Use of Gemini API (core AI pipeline)
- **ElevenLabs** — Best Use of ElevenLabs (clinical voice alerts)

## Team

- **Stephen Sookra** — Frontend, 3D visualization, Gemini integration, project lead
- **Tylin** — CV/AI model pipeline, TensorFlow Lite, Raspberry Pi
- **Min Young Park** — ElevenLabs integration, React components, demo flow

## Clinical Validation

Our solution is informed by real clinical experience — Stephen's sister works in healthcare and identified the core problem. Clinical feedback was gathered from practicing NICU physicians.

---

*"Because every first attempt matters."*

**NeoGuide** — Hacklytics 2026
