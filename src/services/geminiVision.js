/**
 * NeoGuide - Gemini Vision Pipeline
 * 
 * Takes a camera frame (base64 image), sends it to Gemini Vision API,
 * and returns structured landmark detection data.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are NeoGuide, a neonatal intubation guidance AI system. You analyze laryngoscopy/endoscopy camera images to help doctors safely intubate newborn babies.

Analyze the provided image and identify anatomical structures visible during intubation. Return ONLY valid JSON (no markdown, no backticks, no explanation) in this exact format:

{
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
  "guidance_message": "Brief clinical guidance message",
  "estimated_depth_cm": 0.0,
  "image_quality": "good" | "fair" | "poor" | "no_airway_visible"
}

Depth zones and safety:
- pre_glottic (0-1cm): Approaching vocal cords → SAFE
- glottic (1-2cm): At vocal cords → SAFE  
- subglottic (2-3cm): Just past vocal cords → SAFE
- tracheal (3-5cm): Mid-trachea → SAFE (optimal placement zone for neonates)
- carinal (5-6cm): Approaching carina → WARNING
- bronchial (6+cm): Past carina, in bronchus → DANGER

If the image does not show an airway or is not a medical/laryngoscopy image, set image_quality to "no_airway_visible" and depth_zone to "unknown".`;

const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 500,
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
