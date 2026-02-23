# NeoGuide

**Smart Sensor-Guided Neonatal Intubation System**

*Hacklytics 2026 · Healthcare Track · Georgia Tech*

[![Open In Colab](https://colab.research.google.com/assets/colab-badge.svg)](YOUR_COLAB_LINK_HERE)

---

## The Problem

Nearly **half of all neonatal intubations fail** on the first attempt. Each failed attempt causes airway swelling and trauma, increasing the risk of severe complications — including brain bleeds, chronic lung disease, and death — by **6.7×**.

Current tools give clinicians a light and a blade. Nothing tells them where the tube is, how deep it has gone, or whether it is correctly placed.

## Our Solution

NeoGuide is a **real-time intubation guidance system** that combines computer vision, AI, and voice alerts to guide clinicians through neonatal intubation — a GPS for breathing tubes.

### Core Features

| Feature | Description |
|---------|-------------|
| Live Camera Feed | Camera on the stylet tip streams the airway in real time |
| AI Landmark Detection | Google Gemini Vision identifies anatomical structures (epiglottis, vocal cords, tracheal rings, carina, esophagus) |
| Depth Guidance | Color-coded depth gauge maps tube position across 7 clinical zones |
| Voice Alerts | ElevenLabs TTS provides hands-free spoken guidance with priority-based audio queuing |
| Safety Status | Majority-vote stability system suppresses AI hallucinations and flags danger states instantly |

## Tech Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React 18 + Vite | Real-time dashboard UI |
| AI Vision | Google Gemini 2.5 Flash | Anatomical landmark detection |
| Voice | ElevenLabs eleven_turbo_v2_5 | Real-time spoken clinical guidance |
| CV Model | TensorFlow Lite (MobileNetV3Small) | On-device glottis detection |
| Camera | Webcam via getUserMedia API | Simulated stylet camera feed |

## ML Model

We trained a custom **MobileNetV3Small** binary classification model on laryngoscopy images from the BAGLS benchmark dataset.

- **Dataset**: 3,500 expert-annotated laryngoscopy image pairs (7 hospitals)
- **Training**: Two-phase — frozen base feature extraction, then top-layer fine-tuning
- **Accuracy**: 94.9% on held-out test set
- **AUC**: 0.984
- **Exported size**: 1.19 MB (TensorFlow Lite with dynamic range quantization)

See the full training pipeline in the Colab notebook linked above.

## Quick Start

### Prerequisites

- Node.js 18+
- Gemini API key ([get one here](https://aistudio.google.com/))
- ElevenLabs API key ([get one here](https://elevenlabs.io/))

### Setup

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/neoguide.git
cd neoguide

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Add your API keys to .env

# Start development server
npm run dev
```

### Environment Variables

```
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
```

## How It Works

```
Webcam
  → Frame captured every 2 seconds via Canvas API
  → Sent to Gemini Vision API as base64 JPEG
  → Returns structured JSON (landmarks, depth zone, safety status)
  → Dashboard updates in real time (depth gauge, landmark grid, event log)
  → Landmark transition detected → ElevenLabs voice alert queued and played
```

**Depth Zones** (based on neonatal anatomy, Kempley et al. 2008):

| Zone | Depth | Status |
|------|-------|--------|
| Pre-Glottic | 0 cm | Safe — approaching cords |
| Glottic | 0.2 cm | Safe — at cord level |
| Sub-Glottic | 0.8 cm | Safe — just below cords |
| Tracheal | 2.0 cm | **Optimal — stop here** |
| Carinal | 3.5 cm | Warning — stop advancing |
| Bronchial | 4.5 cm | Danger — withdraw immediately |

## Project Structure

```
neoguide/
├── src/
│   ├── components/
│   │   └── Dashboard.jsx       # Main dashboard (camera, depth gauge, event log)
│   ├── services/
│   │   ├── geminiVision.js     # Gemini Vision API integration
│   │   └── voiceAlerts.js      # ElevenLabs TTS with priority queue
│   └── hooks/
│       └── useWebcam.js        # Webcam stream management
├── index.html
├── vite.config.js
└── package.json
```

## Datasets

| Dataset | Images | Description |
|---------|--------|-------------|
| BAGLS | 59,250 | Glottis segmentation, 7 hospitals |
| Laryngoscope8 | 3,057 | 8-class laryngeal classification |
| Vocal Folds | 536 | 7-class with intubation labels |
| NBI-InfFrames | 720 | Frame quality classification |
| CE-NBI | 1,320 | Tissue analysis |

---

*"Because every first attempt matters."*

**NeoGuide** · Hacklytics 2026
