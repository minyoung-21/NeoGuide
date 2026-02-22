/**
 * NeoGuide - Gemini Vision Pipeline
 * 
 * Takes a camera frame (base64 image), sends it to Gemini Vision API,
 * and returns structured landmark detection data.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are a medical image classifier for a neonatal intubation guidance system. Your job is to identify ALL visible anatomical structures — not just the most obvious one.

STEP 1 — Is this an airway image?
Is this a laryngoscopy or airway endoscopy showing the inside of a human airway (larynx, trachea)?
- YES → continue to Step 2
- NO → set image_quality to "no_airway_visible", all landmarks visible:false, set identified_as to what it actually is (e.g. "esophageal endoscopy", "stomach lining", "face", "room/object", "skin surface", etc.)

STEP 2 — Detect ALL landmarks independently.
Evaluate each landmark on its own — if one is unclear that does NOT make the whole image "no_airway_visible". Be thorough: report every structure you can see, even partially. The confidence score reflects how clearly visible it is (0.3 = partially visible, 0.7 = clearly visible, 0.9 = unmistakable).

What each landmark looks like:
- epiglottis: curved leaf/omega-shaped pinkish flap at the top of the frame, above the glottis. Present in pre-glottic views. Often the first structure seen on laryngoscopy.
- vocal_cords: two symmetric pale/white elongated folds forming a V or triangular opening. Very prominent white bands on either side of the dark glottic space.
- glottis: the dark triangular or oval opening between the vocal cords. Visible whenever vocal cords are seen.
- tracheal_rings: repeating pale horizontal C-shaped or arc-shaped cartilage bands lining the tracheal wall, like a ribbed tube or ladder pattern. Present in tracheal views below the cords.
- carina: a prominent Y-shaped or wedge-shaped ridge at the bottom of the trachea, dividing it into left and right bronchi.
- esophagus: a round/oval opening with reddish-pink fleshy walls and a collapsed slit-like lumen — this is NOT the airway, flag it if seen.

STEP 3 — Pick the depth zone based on which landmarks are visible:
- pre_glottic: epiglottis visible, approaching vocal cords → safe
- glottic: vocal cords and/or glottis clearly visible → safe
- subglottic: just passed the vocal cords, upper trachea, rings not yet visible → safe
- tracheal: tracheal rings visible → safe
- carinal: carina visible or approaching → warning
- bronchial: past carina, inside a bronchus → danger

Rules:
- Return ONLY valid JSON. No markdown, no backticks, no explanation text before or after.
- All 6 landmark keys must always be present.
- confidence must be a number, not a string.
- estimated_depth_cm must be a number.

Example (glottic view):
{"identified_as":"glottic view with vocal cords and glottis","landmarks":{"epiglottis":{"visible":false,"confidence":0.1},"vocal_cords":{"visible":true,"confidence":0.92},"tracheal_rings":{"visible":false,"confidence":0.05},"carina":{"visible":false,"confidence":0.0},"esophagus":{"visible":false,"confidence":0.0},"glottis":{"visible":true,"confidence":0.88}},"depth_zone":"glottic","safety_status":"safe","guidance_message":"Vocal cords and glottis clearly visible — advance tube through the glottis now.","estimated_depth_cm":0.5,"image_quality":"good"}

Schema:
{
  "identified_as": "brief description of all structures visible",
  "landmarks": {
    "epiglottis": { "visible": true/false, "confidence": 0.0-1.0 },
    "vocal_cords": { "visible": true/false, "confidence": 0.0-1.0 },
    "tracheal_rings": { "visible": true/false, "confidence": 0.0-1.0 },
    "carina": { "visible": true/false, "confidence": 0.0-1.0 },
    "esophagus": { "visible": true/false, "confidence": 0.0-1.0 },
    "glottis": { "visible": true/false, "confidence": 0.0-1.0 }
  },
  "depth_zone": "pre_glottic" | "glottic" | "subglottic" | "tracheal" | "carinal" | "bronchial" | "unknown",
  "safety_status": "safe" | "warning" | "danger",
  "guidance_message": "one sentence listing all structures seen and recommended action",
  "estimated_depth_cm": 0.0,
  "image_quality": "good" | "fair" | "poor" | "no_airway_visible"
}`;

// Scope position relative to vocal cords — neonatal reference values
// Term neonate (~3.5 kg): cords-to-carina ~4 cm; optimal ETT tip ~2 cm below cords
// Ref: Kempley et al., Arch Dis Child Fetal Neonatal Ed 2008; Donn & Sinha, Manual of Neonatal Respiratory Care
const ZONE_DEPTH_CM = {
  pre_glottic: 0.0,   // above cords, approaching
  glottic:     0.2,   // at cord level (neonatal glottis ~0.2 cm span)
  subglottic:  0.8,   // just below cords, upper trachea (0.5–1.5 cm)
  tracheal:    2.0,   // mid-trachea — optimal ETT tip for term neonate
  carinal:     3.5,   // near carina (~4 cm below cords in term neonate)
  bronchial:   4.5,   // past carina, inside bronchus — withdraw immediately
  unknown:     0.0,
};

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 1024,
  }
});

/**
 * Analyze a camera frame for anatomical landmarks
 * @param {string} base64Image - Base64 encoded image (without data URI prefix)
 * @param {string} mimeType - Image MIME type (e.g., 'image/jpeg', 'image/png')
 * @returns {Object} Structured landmark detection data
 */
export async function analyzeFrame(base64Image, mimeType = 'image/jpeg') {
  try {
    const result = await model.generateContent([
      SYSTEM_PROMPT,
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      },
    ]);

    const response = result.response;
    const text = response.text().trim();

    console.log('Gemini raw response:', text.substring(0, 200));

    // Clean up response - remove markdown backticks if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let data = null;

    // Approach 1: direct parse
    try {
      data = JSON.parse(cleaned);
    } catch (_) { }

    // Approach 2: regex extract first {...} block
    if (!data) {
      try {
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) data = JSON.parse(match[0]);
      } catch (_) { }
    }

    // Approach 3: fix trailing commas and single quotes, then parse
    if (!data) {
      try {
        const fixed = cleaned
          .replace(/,\s*([}\]])/g, '$1')   // remove trailing commas
          .replace(/'/g, '"');              // replace single quotes with double quotes
        const match = fixed.match(/\{[\s\S]*\}/);
        if (match) data = JSON.parse(match[0]);
      } catch (_) { }
    }

    // Approach 4: regex-extract individual fields as fallback
    if (!data) {
      const extract = (pattern, fallback) => {
        const m = cleaned.match(pattern);
        return m ? m[1] : fallback;
      };
      const extractFloat = (pattern, fallback) => {
        const m = cleaned.match(pattern);
        return m ? parseFloat(m[1]) : fallback;
      };
      const extractBool = (pattern) => {
        const m = cleaned.match(pattern);
        return m ? m[1].toLowerCase() === 'true' : false;
      };
      data = {
        depth_zone: extract(/"depth_zone"\s*:\s*"([^"]+)"/, 'unknown'),
        safety_status: extract(/"safety_status"\s*:\s*"([^"]+)"/, 'safe'),
        guidance_message: extract(/"guidance_message"\s*:\s*"([^"]+)"/, 'Unable to parse response'),
        estimated_depth_cm: extractFloat(/"estimated_depth_cm"\s*:\s*([\d.]+)/, 0),
        image_quality: extract(/"image_quality"\s*:\s*"([^"]+)"/, 'poor'),
        landmarks: {
          epiglottis: { visible: extractBool(/"epiglottis"[\s\S]*?"visible"\s*:\s*(true|false)/), confidence: 0 },
          vocal_cords: { visible: extractBool(/"vocal_cords"[\s\S]*?"visible"\s*:\s*(true|false)/), confidence: 0 },
          tracheal_rings: { visible: extractBool(/"tracheal_rings"[\s\S]*?"visible"\s*:\s*(true|false)/), confidence: 0 },
          carina: { visible: extractBool(/"carina"[\s\S]*?"visible"\s*:\s*(true|false)/), confidence: 0 },
          esophagus: { visible: extractBool(/"esophagus"[\s\S]*?"visible"\s*:\s*(true|false)/), confidence: 0 },
          glottis: { visible: extractBool(/"glottis"[\s\S]*?"visible"\s*:\s*(true|false)/), confidence: 0 },
        },
      };
    }

    // Safety net: if no airway visible, blank all airway landmarks (but keep esophagus)
    if (data.image_quality === 'no_airway_visible') {
      const esophagusResult = data.landmarks?.esophagus;
      const blank = { visible: false, confidence: 0 };
      data.landmarks = {
        epiglottis: blank, vocal_cords: blank, tracheal_rings: blank,
        carina: blank, glottis: blank,
        esophagus: esophagusResult || blank,
      };
      data.depth_zone = 'unknown';
      data.safety_status = 'safe';
      data.estimated_depth_cm = 0;
    }

    // Filter out very low-confidence detections (< 0.3) to reduce hallucinations
    if (data.landmarks) {
      for (const key of Object.keys(data.landmarks)) {
        if (data.landmarks[key].confidence < 0.3) {
          data.landmarks[key].visible = false;
        }
      }
    }

    // Override estimated_depth_cm with zone-derived value — Gemini's guesses are unreliable
    data.estimated_depth_cm = ZONE_DEPTH_CM[data.depth_zone] ?? 0;

    // Esophagus danger escalation — applies regardless of image_quality
    if (data.landmarks?.esophagus?.visible) {
      data.safety_status = 'danger';
      data.guidance_message = 'ESOPHAGEAL INTUBATION DETECTED — withdraw tube immediately and reposition.';
      data.depth_zone = 'unknown';
    }

    return {
      success: true,
      ...data,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.error('Gemini analysis error:', error);
    return {
      success: false,
      landmarks: {
        epiglottis: { visible: false, confidence: 0 },
        vocal_cords: { visible: false, confidence: 0 },
        tracheal_rings: { visible: false, confidence: 0 },
        carina: { visible: false, confidence: 0 },
        esophagus: { visible: false, confidence: 0 },
        glottis: { visible: false, confidence: 0 },
      },
      depth_zone: 'unknown',
      safety_status: 'safe',
      guidance_message: 'Awaiting camera feed...',
      estimated_depth_cm: 0,
      image_quality: 'poor',
      error: error.message,
      timestamp: Date.now(),
    };
  }
}

/**
 * Capture a frame from a video element as base64
 * @param {HTMLVideoElement} videoElement 
 * @returns {{ base64: string, mimeType: string }}
 */
export function captureFrame(videoElement) {
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth || 640;
  canvas.height = videoElement.videoHeight || 480;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  const base64 = dataUrl.split(',')[1];
  return { base64, mimeType: 'image/jpeg' };
}
