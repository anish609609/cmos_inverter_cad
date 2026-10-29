/**
 * geometry.js
 * The physical CMOS inverter model itself: layout constants (the "GDS" of this conceptual cell), geometry helper functions (box/contact/metal builders, Gaussian doping-profile textures and volumetric meshes, the full substrate -> well -> active -> oxide -> poly -> contact -> metal-1 construction, and the floating 3D labels.
 */

// =====================================================================
// GEOMETRY HELPERS
// =====================================================================
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
// ---------------------------------------------------------------------------
// GAUSSIAN DOPING CROSS-SECTION TEXTURES
// ---------------------------------------------------------------------------
// Real ion-implantation / diffusion profiles follow a Gaussian in depth:
//   N(y) = Npeak * exp( -((y - Rp)^2) / (2 * sigma^2) )
// where Rp = projected range (depth of peak), sigma = straggle.
//
// gaussianDepthTexture() paints the UV cross-section of one implanted layer:
//   U (horizontal) = lateral position across the doped region
//   V (vertical)   = depth into silicon  (0 = surface, 1 = deep)
//   Pixel brightness encodes concentration; iso-contour lines show equal-
//   concentration shells at 0.8 / 0.5 / 0.25 / 0.1 / 0.04 of peak.
//   Lateral straggle rounds the shoulders near the mask edges.
// ---------------------------------------------------------------------------
var gaussTexCache = {};
function gaussianDepthTexture(peakV, sigmaV, lateralSigma, strength, opts){
  opts = opts || {};
  var key = [peakV, sigmaV, lateralSigma, strength,
             (opts.color||[]).join(','), opts.isoLines||4].join('|');
  if (gaussTexCache[key]) return gaussTexCache[key];

  var TW = 512, TH = 256;
  var c = document.createElement('canvas'); c.width = TW; c.height = TH;
  var ctx = c.getContext('2d');
  var img = ctx.createImageData(TW, TH);
  var data = img.data;
  var col = opts.color || [255, 255, 255];
  var nIso = opts.isoLines !== undefined ? opts.isoLines : 4;

  for (var py = 0; py < TH; py++){
    var v  = py / (TH - 1);
    var dv = (v - peakV) / sigmaV;
    var gv = Math.exp(-0.5 * dv * dv);
    for (var px = 0; px < TW; px++){
      var u = px / (TW - 1);
      // Lateral straggle: Gaussian roll-off near both mask edges
      var edgeDist = Math.min(u, 1.0 - u);
      var gl = (edgeDist < lateralSigma)
        ? Math.exp(-0.5 * Math.pow((edgeDist - lateralSigma) / (lateralSigma * 0.5), 2))
        : 1.0;
      var conc = strength * gv * gl;
      var i4 = (py * TW + px) * 4;
      data[i4]   = Math.round(col[0] * conc);
      data[i4+1] = Math.round(col[1] * conc);
      data[i4+2] = Math.round(col[2] * conc);
      data[i4+3] = Math.round(230    * conc);
    }
  }
  ctx.putImageData(img, 0, 0);

  // Iso-concentration contour lines
  var isoLevels = [0.8, 0.5, 0.25, 0.1, 0.04].slice(0, nIso);
  isoLevels.forEach(function(lvl, li){
    var alpha = 0.60 - li * 0.10;
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha.toFixed(2) + ')';
    ctx.lineWidth   = 1.3;
    ctx.beginPath();
    var started = false;
    for (var px = 0; px < TW; px++){
      var u = px / (TW - 1);
      var edgeDist = Math.min(u, 1.0 - u);
      var gl = (edgeDist < lateralSigma)
        ? Math.exp(-0.5 * Math.pow((edgeDist - lateralSigma) / (lateralSigma * 0.5), 2))
        : 1.0;
      var ratio = lvl / (strength * gl + 1e-12);
      if (ratio >= 1.0){ started = false; continue; }
      var dv2 = -2.0 * Math.log(ratio);
      if (dv2 < 0){ started = false; continue; }
      var dv  = Math.sqrt(dv2) * sigmaV;
      // Upper branch (shallower than peak)
      var vUp = peakV - dv;
      if (vUp >= 0 && vUp <= 1){
        var yUp = vUp * (TH - 1);
        if (!started){ ctx.moveTo(px, yUp); started = true; }
        else          { ctx.lineTo(px, yUp); }
      } else { started = false; }
    }
    ctx.stroke();
    // Lower branch (deeper than peak) — separate path
    ctx.beginPath(); started = false;
    for (var px = 0; px < TW; px++){
      var u = px / (TW - 1);
      var edgeDist = Math.min(u, 1.0 - u);
      var gl = (edgeDist < lateralSigma)
        ? Math.exp(-0.5 * Math.pow((edgeDist - lateralSigma) / (lateralSigma * 0.5), 2))
        : 1.0;
      var ratio = lvl / (strength * gl + 1e-12);
      if (ratio >= 1.0){ started = false; continue; }
      var dv2 = -2.0 * Math.log(ratio);
      if (dv2 < 0){ started = false; continue; }
      var dv  = Math.sqrt(dv2) * sigmaV;
      var vDn = peakV + dv;
      if (vDn >= 0 && vDn <= 1){
        var yDn = vDn * (TH - 1);
        if (!started){ ctx.moveTo(px, yDn); started = true; }
        else          { ctx.lineTo(px, yDn); }
      } else { started = false; }
    }
    ctx.stroke();
  });

  // Dashed line at the wafer surface (top of the doped region)
  ctx.strokeStyle = 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(TW, 2); ctx.stroke();
  ctx.setLineDash([]);

  var tex = new THREE.CanvasTexture(c);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  gaussTexCache[key] = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// VOLUMETRIC GAUSSIAN DOPING MESH
// ---------------------------------------------------------------------------
// Builds a doped region as a stack of semi-transparent XZ plane slabs whose
// per-slab opacity is Gaussian-weighted by depth. This produces a soft glowing
// volume that fades to zero at the metallurgical junction — matching what a
// SIMS depth profile or TEM cross-section actually looks like.
//
// Also attaches cross-section face textures (with iso-contour lines) to the
// ±X faces so the Gaussian profile is visible when the model is cut in cross-section.
//
// Parameters:
//   w, d         : lateral extents (X-width, Z-depth) of the doped block
//   yBot / yTop  : world Y of the deep bottom and the surface top
//   peakFrac     : 0–1, where in [yBot,yTop] the Gaussian peak sits (0=bottom, 1=top)
//   sigmaFrac    : Gaussian sigma as a fraction of the total slab height
//   baseColor    : THREE.Color of the dopant species
//   opts.nSlabs      (default 22)  number of stacked horizontal layers
//   opts.maxAlpha    (default 0.20) peak per-slab opacity
//   opts.additive    (default true) AdditiveBlending for glow effect
//   opts.lateralSigma(default 0.15) edge straggle fraction
//   opts.isoLines    (default 4)   iso-concentration contour count
// ---------------------------------------------------------------------------
function gaussianDopingMesh(w, d, yBot, yTop, peakFrac, sigmaFrac, baseColor, opts){
  opts = opts || {};
  var nSlabs    = opts.nSlabs       !== undefined ? opts.nSlabs       : 22;
  var maxAlpha  = opts.maxAlpha     !== undefined ? opts.maxAlpha     : 0.20;
  var additive  = opts.additive     !== undefined ? opts.additive     : true;
  var latSigma  = opts.lateralSigma !== undefined ? opts.lateralSigma : 0.15;
  var nIso      = opts.isoLines     !== undefined ? opts.isoLines     : 4;
  var totalH    = yTop - yBot;
  var group     = new THREE.Group();
  var blending  = additive ? THREE.AdditiveBlending : THREE.NormalBlending;

  function gauss(v){ var dv = (v - peakFrac) / sigmaFrac; return Math.exp(-0.5 * dv * dv); }

  // Stack of horizontal slabs — opacity ∝ Gaussian(depth)
  for (var si = 0; si < nSlabs; si++){
    var vBot = si       / nSlabs;   // v=0 at yBot (deep), v=1 at yTop (surface)
    var vTop = (si + 1) / nSlabs;
    var vMid = (vBot + vTop) * 0.5;
    var conc = gauss(vMid);
    if (conc < 0.012) continue;

    var slabY = yBot + vMid * totalH;
    var geo   = new THREE.PlaneGeometry(w, d);
    var mat   = new THREE.MeshBasicMaterial({
      color:      baseColor,
      transparent: true,
      opacity:    conc * maxAlpha,
      blending:   blending,
      depthWrite: false,
      side:       THREE.DoubleSide
    });
    var slab = new THREE.Mesh(geo, mat);
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = slabY;
    slab.renderOrder = 2;
    slab.raycast = function(){};
    group.add(slab);
  }

  // Crisp bounding-box wireframe outline
  var outGeo = new THREE.BoxGeometry(w, totalH, d);
  var outEdge = new THREE.EdgesGeometry(outGeo);
  var outMat  = new THREE.LineBasicMaterial({
    color: baseColor, transparent: true, opacity: 0.50, depthWrite: false
  });
  var outline = new THREE.LineSegments(outEdge, outMat);
  outline.position.y = yBot + totalH * 0.5;
  outline.raycast = function(){};
  group.add(outline);

  // Gaussian cross-section face texture on the ±X cut faces
  var r255 = Math.round(baseColor.r * 255);
  var g255 = Math.round(baseColor.g * 255);
  var b255 = Math.round(baseColor.b * 255);
  // peakV in UV space: V=0 is surface (yTop), V=1 is deep (yBot) → flip peakFrac
  var faceTex = gaussianDepthTexture(
    1.0 - peakFrac, sigmaFrac, latSigma, 0.90,
    { color: [r255, g255, b255], isoLines: nIso }
  );
  function makeFace(xSign){
    var fGeo = new THREE.PlaneGeometry(d, totalH);
    var fMat = new THREE.MeshBasicMaterial({
      map: faceTex, transparent: true, opacity: 0.80,
      blending: THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide
    });
    var fm = new THREE.Mesh(fGeo, fMat);
    fm.position.set(xSign * (w * 0.5 + 0.015), yBot + totalH * 0.5, 0);
    fm.rotation.y = xSign > 0 ? Math.PI / 2 : -Math.PI / 2;
    fm.raycast = function(){};
    fm.renderOrder = 3;
    return fm;
  }
  group.add(makeFace(+1));
  group.add(makeFace(-1));

  return group;
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
  var mat = new THREE.SpriteMaterial({ map: tex, depthTest:true, depthWrite:false, transparent:true });
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

// ---------- N-WELL — Gaussian retrograde implant profile ----------
// N-well is formed by high-energy phosphorus implantation. Peak concentration
// sits ~60% of the way down from the surface; sigma ~ 0.30 of well height.
// The profile is widest at surface and tapers to the junction at the bottom.
var _wellColor = new THREE.Color(cssVar('--c-well'));
var wellMesh = gaussianDopingMesh(
  12.2, PMOS_Z1 - 0.6,          // width (X), depth (Z)
  Y.wellBot, Y.wellTop,          // yBot, yTop world-Y
  0.65,                          // peakFrac: peak 65% up from bottom (shallow retrograde)
  0.28,                          // sigmaFrac: broad Gaussian — well implant has high straggle
  _wellColor,
  { nSlabs:24, maxAlpha:0.18, additive:true, lateralSigma:0.12, isoLines:4 }
);
wellMesh.position.set(-1.0, 0, (0.3 + (PMOS_Z1 - 0.6)) / 2);

// Add a ghost solid for click-selection (invisible but raycasts)
var _wellPickGeo = new THREE.BoxGeometry(12.2, Y.wellTop-Y.wellBot, PMOS_Z1-0.6);
var _wellPickMat = new THREE.MeshBasicMaterial({ visible:false });
var wellMesh_pick = new THREE.Mesh(_wellPickGeo, _wellPickMat);
wellMesh_pick.position.set(-1.0, (Y.wellTop+Y.wellBot)/2, (0.3+(PMOS_Z1-0.6))/2);
wellMesh_pick.userData.id = 'nwell'; wellMesh_pick.userData.layer = 'well';
selectable.push(wellMesh_pick);
groups['well'].add(wellMesh_pick);
groups['well'].add(wellMesh);

// ---------- ACTIVE / DIFFUSION — Gaussian shallow-junction implant profiles ----------
// Source and drain are shallow implants: peak very near the surface (BF2 for p+,
// As/P for n+), tight sigma — abrupt junction like a modern LDD/halo.
// The gate segment between them is a thin inversion-layer indicator.
function buildActiveRow(zc, srcColorVar, idPrefix, layerKey, dopingHex){
  var actH    = Y.actTop - Y.actBot;
  var actW_SD = SRC_X1 - SRC_X0;        // source / drain lateral width in X
  var sdColor = new THREE.Color(cssVar(srcColorVar));

  // Source — p+ or n+ shallow implant, peak very close to surface (peakFrac~0.88)
  var srcMesh = gaussianDopingMesh(
    actW_SD, ACTIVE_W,
    Y.actBot, Y.actTop,
    0.88,   // peakFrac: peak 88% up (very shallow — As/BF2 at ~20 nm Rp, scaled)
    0.22,   // sigmaFrac: tight sigma for abrupt junction
    sdColor,
    { nSlabs:16, maxAlpha:0.25, additive:true, lateralSigma:0.10, isoLines:3 }
  );
  srcMesh.position.set(SRC_X, 0, zc);
  // Invisible pick mesh
  var srcPick = new THREE.Mesh(
    new THREE.BoxGeometry(actW_SD, actH, ACTIVE_W),
    new THREE.MeshBasicMaterial({ visible:false })
  );
  srcPick.position.set(SRC_X, (Y.actTop+Y.actBot)/2, zc);
  srcPick.userData.id = idPrefix+'Src'; srcPick.userData.layer = layerKey;
  selectable.push(srcPick); groups[layerKey].add(srcPick);
  groups[layerKey].add(srcMesh);

  // Decorative gate inversion channel segment
  var gateSeg = box(CH.max-CH.min, actH*0.7, ACTIVE_W, srcColorVar,
    { roughness:0.5, opacity:0.28, transparent:true, outline:false });
  put(gateSeg, 0, (Y.actTop+Y.actBot)/2 - actH*0.15, zc);
  gateSeg.userData.decorative = true;
  groups[layerKey].add(gateSeg);

  // Drain — mirror of source
  var actW_D = DRN_X1 - DRN_X0;
  var drnMesh = gaussianDopingMesh(
    actW_D, ACTIVE_W,
    Y.actBot, Y.actTop,
    0.88, 0.22,
    sdColor,
    { nSlabs:16, maxAlpha:0.25, additive:true, lateralSigma:0.10, isoLines:3 }
  );
  drnMesh.position.set(DRN_X, 0, zc);
  var drnPick = new THREE.Mesh(
    new THREE.BoxGeometry(actW_D, actH, ACTIVE_W),
    new THREE.MeshBasicMaterial({ visible:false })
  );
  drnPick.position.set(DRN_X, (Y.actTop+Y.actBot)/2, zc);
  drnPick.userData.id = idPrefix+'Drn'; drnPick.userData.layer = layerKey;
  selectable.push(drnPick); groups[layerKey].add(drnPick);
  groups[layerKey].add(drnMesh);

  return { src:srcMesh, drn:drnMesh };
}
var pmosAct = buildActiveRow(PMOS_ZC, '--c-active-p', 'pmos', 'active', '#f0b877');
var nmosAct = buildActiveRow(NMOS_ZC, '--c-active-n', 'nmos', 'active', '#7fc3ec');

// ---------- WELL TAP / SUBSTRATE TAP — moderate-depth Gaussian contact implants ----------
// Tap diffusions are heavier implants than S/D (lower sheet resistance needed for ohmic contact)
// but shallower than the well itself. They sit in the same active layer.
var _wtColor  = new THREE.Color(cssVar('--c-well'));
var wellTapMesh = gaussianDopingMesh(
  1.3, 1.3,
  Y.actBot, Y.actTop,
  0.82, 0.26,
  _wtColor,
  { nSlabs:12, maxAlpha:0.26, additive:true, lateralSigma:0.18, isoLines:2 }
);
wellTapMesh.position.set(TAP_X, 0, PMOS_ZC);
var wellTapPad = new THREE.Mesh(
  new THREE.BoxGeometry(1.3, Y.actTop-Y.actBot, 1.3),
  new THREE.MeshBasicMaterial({ visible:false })
);
wellTapPad.position.set(TAP_X, (Y.actTop+Y.actBot)/2, PMOS_ZC);
wellTapPad.userData.id = 'welltapAct'; wellTapPad.userData.layer = 'active';
selectable.push(wellTapPad); groups['active'].add(wellTapPad);
groups['active'].add(wellTapMesh);

var _stColor  = new THREE.Color(cssVar('--c-substrate'));
var subTapMesh = gaussianDopingMesh(
  1.3, 1.3,
  Y.actBot, Y.actTop,
  0.82, 0.26,
  _stColor,
  { nSlabs:12, maxAlpha:0.26, additive:true, lateralSigma:0.18, isoLines:2 }
);
subTapMesh.position.set(TAP_X, 0, NMOS_ZC);
var subTapPad = new THREE.Mesh(
  new THREE.BoxGeometry(1.3, Y.actTop-Y.actBot, 1.3),
  new THREE.MeshBasicMaterial({ visible:false })
);
subTapPad.position.set(TAP_X, (Y.actTop+Y.actBot)/2, NMOS_ZC);
subTapPad.userData.id = 'subtapAct'; subTapPad.userData.layer = 'active';
selectable.push(subTapPad); groups['active'].add(subTapPad);
groups['active'].add(subTapMesh);

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

