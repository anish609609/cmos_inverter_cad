/**
 * geometry.js
 * The physical CMOS inverter model itself: layout constants (the "GDS" of this conceptual cell), geometry helper functions (box/contact/metal builders, doping-gradient texture), the full substrate -> well -> active -> oxide -> poly -> contact -> metal-1 construction, and the floating 3D labels.
 */

// =====================================================================
// GEOMETRY HELPERS
// =====================================================================
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
// Radial gradient texture used on doped regions (well / active) so the
// region reads as a concentration profile fading from a denser core to its
// boundary, rather than a single flat slab of color.
var dopingTexCache = {};
function dopingTexture(strength){
  strength = strength || 1;
  var key = strength;
  if (dopingTexCache[key]) return dopingTexCache[key];
  var size = 256;
  var c = document.createElement('canvas'); c.width = c.height = size;
  var ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(0,0,size,size);
  var g = ctx.createRadialGradient(size/2,size/2, size*0.04, size/2,size/2, size*0.62);
  g.addColorStop(0, 'rgba(255,255,255,' + (0.95*strength) + ')');
  g.addColorStop(0.35, 'rgba(255,255,255,' + (0.62*strength) + ')');
  g.addColorStop(0.72, 'rgba(255,255,255,0.28)');
  g.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,size,size);
  // faint concentric "iso-concentration" rings, like a dopant-diffusion profile
  ctx.strokeStyle = 'rgba(10,13,18,0.35)';
  ctx.lineWidth = 2;
  for (var r = size*0.14; r < size*0.62; r += size*0.14){
    ctx.beginPath(); ctx.arc(size/2, size/2, r, 0, Math.PI*2); ctx.stroke();
  }
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  dopingTexCache[key] = tex;
  return tex;
}

function box(w,h,d, colorVar, opts){
  opts = opts || {};
  var matParams = {
    color: new THREE.Color(cssVar(colorVar)),
    roughness: opts.roughness !== undefined ? opts.roughness : 0.65,
    metalness: opts.metalness !== undefined ? opts.metalness : 0.15,
    transparent: !!opts.transparent,
    opacity: opts.opacity !== undefined ? opts.opacity : 1,
    emissive: 0x000000,
    emissiveIntensity: 0
  };
  if (opts.doping){
    matParams.map = dopingTexture(opts.dopingStrength || 1);
  }
  var mat = new THREE.MeshStandardMaterial(matParams);
  var geo = new THREE.BoxGeometry(w,h,d);
  var mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = !opts.noShadow;
  mesh.receiveShadow = true;
  mesh.userData.baseEmissive = 0x000000;
  mesh.userData.baseEmissiveIntensity = 0;
  if (opts.outline !== false && (opts.doping || opts.outlineColor)){
    var edges = new THREE.EdgesGeometry(geo);
    var lineMat = new THREE.LineBasicMaterial({
      color: opts.outlineColor ? new THREE.Color(opts.outlineColor) : new THREE.Color(cssVar(colorVar)),
      transparent: true, opacity: 0.85
    });
    var line = new THREE.LineSegments(edges, lineMat);
    line.raycast = function(){}; // outlines shouldn't intercept clicks
    mesh.add(line);
  }
  return mesh;
}
function put(mesh, x,y,z){ mesh.position.set(x,y,z); return mesh; }

// canvas-sprite labels
function makeLabel(text, colorHex){
  var pad = 10, fontSize = 26;
  var canvas = document.createElement('canvas');
  var ctx = canvas.getContext('2d');
  ctx.font = '600 ' + fontSize + 'px IBM Plex Mono, monospace';
  var metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width) + pad*2;
  canvas.height = fontSize + pad*2;
  ctx.font = '600 ' + fontSize + 'px IBM Plex Mono, monospace';
  ctx.fillStyle = 'rgba(10,13,18,0.72)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = colorHex; ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75,0.75,canvas.width-1.5,canvas.height-1.5);
  ctx.fillStyle = colorHex;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, canvas.height/2 + 1);
  var tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  var mat = new THREE.SpriteMaterial({ map: tex, depthTest:false, depthWrite:false, transparent:true });
  var sprite = new THREE.Sprite(mat);
  var scale = 0.014;
  sprite.scale.set(canvas.width*scale, canvas.height*scale, 1);
  sprite.renderOrder = 999;
  return sprite;
}

// =====================================================================
// LAYOUT CONSTANTS
// =====================================================================
// Real-transistor proportions: the gate sits directly between source and
// drain with NO gap (they physically abut it), diffusion is recessed into
// the well/substrate surface rather than stacked on top of it, and every
// routing wire is placed to avoid crossing another SAME-LAYER wire's
// footprint (poly may legally run under a metal rail — different layer,
// separated by dielectric, exactly like a real die — but two Metal-1 wires
// must never overlap in plan view or they would short together).
var Y = {
  subBot: 0.0, subTop: 2.0,
  wellBot: 1.10, wellTop: 2.05,     // sits in the UPPER part of the substrate slab, barely proud of it
  actBot: 1.55, actTop: 1.95,       // recessed well below the well/substrate top surface — genuinely "inside", not stacked on top
  oxideBot: 1.95, oxideTop: 2.02,   // thin dielectric, exaggerated for visibility, only under the gates
  polyBot: 2.02, polyTop: 2.32,
  metalBot: 2.95, metalTop: 3.25
};

var CH = { min:-1.0, max:1.0 };            // gate/channel — 2 units = 2λ gate length
var SRC_X0 = -4.0, SRC_X1 = CH.min;        // source diffusion block — flush against the gate, no gap
var DRN_X0 = CH.max, DRN_X1 = 4.0;         // drain diffusion block — flush against the gate, no gap
var SRC_X = (SRC_X0+SRC_X1)/2;             // -2.5 — source contact, centered in its own diffusion block
var DRN_X = (DRN_X0+DRN_X1)/2;             //  2.5 — drain contact,  centered in its own diffusion block
var TAP_X = -6.0;                          // well/substrate tap, clear of the source block (-4.0)

var ACTIVE_W = 6.0;                        // transistor width (Z-depth of source/gate/drain) — matches the 6λ gate-width rule
var PMOS_ZC = 3.5, PMOS_Z0 = PMOS_ZC-ACTIVE_W/2, PMOS_Z1 = PMOS_ZC+ACTIVE_W/2;
var NMOS_ZC = -3.5, NMOS_Z0 = NMOS_ZC-ACTIVE_W/2, NMOS_Z1 = NMOS_ZC+ACTIVE_W/2;

// Poly runs flush across BOTH transistor bands (no wasted overhang), with
// only a short stub past the PMOS edge to land the IN contact on field poly
// — never over active silicon, and short enough to stay well clear of the
// VDD rail's footprint below.
var POLY_Z0 = NMOS_Z0;
var POLY_Z1 = PMOS_Z1 + 0.6;
var POLY_CT_Z = PMOS_Z1 + 0.3;             // IN contact — on the poly tail, just past the PMOS diffusion edge

var RAIL_Z = PMOS_Z1 + 1.8;                // VDD rail sits OUTSIDE the poly/IN tail entirely — no Metal-1-on-Metal-1 overlap

var LAYER_ORDER = ['substrate','well','active','oxide','poly','contact','metal'];
var EXPLODE_GAP = 3.2;

var groups = {};
LAYER_ORDER.forEach(function(k){ groups[k] = new THREE.Group(); groups[k].name = k; scene.add(groups[k]); });

var selectable = [];   // meshes clickable / highlightable

function reg(mesh, id, layerKey){
  mesh.userData.id = id;
  mesh.userData.layer = layerKey;
  selectable.push(mesh);
  groups[layerKey].add(mesh);
  return mesh;
}

// ---------- SUBSTRATE ----------
// A generous die slab — a single transistor really is tiny compared to the
// bulk wafer material it sits in, so the substrate is deliberately much
// bigger than the active devices, not sized to hug them.
var subMesh = box(22, Y.subTop-Y.subBot, 26, '--c-substrate', { roughness:0.85, metalness:0.05 });
put(subMesh, -0.5, (Y.subTop+Y.subBot)/2, 0);
reg(subMesh, 'psub', 'substrate');

// ---------- N-WELL ----------
var wellMesh = box(12.2, Y.wellTop-Y.wellBot, PMOS_Z1-0.6, '--c-well', {
  transparent:true, opacity:0.58, roughness:0.35, metalness:0.1,
  doping:true, dopingStrength:0.85, outlineColor:'#8fe6c8'
});
put(wellMesh, -1.0, (Y.wellTop+Y.wellBot)/2, (0.3+(PMOS_Z1-0.6))/2);
reg(wellMesh, 'nwell', 'well');

// ---------- ACTIVE / DIFFUSION ----------
// Source and drain are diffused directly against the gate boundary (no gap)
// and recessed into the well/substrate surface, not perched on top of it.
function buildActiveRow(zc, srcColorVar, idPrefix, layerKey, dopingHex){
  var actH = Y.actTop-Y.actBot;
  var src = box(SRC_X1-SRC_X0, actH, ACTIVE_W, srcColorVar, { roughness:0.45, doping:true, dopingStrength:1, outlineColor:dopingHex });
  put(src, SRC_X, (Y.actTop+Y.actBot)/2, zc);
  reg(src, idPrefix+'Src', layerKey);

  var gateSeg = box(CH.max-CH.min, actH*0.7, ACTIVE_W, srcColorVar, { roughness:0.5, opacity:0.5, transparent:true, outline:false });
  put(gateSeg, 0, (Y.actTop+Y.actBot)/2 - actH*0.15, zc);
  gateSeg.userData.decorative = true;
  groups[layerKey].add(gateSeg);

  var drn = box(DRN_X1-DRN_X0, actH, ACTIVE_W, srcColorVar, { roughness:0.45, doping:true, dopingStrength:1, outlineColor:dopingHex });
  put(drn, DRN_X, (Y.actTop+Y.actBot)/2, zc);
  reg(drn, idPrefix+'Drn', layerKey);

  return { src:src, drn:drn };
}
var pmosAct = buildActiveRow(PMOS_ZC, '--c-active-p', 'pmos', 'active', '#f0b877');
var nmosAct = buildActiveRow(NMOS_ZC, '--c-active-n', 'nmos', 'active', '#7fc3ec');

// well tap / substrate tap diffusion pads — close to their row, not off in a far corner
var wellTapPad = box(1.3, Y.actTop-Y.actBot, 1.3, '--c-well', { roughness:0.5, doping:true, dopingStrength:0.9, outlineColor:'#8fe6c8' });
put(wellTapPad, TAP_X, (Y.actTop+Y.actBot)/2, PMOS_ZC);
reg(wellTapPad, 'welltapAct', 'active');

var subTapPad = box(1.3, Y.actTop-Y.actBot, 1.3, '--c-substrate', { roughness:0.5, doping:true, dopingStrength:0.9, outlineColor:'#aab4c2' });
put(subTapPad, TAP_X, (Y.actTop+Y.actBot)/2, NMOS_ZC);
reg(subTapPad, 'subtapAct', 'active');

// ---------- GATE OXIDE ----------
// Present only where poly actually overlaps each active region — i.e. only
// directly under the two gates — never a full-length strip like poly itself.
var oxidePmos = box(CH.max-CH.min, Y.oxideTop-Y.oxideBot, ACTIVE_W, '--c-oxide', { roughness:0.15, metalness:0.0, transparent:true, opacity:0.85, outline:false });
put(oxidePmos, 0, (Y.oxideTop+Y.oxideBot)/2, PMOS_ZC);
reg(oxidePmos, 'pmosOxide', 'oxide');

var oxideNmos = box(CH.max-CH.min, Y.oxideTop-Y.oxideBot, ACTIVE_W, '--c-oxide', { roughness:0.15, metalness:0.0, transparent:true, opacity:0.85, outline:false });
put(oxideNmos, 0, (Y.oxideTop+Y.oxideBot)/2, NMOS_ZC);
reg(oxideNmos, 'nmosOxide', 'oxide');

// ---------- POLYSILICON (single continuous strip) ----------
// One straight strip flush across the NMOS band, the gap, and the PMOS
// band — plus a short tail (never over active silicon) that lands the one
// external gate contact.
var polyMesh = box(CH.max-CH.min, Y.polyTop-Y.polyBot, POLY_Z1-POLY_Z0, '--c-poly', { roughness:0.45, metalness:0.2 });
put(polyMesh, 0, (Y.polyTop+Y.polyBot)/2, (POLY_Z0+POLY_Z1)/2);
reg(polyMesh, 'poly', 'poly');

// ---------- CONTACTS ----------
function contactAt(x, z, topOfLower, id){
  var h = Y.metalBot - topOfLower;
  var c = box(0.42, h, 0.42, '--c-contact', { roughness:0.3, metalness:0.6, noShadow:true });
  put(c, x, topOfLower + h/2, z);
  reg(c, id, 'contact');
  return c;
}
contactAt(SRC_X, PMOS_ZC, Y.actTop, 'pmosSrcCt');
contactAt(DRN_X, PMOS_ZC, Y.actTop, 'pmosDrnCt');
contactAt(SRC_X, NMOS_ZC, Y.actTop, 'nmosSrcCt');
contactAt(DRN_X, NMOS_ZC, Y.actTop, 'nmosDrnCt');
contactAt(0, POLY_CT_Z, Y.polyTop, 'polyCt');
contactAt(TAP_X, PMOS_ZC, Y.actTop, 'welltapCt');
contactAt(TAP_X, NMOS_ZC, Y.actTop, 'subtapCt');

// ---------- METAL-1 ----------
// Every wire below is checked to stay clear of every OTHER Metal-1 wire's
// footprint (same layer = must not overlap). VDD/GND rails sit outside the
// poly tail's z-range entirely, so IN never runs through the VDD rail the
// way it used to.
var metalH = Y.metalTop-Y.metalBot;
var midY = (Y.metalTop+Y.metalBot)/2;

function metalBar(x0,x1,z0,z1, colorVar, id){
  var w = Math.abs(x1-x0) || 0.42, d = Math.abs(z1-z0) || 0.42;
  var m = box(Math.max(w,0.42), metalH, Math.max(d,0.42), colorVar, { roughness:0.35, metalness:0.55 });
  put(m, (x0+x1)/2, midY, (z0+z1)/2);
  reg(m, id, 'metal');
  return m;
}

// VDD rail + stubs (rail sits beyond the poly/IN tail — see RAIL_Z above)
metalBar(-9, 9, RAIL_Z, RAIL_Z, '--c-vdd', 'vddRail');
metalBar(SRC_X, SRC_X, PMOS_ZC, RAIL_Z, '--c-vdd', 'vddStubPmos');
metalBar(TAP_X, TAP_X, PMOS_ZC, RAIL_Z, '--c-vdd', 'vddStubTap');

// GND rail + stubs
metalBar(-9, 9, -RAIL_Z, -RAIL_Z, '--c-gnd', 'gndRail');
metalBar(SRC_X, SRC_X, NMOS_ZC, -RAIL_Z, '--c-gnd', 'gndStubNmos');
metalBar(TAP_X, TAP_X, NMOS_ZC, -RAIL_Z, '--c-gnd', 'gndStubTap');

// OUT: connects pmos drain <-> nmos drain through the gap between the two
// rows, plus a short pin stub sideways in X (clear of both rails and IN)
metalBar(DRN_X, DRN_X, PMOS_ZC, NMOS_ZC, '--c-out', 'outSpine');
metalBar(DRN_X, DRN_X+3.5, 0, 0, '--c-out', 'outPin');

// IN: straight up from the poly's field contact, short pin sideways in Z —
// stops well short of the VDD rail (RAIL_Z), so it never overlaps it.
metalBar(0, 0, POLY_CT_Z, POLY_CT_Z+0.9, '--c-in', 'inPin');

// =====================================================================
// LABELS
// =====================================================================
// Each label is parented into the SAME group as the geometry it names, so
// when a layer is exploded (or hidden) the label rides along with it instead
// of staying pinned in space.
function addLabel(text, x,y,z, colorHex, groupKey){
  var s = makeLabel(text, colorHex);
  s.position.set(x,y,z);
  s.userData.isLabel = true;
  groups[groupKey].add(s);
  return s;
}
addLabel('VDD', -9, Y.metalTop+0.6, RAIL_Z, '#e35d5d', 'metal');
addLabel('PMOS', SRC_X-1.2, Y.actTop+0.9, PMOS_ZC, '#cf8a4a', 'active');
addLabel('N-WELL', 5.0, Y.wellTop+0.5, PMOS_ZC, '#3f8f6f', 'well');
addLabel('POLY GATE', 0, Y.polyTop+0.7, 0, '#d8503c', 'poly');
addLabel('GATE OXIDE', 1.9, Y.oxideTop+0.35, PMOS_ZC, '#8fc9dc', 'oxide');
addLabel('IN', 0, Y.metalTop+0.6, POLY_CT_Z+1.1, '#e6c94a', 'metal');
addLabel('OUT', DRN_X+3.6, Y.metalTop+0.6, 0, '#57cf8f', 'metal');
addLabel('NMOS', SRC_X-1.2, Y.actTop+0.9, NMOS_ZC, '#4a92c9', 'active');
addLabel('P-SUBSTRATE', 9.5, Y.subTop+0.4, -8.0, '#9aa6b6', 'substrate');
addLabel('GND', -9, Y.metalTop+0.6, -RAIL_Z, '#9aa6b6', 'metal');

