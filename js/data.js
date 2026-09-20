/**
 * data.js
 * Reference data: per-layer legend copy and the detailed function/electrical-role/connection text shown in the Property Inspector and popover for every clickable component.
 */

// =====================================================================
// DATA: legend / inspector info
// =====================================================================
var LEGEND = [
  { key:'substrate', name:'P-SUBSTRATE', color:'var(--c-substrate)', desc:'Base silicon region. The NMOS transistor is built directly in this p-type substrate.' },
  { key:'well',      name:'N-WELL',      color:'var(--c-well)',      desc:'N-type well diffused into the substrate. Contains and isolates the PMOS transistor.' },
  { key:'active',    name:'ACTIVE / DIFFUSION', color:'var(--c-active-p)', desc:'Region where transistor source/drain structures are formed, in both the well (PMOS) and substrate (NMOS).' },
  { key:'oxide',     name:'GATE OXIDE',  color:'var(--c-oxide)',     desc:'Thin SiO₂ dielectric between poly and the channel. Insulating — carries no current, only couples the gate field.' },
  { key:'poly',      name:'POLYSILICON', color:'var(--c-poly)',      desc:'Gate electrode material. A single continuous strip crosses both active regions, forming both gates.' },
  { key:'contact',   name:'CONTACT',     color:'var(--c-contact)',   desc:'Vertical connection between diffusion/poly and Metal-1. Never a direct wire — always a discrete via.' },
  { key:'metal',     name:'METAL-1',     color:'var(--c-metal)',     desc:'First interconnect layer, used to route electrical nodes across longer distances than poly allows.' },
  { key:'vdd',       name:'VDD',         color:'var(--c-vdd)',       desc:'Supply rail. Connects only to the PMOS source (through contact + metal).' },
  { key:'gnd',       name:'GND',         color:'var(--c-gnd)',       desc:'Ground rail. Connects only to the NMOS source (through contact + metal).' },
  { key:'in',        name:'IN',          color:'var(--c-in)',        desc:'Input net. Routed in Metal-1 to a contact that drops onto the shared polysilicon gate.' },
  { key:'out',       name:'OUT',         color:'var(--c-out)',       desc:'Output net. The common drain node — Metal-1 ties the PMOS drain contact to the NMOS drain contact.' }
];

var INFO = {
  psub: { title:'P-SUBSTRATE', fn:'Base bulk silicon region of the die.', role:'Body terminal of the NMOS transistor; normally tied to GND via the substrate tap.', conn:'Substrate tap → GND', rel:'Hosts the N-well and the NMOS active region directly.', doping:'P-type, lightly doped — Na ≈ 1×10¹⁵ cm⁻³ (illustrative)' },
  nwell:{ title:'N-WELL', fn:'N-type doped tub inside the p-substrate.', role:'Body terminal of the PMOS transistor; normally tied to VDD via the well tap.', conn:'Well tap → VDD', rel:'Contains the PMOS active region; isolates PMOS from the p-substrate.', doping:'N-type, moderate — Nd ≈ 1×10¹⁷ cm⁻³ (illustrative)' },
  actP: { title:'ACTIVE / DIFFUSION — PMOS', fn:'Diffusion region where the PMOS source and drain are formed.', role:'Carries current between VDD and OUT when the PMOS channel is ON.', conn:'Source → VDD · Drain → OUT', rel:'Sits inside the N-well; crossed by the shared polysilicon gate.', doping:'P+, heavily doped — Na ≈ 1×10²⁰ cm⁻³ (illustrative)' },
  actN: { title:'ACTIVE / DIFFUSION — NMOS', fn:'Diffusion region where the NMOS source and drain are formed.', role:'Carries current between OUT and GND when the NMOS channel is ON.', conn:'Source → GND · Drain → OUT', rel:'Sits in the p-substrate outside the well; crossed by the shared polysilicon gate.', doping:'N+, heavily doped — Nd ≈ 1×10²⁰ cm⁻³ (illustrative)' },
  oxide:{ title:'GATE OXIDE', fn:'Thin dielectric (SiO₂) separating the polysilicon gate from the silicon channel.', role:'Forms the MOS capacitor: the gate voltage capacitively controls the channel through this insulator — it carries no steady-state current.', conn:'Sandwiched between POLY (above) and the ACTIVE channel (below); not electrically connected to any net.', rel:'Present only where poly crosses the active region — i.e. directly under each gate.', doping:'Undoped dielectric — tOX ≈ 2 nm equivalent (illustrative, exaggerated in the model for visibility)' },
  poly: { title:'POLYSILICON — COMMON CMOS GATE', fn:'Gate electrode. A single continuous strip, not a wire.', role:'Controls both the PMOS and NMOS channels simultaneously.', conn:'IN (via a contact at the far end of the strip)', rel:'Crosses the PMOS active region (forming the PMOS gate) and continues across the NMOS active region (forming the NMOS gate).' },
  contact:{ title:'CONTACT', fn:'Discrete vertical via.', role:'Bridges the physical gap between diffusion or poly and the Metal-1 layer above.', conn:'Diffusion/Poly ↔ Metal-1', rel:'One of several — placed at every source, drain, gate-tail, and tap location.' },
  metal: { title:'METAL-1', fn:'First metal interconnect layer.', role:'Routes electrical nodes across the layout — VDD, GND, IN and OUT all live here.', conn:'Everything, via contacts', rel:'Sits above the contact layer; the topmost layer in this model.' },
  pmos: { title:'PMOS TRANSISTOR', fn:'P-channel MOSFET.', role:'Pulls OUT up to VDD when IN = 0 (gate low turns PMOS on).', conn:'Source → VDD · Gate → IN · Drain → OUT', rel:'Built in the N-well from active diffusion + the shared poly gate.' },
  nmos: { title:'NMOS TRANSISTOR', fn:'N-channel MOSFET.', role:'Pulls OUT down to GND when IN = 1 (gate high turns NMOS on).', conn:'Source → GND · Gate → IN · Drain → OUT', rel:'Built in the p-substrate from active diffusion + the shared poly gate.' },
  vdd:  { title:'VDD', fn:'Positive supply rail, Metal-1.', role:'Sourced only through the PMOS transistor — never directly tied to GND.', conn:'PMOS source, N-well tap', rel:'Runs along the layout edge nearest the PMOS row.' },
  gnd:  { title:'GND', fn:'Ground rail, Metal-1.', role:'Sunk only through the NMOS transistor — never directly tied to VDD.', conn:'NMOS source, substrate tap', rel:'Runs along the layout edge nearest the NMOS row.' },
  inNet:{ title:'IN', fn:'Input net, Metal-1.', role:'Drives both transistor gates at once through the shared poly.', conn:'Contact → POLY GATE', rel:'Enters from outside the cell and drops onto the polysilicon tail.' },
  outNet:{ title:'OUT', fn:'Output net, Metal-1 — the common drain node.', role:'Driven high by PMOS or low by NMOS, never both at once.', conn:'PMOS drain contact ↔ NMOS drain contact', rel:'The defining node of the inverter — where the two transistors meet.' },
  welltap:{ title:'N-WELL TAP', fn:'Heavily doped N+ contact into the N-well.', role:'Biases the well to VDD, preventing latch-up and forward-biased junctions.', conn:'N-well → contact → Metal-1 → VDD', rel:'Placed at the edge of the well region.', doping:'N+, heavily doped — Nd ≈ 1×10²⁰ cm⁻³ (illustrative)' },
  subtap:{ title:'SUBSTRATE TAP', fn:'Heavily doped P+ contact into the substrate.', role:'Biases the substrate to GND, preventing latch-up and forward-biased junctions.', conn:'P-substrate → contact → Metal-1 → GND', rel:'Placed at the edge of the NMOS row.', doping:'P+, heavily doped — Na ≈ 1×10²⁰ cm⁻³ (illustrative)' }
};

