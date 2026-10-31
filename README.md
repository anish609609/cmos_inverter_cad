# CMOS Inverter — Physical Layout & Fabrication CAD Viewer

An interactive, CAD/EDA-style 3D semiconductor layout viewer and fabrication tour of a physical CMOS inverter cell, built with [Three.js](https://threejs.org/) and powered by **Sarvam AI Bulbul v4 Flash** for real-time multilingual voice tutoring.

Designed to feel like opening an advanced semiconductor layout editor and zooming into a single standard cell — not an abstract schematic diagram, but an actual physical CMOS layout featuring substrate, wells, SDE/LDD extensions, high-K metal gate stack, polysilicon, tungsten contacts, and Metal-1 routing, all as real 3D geometry you can orbit, explode, section-scrub, and inspect.

**Zero build step, zero framework dependencies, zero bundlers** — written in pure HTML5, modern CSS, and vanilla JavaScript that runs directly in any browser (including opening straight off disk via `file://`).

---

## 🌟 Highlights & Key Features

### 🔬 1. Realistic CMOS Architecture & Physical Stack
- **Full Physical Standard Cell Model**:
  - **P-Substrate & N-Well**: Physical isolation territories for NMOS and PMOS devices.
  - **Source/Drain Diffusion with SDE / LDD**: Features lightly doped drain ($P^+$ and $N^+$ SDE) extensions adjacent to the channel to suppress short-channel effects (DIBL and hot-carrier injection).
  - **High-K Metal Gate Dielectric Stack**: Ultra-thin silicon dioxide ($SiO_2$) interfacial layer paired with a hafnium oxide ($HfO_2$) high-K dielectric to boost gate capacitance ($C_{ox}$) and suppress quantum tunneling leakage.
  - **Common Polysilicon Gate**: Single continuous polysilicon runner spanning both PMOS and NMOS channels.
  - **Discrete Tungsten Contacts**: 5 vertical contact vias (never metal touching raw silicon directly).
  - **Metal-1 Routing**: VDD rail, GND rail, IN gate feed, and shared drain OUT spine.
- **$\lambda$ (Lambda) Design-Rule Scaling**: Select scalable process nodes ($1000\,\text{nm}$ down to $16\,\text{nm}$) to view true physical dimensions in nanometers/micrometers based on Mead–Conway style design rules.

### 🎙️ 2. AI Voice Tutor (Powered by Sarvam AI Bulbul v4 Flash)
- **Interactive Multi-Language Voice Assistant**: Ask contextual questions via voice or text and receive natural spoken explanations.
- **Multilingual Support**: Real-time speech synthesis in **English (`en-IN`)**, **Hindi (`hi-IN`)**, and **Telugu (`te-IN`)**.
- **Voice Personas**: Choose from tailored personas including Aparna (EdTech Tutor / Companion), Shubh (Conversational), Ritu (Casual), and Kavitha (Narration).
- **Context-Aware Prompt Injection**: Automatically injects currently selected component properties, doping profiles, electrical roles, $\lambda$ dimensions, and circuit logic states into queries.
- **Live Waveform Visualizer & Speech Recognition**: Integrated Web Speech API microphone input with silence debounce, audio playback queue, and dynamic frequency visualizer bars.
- **Privacy-First Client API Management**: Enter your own Sarvam AI subscription key stored locally with optional auto-delete on session exit. Zero backend storage or transmission.

### 🎬 3. Step-by-Step 3D Fabrication Tour (`[▶ PLAY TOUR]`)
- **Cinematic Lithography Drop-In Assembly**: Watch the inverter get built layer-by-layer from bare silicon substrate to top-level metal interconnects.
- **Event-Driven Audio Synchronization**: Synchronized with Sarvam AI voiceovers using HTML5 `Audio.onended` events (no fixed timers, zero mid-sentence cutoffs).
- **Zero-Lag Background Pre-Fetching**: Pre-fetches subsequent narration steps while the current step plays to eliminate network delays.
- **Interactive Playback Controls**: Full support for `[▶ PLAY]`, `[⏸ PAUSE]`, `[▶ RESUME]`, and `[↺ REPLAY]`.
- **Synchronized UI Highlight**: Dynamically updates the Architecture Tree, checks Layer Visibility, and loads the Property Inspector at each stage.
- **Clean Focus Mode**: Automatically suppresses flow arrows and drawer toggles during playback for an unobstructed visual experience.

### 🕹️ 4. View Controls, 3-Axis Explode & Scrubbing
- **Independent 3-Axis Explode**: Separate sliders for **EXPLODE X**, **EXPLODE Y**, and **EXPLODE Z** to expand the cell along any axis without clipping out of view.
- **Real-Time 3-Axis Section Scrub**: Dynamic clipping planes (**SCRUB X**, **SCRUB Y**, **SCRUB Z**) to cut into the 3D model and reveal internal cross-sections.
- **Physical Layout ⇄ Schematic View**: Interactive transistor-level schematic overlay (PMOS bubble, NMOS gate, nets) with bidirectional cross-probing back into 3D geometry.

### ⚡ 5. Logic State & Conduction Simulation
- **Three Input States**:
  - `IN = 0`: PMOS ON, NMOS OFF $\rightarrow$ Output pulled HIGH to VDD.
  - `IN = 1`: PMOS OFF, NMOS ON $\rightarrow$ Output pulled LOW to GND.
  - `IN = OFF`: High-Z floating gate state displaying shoot-through leakage path.
- **Animated Flow Particles**: Switch between **Conventional Current** and **Electron Flow** directions along conducting channels.
- **Live Status Badge**: Real-time HUD showing terminal voltages, transistor operating states, and inverter truth tables.

### 🎨 6. Dark / Light EDA Theme Engine
- **CAD Dark Mode**: Default sleek obsidian theme optimized for EDA visualization.
- **High-Contrast Light Mode**: Clean, bright theme with adaptive wireframes and canvas grid contrast.
- Remembers preferences via `localStorage` and respects system `prefers-color-scheme`.

---

## 🛠️ Getting Started

### Option 1: Direct File Launch (No Server Needed)
Double-click `index.html` or drag it into any modern web browser (Chrome, Edge, Firefox, Safari).

### Option 2: Local HTTP Server
If your browser restricts local file features or you prefer serving over HTTP:
```bash
# Using Node.js npx
npx serve .

# Using Python 3
python -m http.server 8000
```
Open `http://localhost:8000` in your browser.

> **Dependencies**: [Three.js](https://threejs.org/) (r128) and `OrbitControls` are loaded automatically via CDN.

---

## 🔑 Sarvam AI Voice Assistant Setup

To enable the AI Voice Tutor and narration during the fabrication tour:
1. Sign up or log in at [https://dashboard.sarvam.ai](https://dashboard.sarvam.ai).
2. Go to **API Keys** and generate an API subscription key.
3. Click the **AI Voice Tutor FAB** (microphone button at bottom-right) or `[▶ PLAY TOUR]`.
4. Paste your API key into the modal and click **Save & Test Voice**.
5. *Privacy Assurance*: Keys are stored exclusively in your browser's `localStorage` and deleted automatically on tab close if "session-only" is selected.

---

## 🏗️ CMOS Fabrication Sequence (Tour Steps)

The step-by-step assembly follows the standard planar CMOS lithography process:

| Step | Layer / Structure | Physical & Electrical Function |
|:---:|:---|:---|
| **1** | **P-Substrate** | Foundational p-type bulk silicon substrate accommodating the NMOS transistor. |
| **2** | **Wells (N-Well & P-Well)** | Deep n-type diffusion providing electrical body isolation for PMOS devices. |
| **3** | **Active & SDE Diffusion** | $P^+$ and $N^+$ source/drain implantations with Lightly Doped Drains (SDE). |
| **4** | **Gate Oxide ($SiO_2$)** | Thermally grown ultra-thin dielectric insulating gate from the conduction channel. |
| **5** | **High-K Dielectric ($HfO_2$)** | Hafnium oxide layer boosting gate capacitance and halting quantum tunneling. |
| **6** | **Polysilicon Gate** | Heavy n-doped continuous polysilicon runner forming the common gate. |
| **7** | **Tungsten Contacts** | Vertical contact plugs connecting active silicon and poly to metallization. |
| **8** | **Metal-1 Interconnects** | Patterned aluminium/copper routing for VDD, GND, IN, and OUT terminals. |

---

## 📂 Project Architecture

```
cmos_inverter_CAD/
├── index.html                    # Main HTML shell, HUD layouts, modals, and script includes
├── css/
│   └── style.css                 # EDA dark/light theme, glassmorphic HUDs, responsive layout
├── js/
│   ├── scene.js                  # Three.js scene, camera, renderer, lighting, and ground grid
│   ├── theme.js                  # Dark/light theme switcher with persistent storage
│   ├── geometry.js               # Parametric 3D CMOS geometry (substrate → metal + high-K & SDE)
│   ├── data.js                   # Component metadata, doping, physical roles, and legend definitions
│   ├── dimensions.js             # λ (lambda) design-rule scaling engine and dimension tables
│   ├── controls-explode-scrub.js # 3-axis Explode (X/Y/Z) and 3-axis Section Scrubbing (clipping)
│   ├── ui-panels.js              # Architecture tree rendering and layer visibility checkboxes
│   ├── selection.js              # Raycasting, 3D component highlighting, and Property Inspector
│   ├── view-mode.js              # Physical 3D Layout ⇄ 2D Schematic view mode switcher
│   ├── logic-state.js            # Circuit state machine (IN = 0, 1, OFF) and truth table HUD
│   ├── flow.js                   # Animated current and electron flow curves & markers
│   ├── build-anim.js             # Fabrication tour runner, drop-in tweens, and Sarvam audio sync
│   ├── voice-assistant.js        # Sarvam AI Voice Tutor widget, STT/TTS engine, and API modal
│   ├── render-loop.js            # Central requestAnimationFrame render & animation tick loop
│   └── main.js                   # Initialization, responsive drawer toggles, and event binding
└── README.md                     # Comprehensive documentation
```

---

## 📐 Lambda ($\lambda$) Design Rules

This application implements an illustrative **Mead–Conway scalable design-rule system**:
- Channel Length ($L$): $2\lambda$
- PMOS Channel Width ($W_p$): $8\lambda$ (scaled up for hole mobility balance)
- NMOS Channel Width ($W_n$): $4\lambda$
- Contact Size: $2\lambda \times 2\lambda$
- Metal-1 Wire Width: $3\lambda$
- Poly Gate Overhang: $2\lambda$

Selecting a technology node ($1000\,\text{nm}$, $500\,\text{nm}$, $350\,\text{nm}$, $250\,\text{nm}$, $180\,\text{nm}$, $90\,\text{nm}$, $45\,\text{nm}$, $22\,\text{nm}$, $16\,\text{nm}$) recalculates every layer's dimensions in nanometers and updates the Property Inspector in real time.

---

## ⚠️ Conceptual Accuracy Disclaimer

Vertical layer thicknesses and layer separations are intentionally exaggerated for visual clarity. This viewer is a **conceptual and educational CAD tool** designed to teach standard cell layout topology, functional relationships, and process physics. It is **not** a foundry-certified PDK or DRC-clean layout for manufacturing.

---

## 🤝 Contributing

Contributions, bug reports, and enhancements are welcome! Potential extensions include:
- Additional standard cells (NAND2, NOR2, Transmission Gate, SRAM 6T cell).
- Capped cross-section rendering using stencil buffers for solid-sliced geometries.
- SPICE netlist export of the extracted cell parasitics.

---

## 📄 License

This project is licensed under the **MIT License**.

---

## 👨‍💻 Author

**Raydurg Anish**  
- **Portfolio**: [raydurg-anish-portfolio.vercel.app](https://raydurg-anish-portfolio-amta50oot-anish609609s-projects.vercel.app/)  
- **GitHub**: [@anish609609](https://github.com/anish609609)  
- **Project Repository**: [cmos_inverter_cad](https://github.com/anish609609/cmos_inverter_cad)
