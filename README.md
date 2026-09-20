# CMOS Inverter — Physical Layout Viewer

An interactive, CAD/EDA-style 3D viewer of a physical CMOS inverter layout, built with
[Three.js](https://threejs.org/). It's meant to feel like opening a semiconductor layout tool
and zooming into a single standard cell — not a schematic diagram, an actual (conceptual)
physical layout: substrate, N-well, source/drain diffusion, gate oxide, polysilicon, contacts
and Metal-1, all as real 3D geometry you can orbit, explode, section, and click into.

No build step, no framework, no bundler — just HTML, CSS and plain `<script>` files that run
directly in a browser (including opened straight off disk via `file://`).

---

## Features

- **Full physical CMOS inverter model** — PMOS in an N-well, NMOS in the P-substrate, a single
  continuous polysilicon strip forming both gates, gate oxide, discrete contacts (never metal
  touching silicon directly), and Metal-1 routing for VDD, GND, IN and OUT.
- **Explode view** — separates the process layers vertically to show how the stack is built.
- **Always-on 3-axis section scrub** (X / Y / Z clipping planes) to cut into the model from any
  direction, no mode switch required.
- **Physical Layout ⇄ Schematic toggle** — the schematic uses real PMOS/NMOS transistor symbols
  (not boxes), and every terminal/net in it is clickable and maps back to the corresponding 3D
  component.
- **Click-to-inspect** — clicking any component (in the 3D view, the schematic, or the
  architecture tree) highlights it and opens an anchored popover *and* the side Property
  Inspector with its function, electrical role, connections, physical relationships, doping
  concentration, and λ-scaled real-world dimensions.
- **λ (lambda) design-rule dimensions** — pick a process node (1000 nm down to 16 nm,
  illustrative) and every dimension (gate length, contact size, metal width/thickness, junction
  depth, etc.) is computed as a multiple of λ and shown in nm/µm.
- **IN = 0 / IN = 1 logical state** with an animated current/electron flow along whichever
  transistor is actually conducting, with a CURRENT ⇄ ELECTRONS direction toggle.
- **Mobile-first layout** — side panels are off-canvas drawers, the state badge collapses into a
  STATUS button, and the safe-area insets are respected so nothing hides under a phone's system
  UI.

Everything vertical is intentionally exaggerated for visibility — see the in-app disclaimer.
This is a conceptual, educational layout, not a fabrication-ready PDK cell.

## Getting started

There is no build step. Either:

1. **Just open it.** Double-click `index.html`, or drag it into a browser tab.
2. **Or serve it** (nicer for some browsers' local-file quirks):
   ```bash
   npx serve .
   # or
   python3 -m http.server 8000
   ```
   then visit `http://localhost:8000`.

Three.js (r128) and its `OrbitControls` addon are loaded from CDN (cdnjs / jsdelivr) — you'll
need an internet connection the first time, but nothing else needs installing.

## Project structure

```
cmos-inverter-viewer/
├── index.html                    Page shell: loads the stylesheet and every JS module in order
├── css/
│   └── style.css                 All styling — CAD-tool dark theme, drawers, popover, mobile rules
├── js/
│   ├── data.js                   Legend copy + per-component inspector text (pure data)
│   ├── scene.js                  Three.js bootstrap: scene, camera, renderer, controls, lights, grid
│   ├── geometry.js                Layout constants + the actual CMOS structure (substrate → metal)
│   ├── ui-panels.js               Architecture tree + layer/legend panel rendering
│   ├── selection.js               Property Inspector, the anchored popover, raycasting/selection
│   ├── controls-explode-scrub.js  Explode slider + the X/Y/Z section-scrub clipping planes
│   ├── dimensions.js              λ (lambda) design-rule presets and the dimension lookup table
│   ├── view-mode.js               Physical-layout ⇄ schematic toggle + camera Reset button
│   ├── flow.js                    Animated current/electron flow markers
│   ├── logic-state.js             IN = 0/1 state machine + the state badge
│   ├── render-loop.js             The requestAnimationFrame loop
│   └── main.js                    Panel drawers, VIEW CONTROLS/STATUS toggles, Reset-to-default,
│                                   and the final startup calls — load this one LAST
└── README.md
```

### Why plain `<script>` tags instead of ES modules?

So the page keeps working when opened directly from disk (`file://`), where `import`/`export`
across files is blocked by the browser's CORS rules unless you run a local server. The files are
still cleanly separated by concern — they just share the page's global scope, loaded in the
dependency order listed above. If you're extending this into something bigger and want real
modules, converting each file to `export`/`import` and adding `type="module"` to the script tags
is a mechanical change (see [Contributing](#contributing)).

## Extending it

The layout constants and construction logic all live in `js/geometry.js`, with everything
expressed in terms of a few named variables (`CH`, `SRC_X`/`DRN_X`, `PMOS_ZC`/`NMOS_ZC`, the `Y`
stack, `RAIL_Z`, etc.) rather than magic numbers, specifically so this single inverter can grow
into a small library of standard cells later — NAND, NOR, a MUX, an XOR, an SRAM cell, and
eventually something like a tiny FPGA CLB. If you build one of these, the shape to follow is:

1. Add any new mesh in `geometry.js` via the existing `box()` / `contactAt()` / `metalBar()`
   helpers, registering it with `reg(mesh, 'someId', 'layerKey')`.
2. Add its entry to `INFO` (and `LEGEND` if it's a new layer type) in `data.js`.
3. Add it to the `TREE` structure in `ui-panels.js` if it should show up in the architecture tree.
4. Add a `DIM_MAP` entry in `dimensions.js` if it has a meaningful λ-scaled dimension.

## Known limitations / conceptual simplifications

- Dimensions, spacing, and layer thicknesses are **not** design-rule compliant for any real
  fabrication process — they're chosen for visual clarity and scaled illustratively by λ.
- The current/electron flow animation is a **behavioral** visualization (which transistor is on,
  which direction charge/electrons conventionally move), not a transistor-level physical
  simulation.
- Only a single inverter is modeled today — no other standard cells yet (see above).

## Contributing

Issues and PRs are welcome — small, focused changes are easiest to review. A few ideas if you're
looking for somewhere to start:

- Another standard cell (NAND2 is probably the most natural next one, following the extension
  pattern above).
- A proper capped/solid cross-section render instead of `THREE.Plane` clipping (which leaves the
  cut faces hollow).
- Converting the module files to real ES modules for people who want to build on this with a
  bundler.
- Accessibility passes on the popover/drawers (focus trapping, keyboard dismiss).

Please keep the physical/electrical accuracy disclaimers intact if you touch the numbers — the
point of this project is to be honestly conceptual, not to imply fabrication-grade precision.

## License

MIT — see [LICENSE](LICENSE).

## Credits

Built by **Raydurg Anish** — [portfolio](https://raydurg-anish-portfolio-amta50oot-anish609609s-projects.vercel.app/)
· [GitHub](https://github.com/anish609609/cmos_inverter_cad)

Built with [Three.js](https://threejs.org/) and its `OrbitControls` example addon.
