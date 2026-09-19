# CMOS Inverter — 3D Physical Layout Viewer

A self-contained, single-file 3D CAD/EDA-style visualization of a CMOS inverter's
physical semiconductor layout, built with Three.js (loaded via CDN — no build
step, no npm install required).

## How to run it

**Option 1 — just double-click it**
Open `index.html` directly in a modern browser (Chrome, Firefox, Edge, Safari).
It loads Three.js and OrbitControls from CDN, so you need an internet
connection the first time (nothing is installed locally).

**Option 2 — serve it locally (recommended)**
Some browsers restrict certain features when opening files via `file://`.
If anything looks off, serve the folder locally instead:

```bash
# Python 3
python3 -m http.server 8000
# then open http://localhost:8000/index.html

# or Node.js
npx serve .
```

## What's inside
- `index.html` — everything: HTML structure, CSS, and all JavaScript
  (Three.js scene setup, geometry construction, UI wiring) in one file.
- No build tools, bundlers, or package.json needed — it's plain JS (ES5-style,
  no JSX/TypeScript compilation step) that runs directly in the browser.

## Features
- Physical 3D layer stack: substrate, N-well, active/diffusion, gate oxide,
  polysilicon, contacts, Metal-1
- Explode view, layer visibility toggles, cross-section clipping plane
- Click-to-inspect any component (function, electrical role, connections,
  doping concentration, λ-scaled dimensions)
- Schematic view with real NMOS/PMOS transistor symbols, cross-linked to the
  3D model (click a schematic terminal to jump to and highlight it in 3D)
- IN = 0/1 logic toggle with animated conventional-current / electron-flow
  visualization
- Architecture tree, EDA-style legend, λ (lambda) design-rule dimension panel

## Editing
It's one HTML file — open it in any text editor / VS Code and edit directly.
The JS is organized in commented sections (LAYOUT CONSTANTS, SUBSTRATE,
N-WELL, ACTIVE/DIFFUSION, POLYSILICON, CONTACTS, METAL-1, LABELS, SELECTION,
EXPLODE, CROSS SECTION, DIMENSIONS, SCHEMATIC MODE, CONNECTIONS, IN STATE,
RENDER LOOP) if you want to extend it — e.g. toward NAND/NOR/standard cells,
as noted in the original spec this was built from.

## Dependencies (all loaded via CDN, pinned versions)
- three.js r128 — https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js
- OrbitControls (matching r128) — https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js
- IBM Plex Mono / Inter fonts — Google Fonts
