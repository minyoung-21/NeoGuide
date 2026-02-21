# NeoGuide — UI Design Guide

This document describes the visual design language, layout system, color palette, typography, animations, and UX principles for the NeoGuide dashboard. Follow these conventions when building or modifying UI.

## Design Philosophy

NeoGuide is a **clinical guidance tool**. The dashboard is a secondary reference — the doctor's primary feedback channel is **voice alerts** (their eyes stay on the airway, not the screen). This means:

- The UI must be **glanceable**: a quick look should communicate safety status, depth zone, and any active alerts.
- Information density is high but never cluttered. Every panel earns its screen space.
- Color is the fastest communication channel — status is always conveyed through color before text.

## Theme

The dashboard uses a **dark medical-grade aesthetic** — dark backgrounds with high-contrast elements and color-coded indicators.

### Core palette

| Token | Hex | Usage |
|---|---|---|
| Background (page) | `#0A0F1C` | `body` and main container background |
| Background (panels) | `#0F172A` | All card/panel backgrounds |
| Border | `#1E293B` | Panel borders, dividers, inactive zone borders |
| Text (primary) | `#E2E8F0` | Body text, guidance messages |
| Text (secondary) | `#CBD5E1` | Landmark names, event messages |
| Text (muted) | `#94A3B8` | Panel titles, depth zone labels (inactive) |
| Text (dim) | `#64748B` | Timestamps, units, tagline, FPS counter |
| Button border | `#334155` | Secondary/outline button borders, inactive landmark borders |

### Status colors

| Status | Hex | Used for |
|---|---|---|
| Safe | `#10B981` (emerald) | Safe status badge, safe-zone depth highlights, landmark "visible" indicators |
| Warning | `#F59E0B` (amber) | Warning badge, carinal zone highlight, warning button background |
| Danger | `#EF4444` (red) | Danger badge, bronchial zone, stop/danger buttons, LIVE indicator |
| Cyan accent | `#06B6D4` | "Neo" in logo, primary action buttons, pre-glottic zone, AI overlay text, heart rate vital |

### Depth zone colors

Each anatomical depth zone has its own color and a translucent background variant:

| Zone | Color | Background |
|---|---|---|
| Pre-Glottic (0-1 cm) | `#06B6D4` | `rgba(6,182,212,0.15)` |
| Glottic (1-2 cm) | `#10B981` | `rgba(16,185,129,0.15)` |
| Sub-Glottic (2-3 cm) | `#10B981` | `rgba(16,185,129,0.15)` |
| Tracheal (3-5 cm) | `#22C55E` | `rgba(34,197,94,0.2)` |
| Carinal (5-6 cm) | `#F59E0B` | `rgba(245,158,11,0.15)` |
| Bronchial (6+ cm) | `#EF4444` | `rgba(239,68,68,0.15)` |

The active zone gets its full color for text, a glowing dot indicator, a subtle `boxShadow`, and the translucent background fill. Inactive zones show muted text (`#94A3B8`) with no fill.

## Layout

### Page structure

```
┌─────────────────────────────────────────────────────────┐
│  HEADER: Logo | Tagline | Status Badge | FPS            │
├──────────────────┬──────────────┬───────────────────────┤
│  LEFT COLUMN     │ CENTER COL   │ RIGHT COLUMN          │
│  (1.4fr)         │ (0.8fr)      │ (1fr)                 │
│                  │              │                       │
│  Camera Feed     │ Depth Gauge  │ Event Log             │
│  Controls        │ Vitals       │ AI Guidance           │
│  Landmarks       │              │                       │
├──────────────────┴──────────────┴───────────────────────┤
│  FOOTER: Version | Powered by | Team                    │
└─────────────────────────────────────────────────────────┘
```

### Grid

The main content area uses CSS Grid:

```js
gridTemplateColumns: '1.4fr 0.8fr 1fr'
gap: 16
padding: 16
```

Each column is a flex container (`flexDirection: column`, `gap: 16`) stacking panels vertically.

### Panels

Every content section is wrapped in a **panel** — a rounded card with consistent styling:

```js
backgroundColor: '#0F172A',
border: '1px solid #1E293B',
borderRadius: 12,
padding: 16,
```

Each panel starts with a **panel header**: an icon (emoji), an uppercase label in `JetBrains Mono` at 11px, and optionally a right-aligned status element (like the LIVE indicator or event count).

## Typography

| Role | Font | Size | Weight | Color |
|---|---|---|---|---|
| Logo | Plus Jakarta Sans | 28px | 800 | Cyan (#06B6D4) + White |
| Tagline | JetBrains Mono | 13px | 400 | #64748B |
| Panel titles | JetBrains Mono | 11px | 700 | #94A3B8, letter-spacing 0.1em, uppercase |
| Body text | Plus Jakarta Sans | 15px | 400 | #E2E8F0 |
| Monospace values | JetBrains Mono | varies | 700 | Context-dependent |
| Depth readout | JetBrains Mono | 32px | 700 | White |
| Vital values | JetBrains Mono | 28px | 700 | Status-dependent |
| Vital labels | JetBrains Mono | 11px | 600 | #64748B |
| Event timestamps | JetBrains Mono | 11px | 400 | #64748B |
| Event messages | (inherited) | 12px | 400 | #CBD5E1 |
| Buttons | Plus Jakarta Sans | 13px | 600 | White or Black (on warning) |

**Two font families** are used throughout:
- **Plus Jakarta Sans** — primary UI font for headings, buttons, and body text.
- **JetBrains Mono** — monospace font for data values, labels, timestamps, and technical readouts.

These are expected to be available via Google Fonts or system fallback. They are referenced in inline styles but not explicitly imported in the codebase — ensure they are loaded (e.g., via a `<link>` tag in `index.html` or a CSS import).

## Buttons

Five button variants are defined:

| Variant | Background | Text | Use case |
|---|---|---|---|
| Primary | `#06B6D4` (cyan) | White | Start Camera |
| Success | `#10B981` (emerald) | White | Start Analysis |
| Warning | `#F59E0B` (amber) | Black | Pause Analysis |
| Danger | `#EF4444` (red) | White | Stop Camera |
| Secondary | Transparent, border `#334155` | `#E2E8F0` | Voice toggle |

All buttons share: `padding: 8px 16px`, `borderRadius: 8`, `fontSize: 13`, `fontWeight: 600`, `cursor: pointer`.

## Status Badge

The header status badge shows the current safety status:

- **SAFE**: Green text, green dot, green border, green glow (`rgba(16,185,129,0.4)`).
- **WARNING**: Amber text, amber dot, amber border, amber glow.
- **DANGER**: Red text, red dot, red border, red glow.

The dot inside the badge uses a CSS `pulse` animation (opacity 1 → 0.5 → 1, 2 seconds, infinite).

## Animations & Transitions

### Global animations (injected in `main.jsx`)

```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

Used by the status badge dot and the LIVE indicator.

### Depth zone transitions

Depth zones use `transition: all 0.3s ease` so border color, background color, and box-shadow animate smoothly when the active zone changes.

### Vitals animation

Vitals (SpO2, HR, RR) are not CSS-animated — they are **state-driven**. A `setInterval` every 900ms nudges values toward a target determined by the current safety status, with random jitter for realism:

- **Safe**: SpO2 → 96, HR → 142, RR → 48
- **Warning**: SpO2 → 88, HR → 115, RR → 55
- **Danger**: SpO2 → 78, HR → 85, RR → 65

### Custom scrollbar

The event log uses a thin custom scrollbar:

```css
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: #0F172A; }
::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #475569; }
```

## Key UI Panels

### Camera Feed (left column)

- 4:3 aspect ratio container with black background.
- Video element fills the container with `objectFit: cover`.
- When camera is off, a centered overlay shows a camera emoji and "Camera not active" text.
- When AI detects an airway, a gradient overlay at the bottom shows the `guidance_message` in cyan monospace text.
- A LIVE indicator (red dot + "LIVE" text) appears in the panel header when the camera is active.

### Depth Gauge (center column)

- Six stacked zone bars, each showing the zone label and depth range.
- The active zone is highlighted with its color (text, border, glow dot, background fill).
- Below the zones, a large numeric depth readout shows `estimated_depth_cm` at 32px.

### Landmark Detection (left column, below controls)

- 2-column grid of landmark cards.
- Each card shows the landmark name and either a green checkmark with confidence percentage (visible) or a muted dash (not visible).
- Visible landmarks get a green border and subtle green background fill.

### Vitals (center column, below depth gauge)

- Three vital readings displayed horizontally: SpO2 (green/red depending on value), HR (cyan), RR (amber).
- Large monospace numbers with small unit labels below.

### Event Log (right column)

- Scrollable list (max height 400px) of timestamped events, newest at top.
- Each event has a colored left border matching its status.
- Format: `HH:MM:SS  Event message text`.
- Maximum 50 entries retained.

### AI Guidance (right column, below event log)

- Panel with a subtle gradient background tinted by the current status color.
- Displays `analysis.guidance_message` as body text.
- When no analysis is running, shows "Awaiting camera feed and analysis..."

## UX Guidelines for New Features

1. **Color first, text second** — If something has a status, communicate it through color before (or instead of) a text label.
2. **Monospace for data** — Any numeric value, timestamp, or technical readout should use JetBrains Mono.
3. **Panels are the unit of composition** — New information goes in a new panel with the standard header pattern (icon + uppercase title).
4. **Don't obscure the camera feed** — It is the most important visual element. Overlays on the camera should be minimal and transparent.
5. **Test at 1920x1080** — The 3-column grid is designed for laptop/monitor screens. Responsive breakpoints have not been implemented yet.
6. **Dark backgrounds only** — Never use white or light backgrounds. The clinical environment may be dimly lit.
7. **No gratuitous animation** — Transitions should be subtle (0.3s ease). Avoid attention-grabbing motion that could distract a clinician.
