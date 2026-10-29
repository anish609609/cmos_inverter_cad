/**
 * geometry.js
 * The physical CMOS inverter model: layout constants, geometry helper functions,
 * physically accurate Gaussian doping-profile textures, 3D curved tub geometries
 * with lateral straggle and iso-concentration contour rings, full layer construction
 * (substrate -> wells -> active S/D -> oxide -> poly -> contacts -> metal-1),
 * and depth-tested 3D floating labels.
 */

// =====================================================================
// GEOMETRY HELPERS
// =====================================================================
function cssVar(name){
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// ---------------------------------------------------------------------------
// GAUSSIAN DOPING DEPTH & SURFACE TEXTURE GENERATOR
// ---------------------------------------------------------------------------
// In ion implantation and thermal drive-in diffusion, dopant concentration
// follows an exponential Gaussian depth distribution:
//   N(y) = Npeak * exp( -((y - Rp)^2) / (2 * sigma^2) )
// where Rp is the projected range and sigma is the depth straggle.
// Near mask boundaries, lateral straggle (x_lat ~ 0.7-0.8 xj) rounds the junction.
//
// gaussianDepthTexture() paints a UV map:
//   U (horizontal) = angular / perimeter position around the doped region
//   V (vertical)   = normalized depth into silicon (0 = surface, 1 = junction depth)
//   Iso-concentration contour lines mark equal-concentration shells at
//   0.85, 0.60, 0.35, 0.15, and 0.05 of peak concentration.
// ---------------------------------------------------------------------------
var gaussTexCache = {};
function gaussianDepthTexture(colorVarOrHex, peakV, sigmaV, opts){
  opts = opts || {};
  var rawColor = colorVarOrHex.indexOf('--') === 0 ? cssVar(colorVarOrHex) : colorVarOrHex;
  var key = [rawColor, peakV, sigmaV, opts.isoLines || 5].join('|');
  if (gaussTexCache[key]) return gaussTexCache[key];

  var TW = 512, TH = 256;
  var c = document.createElement('canvas');
  c.width = TW;
  c.height = TH;
  var ctx = c.getContext('2d');
  var img = ctx.createImageData(TW, TH);
  var data = img.data;

  // Parse color to RGB
  var tc = new THREE.Color(rawColor);
  var r0 = Math.round(tc.r * 255);
  var g0 = Math.round(tc.g * 255);
  var b0 = Math.round(tc.b * 255);

  var nIso = opts.isoLines !== undefined ? opts.isoLines : 5;

  for (var py = 0; py < TH; py++){
    var v = py / (TH - 1); // 0 at surface, 1 at bottom junction
    var dv = (v - peakV) / sigmaV;
    var gDepth = Math.exp(-0.5 * dv * dv);

    for (var px = 0; px < TW; px++){
      var u = px / (TW - 1);
      // Slight periodic ripple across perimeter to give subtle crystal texture
      var uMod = 0.94 + 0.06 * Math.cos(u * Math.PI * 4);
      var conc = Math.min(1.0, gDepth * uMod);

      var idx = (py * TW + px) * 4;
      // Core is luminous; fades into base silicon at junction
      data[idx]     = Math.min(255, Math.round(r0 * (0.65 + 0.45 * conc) + 40 * conc));
      data[idx + 1] = Math.min(255, Math.round(g0 * (0.65 + 0.45 * conc) + 40 * conc));
      data[idx + 2] = Math.min(255, Math.round(b0 * (0.65 + 0.45 * conc) + 40 * conc));
      data[idx + 3] = Math.round(180 + 75 * conc);
    }
  }
  ctx.putImageData(img, 0, 0);

  // Draw crisp iso-concentration contour lines along depth
  var isoRatios = [0.85, 0.60, 0.35, 0.15, 0.05].slice(0, nIso);
  isoRatios.forEach(function(ratio, i){
    // Solve ratio = exp(-0.5 * dv^2) => dv = sqrt(-2 ln(ratio)) * sigmaV
    var dv = Math.sqrt(-2.0 * Math.log(ratio)) * sigmaV;
    var alpha = 0.70 - i * 0.10;
    ctx.strokeStyle = 'rgba(255,255,255,' + alpha.toFixed(2) + ')';
    ctx.lineWidth = 1.4;

    // Shallower branch
    var vUp = peakV - dv;
    if (vUp >= 0 && vUp <= 1){
      var yUp = vUp * (TH - 1);
      ctx.beginPath();
      ctx.moveTo(0, yUp);
      ctx.lineTo(TW, yUp);
      ctx.stroke();
    }
    // Deeper branch
    var vDn = peakV + dv;
    if (vDn >= 0 && vDn <= 1){
      var yDn = vDn * (TH - 1);
      ctx.beginPath();
      ctx.moveTo(0, yDn);
      ctx.lineTo(TW, yDn);
      ctx.stroke();
    }
  });

  // Top wafer interface line (dashed)
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(TW, 2);
  ctx.stroke();
  ctx.setLineDash([]);

  var tex = new THREE.CanvasTexture(c);
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  gaussTexCache[key] = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// 3D GAUSSIAN CURVED TUB GEOMETRY
// ---------------------------------------------------------------------------
// Real diffused wells and ion-implanted regions are NOT sharp rectangular boxes:
// 1. Due to lateral straggle and isotropic thermal diffusion, dopants expand
//    under the mask edges, creating rounded quarter-cylinder/quarter-sphere shoulders.
// 2. The metallurgical junction curves smoothly upward at the edges and bottom,
//    forming a curved "tub" (for wells) or "trough" (for source/drain).
// 3. This function constructs a 3D BufferGeometry with smoothly rounded corners,
//    curved sidewalls, a flat wafer-surface top cap, and a curved junction bottom.
// ---------------------------------------------------------------------------
function createGaussianTubGeometry(w, h, d, opts){
  opts = opts || {};
  var nLayers = opts.nLayers || 20;
  var nPerim = opts.nPerim || 48;
  var straggle = opts.straggle !== undefined ? opts.straggle : 0.18;
  var cornerR = opts.cornerR !== undefined ? opts.cornerR : Math.min(w, d) * 0.22;

  var positions = [];
  var uvs = [];
  var indices = [];

  var halfW = w / 2;
  var halfD = d / 2;

  function getRoundedRectPoint(hx, hz, cr, theta){
    var cos = Math.cos(theta);
    var sin = Math.sin(theta);
    var sx = Math.max(0, hx - cr);
    var sz = Math.max(0, hz - cr);
    var qx = cos >= 0 ? 1 : -1;
    var qz = sin >= 0 ? 1 : -1;
    var cCos = Math.abs(cos);
    var cSin = Math.abs(sin);
    var len = Math.hypot(cCos, cSin) || 1;
    return [
      qx * (sx + cr * (cCos / len)),
      qz * (sz + cr * (cSin / len))
    ];
  }

  // Generate stacked rings from eta = 0 (top surface, y = +h/2) to eta = 1 (bottom apex, y = -h/2)
  for (var i = 0; i <= nLayers; i++){
    var eta = i / nLayers; // 0 at surface, 1 at bottom
    // Quarter-ellipse diffusion envelope
    var rFactor = Math.sqrt(Math.max(0, 1.0 - eta * eta));

    // Near top, lateral diffusion expands slightly; near bottom, it contracts into a rounded bowl
    var curHx = halfW * (1.0 - straggle * (1.0 - rFactor));
    var curHz = halfD * (1.0 - straggle * (1.0 - rFactor));
    var curCr = cornerR * (0.35 + 0.65 * rFactor);

    // Vertical position: top is +h/2, bottom is -h/2
    var y = h * 0.5 - h * eta;

    for (var j = 0; j < nPerim; j++){
      var theta = (j / nPerim) * Math.PI * 2;
      var pt = getRoundedRectPoint(curHx, curHz, curCr, theta);
      positions.push(pt[0], y, pt[1]);
      uvs.push(j / nPerim, eta);
    }
  }

  // Wall indices between rings
  for (var i = 0; i < nLayers; i++){
    var ring1 = i * nPerim;
    var ring2 = (i + 1) * nPerim;
    for (var j = 0; j < nPerim; j++){
      var nextJ = (j + 1) % nPerim;
      var a = ring1 + j;
      var b = ring2 + j;
      var c = ring2 + nextJ;
      var d = ring1 + nextJ;

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  // Bottom cap: smoothly rounded bottom apex at y = -h/2
  var bottomCenterIdx = positions.length / 3;
  positions.push(0, -h * 0.5, 0);
  uvs.push(0.5, 1.0);
  var lastRingStart = nLayers * nPerim;
  for (var j = 0; j < nPerim; j++){
    var nextJ = (j + 1) % nPerim;
    indices.push(bottomCenterIdx, lastRingStart + nextJ, lastRingStart + j);
  }

  // Top surface cap at y = +h/2 (wafer surface)
  var topCenterIdx = positions.length / 3;
  positions.push(0, h * 0.5, 0);
  uvs.push(0.5, 0.0);
  for (var j = 0; j < nPerim; j++){
    var nextJ = (j + 1) % nPerim;
    indices.push(topCenterIdx, j, nextJ);
  }

  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------------
// GAUSSIAN DOPING MESH BUILDER
// ---------------------------------------------------------------------------
// Creates a first-class THREE.Mesh with:
// - Realistic 3D curved Gaussian tub geometry
// - Gaussian concentration depth gradient texture
// - 3D iso-concentration contour wire loops (giving scientific TCAD look)
// - Inner high-concentration volumetric core
// - Full MeshStandardMaterial with emissive properties for native
//   highlighting, ON/OFF logic state coloring, and current-flow pulsing.
// ---------------------------------------------------------------------------
function gaussianDopingMesh(w, h, d, colorVar, opts){
  opts = opts || {};
  var peakV = opts.peakV !== undefined ? opts.peakV : 0.25;
  var sigmaV = opts.sigmaV !== undefined ? opts.sigmaV : 0.25;

  var geo = createGaussianTubGeometry(w, h, d, opts);
  var tex = gaussianDepthTexture(colorVar, peakV, sigmaV, opts);

  var baseColor = new THREE.Color(cssVar(colorVar));
  var mat = new THREE.MeshStandardMaterial({
    color: baseColor,
    map: tex,
    roughness: opts.roughness !== undefined ? opts.roughness : 0.50,
    metalness: opts.metalness !== undefined ? opts.metalness : 0.15,
    transparent: true,
    opacity: opts.opacity !== undefined ? opts.opacity : 0.88,
    side: THREE.DoubleSide,
    depthWrite: opts.depthWrite !== undefined ? opts.depthWrite : false,
    polygonOffset: true,
    polygonOffsetFactor: 1.0,
    polygonOffsetUnits: 1.0,
    emissive: 0x000000,
    emissiveIntensity: 0
  });

  var mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.baseEmissive = 0x000000;
  mesh.userData.baseEmissiveIntensity = 0;
  mesh.userData.isGaussianDoping = true;
  mesh.renderOrder = opts.renderOrder || 2;

  // Add 3D Iso-concentration Contour Wire Loops at depths eta = 0.25, 0.50, 0.75
  var contourEtas = [0.25, 0.50, 0.75];
  var nPerim = opts.nPerim || 48;
  var cornerR = opts.cornerR !== undefined ? opts.cornerR : Math.min(w, d) * 0.22;
  var straggle = opts.straggle !== undefined ? opts.straggle : 0.18;
  var halfW = w / 2;
  var halfD = d / 2;

  function getRoundedRectPt(hx, hz, cr, theta){
    var cos = Math.cos(theta);
    var sin = Math.sin(theta);
    var sx = Math.max(0, hx - cr);
    var sz = Math.max(0, hz - cr);
    var qx = cos >= 0 ? 1 : -1;
    var qz = sin >= 0 ? 1 : -1;
    var cCos = Math.abs(cos);
    var cSin = Math.abs(sin);
    var len = Math.hypot(cCos, cSin) || 1;
    return new THREE.Vector3(
      qx * (sx + cr * (cCos / len)),
      0,
      qz * (sz + cr * (cSin / len))
    );
  }

  contourEtas.forEach(function(eta, idx){
    var rFactor = Math.sqrt(Math.max(0, 1.0 - eta * eta));
    var curHx = halfW * (1.0 - straggle * (1.0 - rFactor));
    var curHz = halfD * (1.0 - straggle * (1.0 - rFactor));
    var curCr = cornerR * (0.35 + 0.65 * rFactor);
    var y = h * 0.5 - h * eta;

    var pts = [];
    for (var j = 0; j < nPerim; j++){
      var theta = (j / nPerim) * Math.PI * 2;
      var p = getRoundedRectPt(curHx, curHz, curCr, theta);
      p.y = y;
      pts.push(p);
    }
    var lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
    var lineMat = new THREE.LineBasicMaterial({
      color: opts.outlineColor ? new THREE.Color(opts.outlineColor) : baseColor.clone().offsetHSL(0, 0.1, 0.2),
      transparent: true,
      opacity: 0.70 - idx * 0.15,
      depthWrite: false
    });
    var loop = new THREE.LineLoop(lineGeo, lineMat);
    loop.raycast = function(){}; // Keep clicks focused on parent mesh
    mesh.add(loop);
  });

  // Top surface perimeter boundary line
  var topPts = [];
  for (var j = 0; j < nPerim; j++){
    var theta = (j / nPerim) * Math.PI * 2;
    var p = getRoundedRectPt(halfW, halfD, cornerR, theta);
    p.y = h * 0.5 + 0.005;
    topPts.push(p);
  }
  var topGeo = new THREE.BufferGeometry().setFromPoints(topPts);
  var topMat = new THREE.LineBasicMaterial({
    color: opts.outlineColor ? new THREE.Color(opts.outlineColor) : baseColor,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  var topLoop = new THREE.LineLoop(topGeo, topMat);
  topLoop.raycast = function(){};
  mesh.add(topLoop);

  // High-concentration internal core for volumetric glow
  var coreH = h * 0.60;
  var coreW = w * 0.70;
  var coreD = d * 0.70;
  var coreGeo = createGaussianTubGeometry(coreW, coreH, coreD, {
    nLayers: 12,
    nPerim: 32,
    straggle: straggle * 1.2,
    cornerR: cornerR * 0.7
  });
  var coreMat = new THREE.MeshBasicMaterial({
    color: baseColor,
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  var coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.y = (h * 0.5) - (coreH * 0.5) - (h * (peakV * 0.5));
  coreMesh.raycast = function(){};
  mesh.add(coreMesh);

  return mesh;
}

// ---------------------------------------------------------------------------
// FILLETED TRACE GEOMETRY (Smooth IC Layout Interconnects)
// ---------------------------------------------------------------------------
// Extrudes planar Metal-1 routing traces with smoothly filleted corners,
// rounded line ends, and beveled top/sidewall profiles to reflect
// realistic optical-proximity corrected (OPC) planarized interconnects.
function createFilletedTraceGeometry(w, h, d, cornerRadius, bevel){
  cornerRadius = Math.min(cornerRadius !== undefined ? cornerRadius : 0.14, Math.min(w, d) * 0.48);
  bevel = Math.min(bevel !== undefined ? bevel : 0.035, Math.min(w, h, d) * 0.25);
  var hw = w / 2;
  var hd = d / 2;
  var cr = cornerRadius;

  var shape = new THREE.Shape();
  shape.moveTo(-hw + cr, -hd);
  shape.lineTo(hw - cr, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + cr);
  shape.lineTo(hw, hd - cr);
  shape.quadraticCurveTo(hw, hd, hw - cr, hd);
  shape.lineTo(-hw + cr, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - cr);
  shape.lineTo(-hw, -hd + cr);
  shape.quadraticCurveTo(-hw, -hd, -hw + cr, -hd);

  var extrudeSettings = {
    steps: 1,
    depth: Math.max(0.001, h - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 3
  };
  var geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.rotateX(Math.PI / 2);
  geo.center();
  return geo;
}
var createBeveledBoxGeometry = createFilletedTraceGeometry;

// Procedural brushed metallic texture with directional micro-scratches
var brushedMetalTexCache = null;
function getBrushedMetalTexture(){
  if (brushedMetalTexCache) return brushedMetalTexCache;
  var c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#cccccc';
  ctx.fillRect(0, 0, 256, 256);
  for (var i = 0; i < 300; i++){
    var y = Math.random() * 256;
    var len = 30 + Math.random() * 150;
    var x = Math.random() * 256;
    var alpha = 0.08 + Math.random() * 0.15;
    ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(255,255,255,' + alpha + ')' : 'rgba(80,80,80,' + alpha + ')';
    ctx.lineWidth = 0.7 + Math.random() * 1.0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  var tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  brushedMetalTexCache = tex;
  return tex;
}

// ---------------------------------------------------------------------------
// BOX BUILDER (for dielectric, poly, contacts, metal wires, substrate)
// ---------------------------------------------------------------------------
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

// canvas-sprite labels with depth testing enabled so viewing from below correctly occludes them
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
var Y = {
  subBot: 0.0, subTop: 2.0,
  wellBot: 1.10, wellTop: 2.05,     // sits in the UPPER part of the substrate slab, barely proud of it
  actBot: 1.55, actTop: 1.95,       // recessed well below the well/substrate top surface
  oxideBot: 1.95, oxideTop: 1.985,  // thin chemical SiO2 interfacial oxide under the gates
  highkBot: 1.985, highkTop: 2.02,  // High-k HfO2 dielectric layer
  polyBot: 2.02, polyTop: 2.32,
  metalBot: 2.95, metalTop: 3.25
};

var CH = { min:-1.0, max:1.0 };            // gate/channel — 2 units = 2λ gate length
var SRC_X0 = -4.0, SRC_X1 = CH.min;        // source diffusion block — flush against the gate
var DRN_X0 = CH.max, DRN_X1 = 4.0;         // drain diffusion block — flush against the gate
var SRC_X = (SRC_X0+SRC_X1)/2;             // -2.5 — source contact, centered in its diffusion block
var DRN_X = (DRN_X0+DRN_X1)/2;             //  2.5 — drain contact, centered in its diffusion block
var TAP_X = -6.0;                          // well/substrate tap, clear of the source block (-4.0)

var ACTIVE_W = 6.0;                        // transistor width (Z-depth of source/gate/drain) — matches 6λ gate-width rule
var PMOS_ZC = 4.55, PMOS_Z0 = PMOS_ZC-ACTIVE_W/2, PMOS_Z1 = PMOS_ZC+ACTIVE_W/2;
var NMOS_ZC = -4.55, NMOS_Z0 = NMOS_ZC-ACTIVE_W/2, NMOS_Z1 = NMOS_ZC+ACTIVE_W/2;

var POLY_Z0 = NMOS_Z0;
var POLY_Z1 = PMOS_Z1 + 0.6;
var POLY_CT_Z = PMOS_Z1 + 0.3;             // IN contact — on the poly tail, just past PMOS diffusion edge

var RAIL_Z = PMOS_Z1 + 1.6;                // VDD/GND rails sit outside active/poly footprint

var LAYER_ORDER = ['substrate','well','active','oxide','highk','poly','contact','metal'];
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
// Base wafer slab — spans Z in [-12, 12], cleanly exposing P-substrate in the 1.50 gap [-0.75, 0.75]
var subMesh = box(22, Y.subTop-Y.subBot, 24, '--c-substrate', { roughness:0.85, metalness:0.05 });
subMesh.renderOrder = 1;
put(subMesh, -0.5, (Y.subTop+Y.subBot)/2, 0);
reg(subMesh, 'psub', 'substrate');

// ---------- WELLS — Physically accurate Gaussian retrograde implant tubs ----------
// Enforces both the "Well overlap of active" (6λ overlap) and realistic "Well-to-well spacing" (~10λ rule):
// Metal-1 wire width = 0.45. Well gap = 1.50 (3.333x metal width, 10λ vs 3λ rule).
// N-WELL spans Z in [0.75, 8.35] (center Z = +4.55, depth 7.60).
// P-WELL spans Z in [-8.35, -0.75] (center Z = -4.55, depth 7.60).
// PMOS active is centered at Z = 4.55, spanning Z in [1.55, 7.55] (margin 0.80 on both sides).
// NMOS active is centered at Z = -4.55, spanning Z in [-7.55, -1.55] (margin 0.80 on both sides).
// In X, wells span [-8.80, 6.20] (width 15.0, center X = -1.30), enclosing active and tap diffusions.
// The 1.50-unit gap between N-WELL and P-WELL cleanly reveals the underlying P-substrate silicon.
var wellH = Y.wellTop - Y.wellBot;
var wellW = 15.0;
var wellD = 7.60;
var wellX = -1.30;
var nwellZC = 4.55;
var pwellZC = -4.55;

// N-WELL (Phosphorus retrograde implant for PMOS)
var wellMesh = gaussianDopingMesh(wellW, wellH, wellD, '--c-well', {
  peakV: 0.35,      // Retrograde implant peak sits ~35% down into the well
  sigmaV: 0.28,     // Broad Gaussian with high thermal straggle
  straggle: 0.08,   // Controlled lateral straggle ensuring active is fully enclosed at all depths
  cornerR: 0.35,    // Tight corner radius so active corners never protrude
  opacity: 0.85,
  depthWrite: false,
  renderOrder: 2
});
put(wellMesh, wellX, (Y.wellTop+Y.wellBot)/2, nwellZC);
reg(wellMesh, 'nwell', 'well');

// P-WELL (Boron retrograde implant for NMOS in twin-well CMOS)
var pwellMesh = gaussianDopingMesh(wellW, wellH, wellD, '--c-substrate', {
  peakV: 0.35,
  sigmaV: 0.28,
  straggle: 0.08,
  cornerR: 0.35,
  opacity: 0.80,
  outlineColor: '#5a7799',
  depthWrite: false,
  renderOrder: 2
});
put(pwellMesh, wellX, (Y.wellTop+Y.wellBot)/2, pwellZC);
reg(pwellMesh, 'pwell', 'well');

// ---------- ACTIVE / DIFFUSION — Gaussian shallow-junction implant profiles ----------
// Source and drain are shallow implants: peak close to surface (BF2 for p+, As/P for n+),
// tight sigma, with lateral straggle extending under the poly gate edges.
function buildActiveRow(zc, srcColorVar, idPrefix, layerKey, dopingHex){
  var actH    = Y.actTop - Y.actBot;
  var actW_SD = SRC_X1 - SRC_X0;        // 3.0 units lateral width
  var actW_D  = DRN_X1 - DRN_X0;        // 3.0 units lateral width

  // Source — shallow Gaussian implant
  var src = gaussianDopingMesh(actW_SD, actH, ACTIVE_W, srcColorVar, {
    peakV: 0.15,      // Peak close to surface (~20 nm projected range)
    sigmaV: 0.22,     // Tight sigma for abrupt shallow junction
    straggle: 0.16,   // Lateral straggle under gate edge
    cornerR: 0.5,
    outlineColor: dopingHex,
    depthWrite: false,
    renderOrder: 3
  });
  put(src, SRC_X, (Y.actTop+Y.actBot)/2, zc);
  reg(src, idPrefix+'Src', layerKey);

  // Decorative gate inversion channel segment under the gate
  var gateSeg = box(CH.max-CH.min, actH*0.7, ACTIVE_W, srcColorVar,
    { roughness:0.5, opacity:0.28, transparent:true, outline:false });
  put(gateSeg, 0, (Y.actTop+Y.actBot)/2 - actH*0.15, zc);
  gateSeg.userData.decorative = true;
  gateSeg.renderOrder = 3;
  groups[layerKey].add(gateSeg);

  // Drain — shallow Gaussian implant
  var drn = gaussianDopingMesh(actW_D, actH, ACTIVE_W, srcColorVar, {
    peakV: 0.15,
    sigmaV: 0.22,
    straggle: 0.16,
    cornerR: 0.5,
    outlineColor: dopingHex,
    depthWrite: false,
    renderOrder: 3
  });
  put(drn, DRN_X, (Y.actTop+Y.actBot)/2, zc);
  reg(drn, idPrefix+'Drn', layerKey);

  return { src:src, drn:drn };
}
var pmosAct = buildActiveRow(PMOS_ZC, '--c-active-p', 'pmos', 'active', '#f0b877');
var nmosAct = buildActiveRow(NMOS_ZC, '--c-active-n', 'nmos', 'active', '#7fc3ec');

// ---------- WELL TAP / SUBSTRATE TAP — Gaussian ohmic contact diffusions ----------
var wellTapPad = gaussianDopingMesh(1.3, Y.actTop-Y.actBot, 1.3, '--c-well', {
  peakV: 0.18, sigmaV: 0.24, straggle: 0.20, cornerR: 0.3, outlineColor: '#8fe6c8', depthWrite: false, renderOrder: 3
});
put(wellTapPad, TAP_X, (Y.actTop+Y.actBot)/2, PMOS_ZC);
reg(wellTapPad, 'welltapAct', 'active');

var subTapPad = gaussianDopingMesh(1.3, Y.actTop-Y.actBot, 1.3, '--c-substrate', {
  peakV: 0.18, sigmaV: 0.24, straggle: 0.20, cornerR: 0.3, outlineColor: '#aab4c2', depthWrite: false, renderOrder: 3
});
put(subTapPad, TAP_X, (Y.actTop+Y.actBot)/2, NMOS_ZC);
reg(subTapPad, 'subtapAct', 'active');

// ---------- GATE OXIDE (Interfacial SiO2) ----------
var oxideH = Y.oxideTop - Y.oxideBot;
var oxideMidY = (Y.oxideTop + Y.oxideBot) / 2;

var oxidePmos = box(CH.max-CH.min, oxideH, ACTIVE_W, '--c-oxide', { roughness:0.15, metalness:0.0, transparent:true, opacity:0.85, outline:false });
put(oxidePmos, 0, oxideMidY, PMOS_ZC);
reg(oxidePmos, 'pmosOxide', 'oxide');

var oxideNmos = box(CH.max-CH.min, oxideH, ACTIVE_W, '--c-oxide', { roughness:0.15, metalness:0.0, transparent:true, opacity:0.85, outline:false });
put(oxideNmos, 0, oxideMidY, NMOS_ZC);
reg(oxideNmos, 'nmosOxide', 'oxide');

// ---------- HIGH-K DIELECTRIC (HfO2) ----------
// High-k dielectric (HfO2) layer sandwiched directly above interfacial SiO2 and below the gate
var highkH = Y.highkTop - Y.highkBot;
var highkMidY = (Y.highkTop + Y.highkBot) / 2;
var highkMat = { roughness:0.12, metalness:0.10, transparent:true, opacity:0.78, outline:false };

var highkPmos = box(CH.max-CH.min, highkH, ACTIVE_W, '--c-highk', highkMat);
put(highkPmos, 0, highkMidY, PMOS_ZC);
reg(highkPmos, 'pmosHighk', 'highk');

var highkNmos = box(CH.max-CH.min, highkH, ACTIVE_W, '--c-highk', highkMat);
put(highkNmos, 0, highkMidY, NMOS_ZC);
reg(highkNmos, 'nmosHighk', 'highk');

// ---------- POLYSILICON (single continuous strip) ----------
var polyMesh = box(CH.max-CH.min, Y.polyTop-Y.polyBot, POLY_Z1-POLY_Z0, '--c-poly', { roughness:0.45, metalness:0.2 });
put(polyMesh, 0, (Y.polyTop+Y.polyBot)/2, (POLY_Z0+POLY_Z1)/2);
reg(polyMesh, 'poly', 'poly');

// ---------- CONTACTS (Tapered Tungsten Plugs) ----------
function contactAt(x, z, topOfLower, id){
  var h = Y.metalBot - topOfLower;
  // Subtle conical taper: radiusTop = 0.21, radiusBottom = 0.17
  var geo = new THREE.CylinderGeometry(0.21, 0.17, h, 16);
  var mat = new THREE.MeshStandardMaterial({
    color: 0x4a4d54, // Dark tungsten/titanium metallic plug
    metalness: 0.95,
    roughness: 0.25,
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  var c = new THREE.Mesh(geo, mat);
  c.castShadow = true;
  c.receiveShadow = true;
  c.userData.baseEmissive = 0x000000;
  c.userData.baseEmissiveIntensity = 0;
  put(c, x, topOfLower + h / 2, z);
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

// ---------- METAL-1 (Smooth Filleted Routes, Landing Pads & Realistic Metallic Shaders) ----------
var metalH = Y.metalTop - Y.metalBot;
var midY = (Y.metalTop + Y.metalBot) / 2;
var METAL_W = 0.45;

function metalBar(x0, x1, z0, z1, colorVar, id, cornerRadius){
  var w = Math.abs(x1 - x0) || METAL_W;
  var d = Math.abs(z1 - z0) || METAL_W;
  var finalW = Math.max(w, METAL_W);
  var finalD = Math.max(d, METAL_W);

  var geo = createFilletedTraceGeometry(finalW, metalH, finalD, cornerRadius !== undefined ? cornerRadius : 0.16, 0.035);
  var mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssVar(colorVar)),
    metalness: 0.90,
    roughness: 0.20,
    roughnessMap: getBrushedMetalTexture(),
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  var m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.baseEmissive = 0x000000;
  m.userData.baseEmissiveIntensity = 0;
  put(m, (x0 + x1) / 2, midY, (z0 + z1) / 2);
  reg(m, id, 'metal');
  return m;
}

// Rounded contact via landing pads (flared metal-1 enclosure around contact plugs)
function metalViaPad(x, z, colorVar, parentId){
  var padGeo = createFilletedTraceGeometry(0.70, metalH, 0.70, 0.32, 0.035);
  var mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssVar(colorVar)),
    metalness: 0.90,
    roughness: 0.20,
    roughnessMap: getBrushedMetalTexture(),
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  var m = new THREE.Mesh(padGeo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.baseEmissive = 0x000000;
  m.userData.baseEmissiveIntensity = 0;
  m.userData.isViaLanding = true;
  put(m, x, midY, z);
  reg(m, parentId || 'metal', 'metal');
  return m;
}

// Smooth filleted T-junction transition pad
function metalJunction(x, z, w, d, colorVar, parentId){
  var juncGeo = createFilletedTraceGeometry(w, metalH, d, 0.22, 0.035);
  var mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(cssVar(colorVar)),
    metalness: 0.90,
    roughness: 0.20,
    roughnessMap: getBrushedMetalTexture(),
    emissive: 0x000000,
    emissiveIntensity: 0
  });
  var m = new THREE.Mesh(juncGeo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.baseEmissive = 0x000000;
  m.userData.baseEmissiveIntensity = 0;
  m.userData.isViaLanding = true;
  put(m, x, midY, z);
  reg(m, parentId || 'metal', 'metal');
  return m;
}

// VDD rail + stubs
metalBar(-9, 9, RAIL_Z, RAIL_Z, '--c-vdd', 'vddRail');
metalBar(SRC_X, SRC_X, PMOS_ZC, RAIL_Z, '--c-vdd', 'vddStubPmos');
metalBar(TAP_X, TAP_X, PMOS_ZC, RAIL_Z, '--c-vdd', 'vddStubTap');
// VDD filleted junctions & via landings
metalJunction(SRC_X, RAIL_Z, 0.85, 0.85, '--c-vdd', 'vddStubPmos');
metalJunction(TAP_X, RAIL_Z, 0.85, 0.85, '--c-vdd', 'vddStubTap');
metalViaPad(SRC_X, PMOS_ZC, '--c-vdd', 'vddStubPmos');
metalViaPad(TAP_X, PMOS_ZC, '--c-vdd', 'vddStubTap');

// GND rail + stubs
metalBar(-9, 9, -RAIL_Z, -RAIL_Z, '--c-gnd', 'gndRail');
metalBar(SRC_X, SRC_X, NMOS_ZC, -RAIL_Z, '--c-gnd', 'gndStubNmos');
metalBar(TAP_X, TAP_X, NMOS_ZC, -RAIL_Z, '--c-gnd', 'gndStubTap');
// GND filleted junctions & via landings
metalJunction(SRC_X, -RAIL_Z, 0.85, 0.85, '--c-gnd', 'gndStubNmos');
metalJunction(TAP_X, -RAIL_Z, 0.85, 0.85, '--c-gnd', 'gndStubTap');
metalViaPad(SRC_X, NMOS_ZC, '--c-gnd', 'gndStubNmos');
metalViaPad(TAP_X, NMOS_ZC, '--c-gnd', 'gndStubTap');

// OUT
metalBar(DRN_X, DRN_X, PMOS_ZC, NMOS_ZC, '--c-out', 'outSpine');
metalBar(DRN_X, DRN_X+3.5, 0, 0, '--c-out', 'outPin');
// OUT filleted junction & via landings
metalJunction(DRN_X, 0, 0.90, 0.90, '--c-out', 'outSpine');
metalViaPad(DRN_X, PMOS_ZC, '--c-out', 'outSpine');
metalViaPad(DRN_X, NMOS_ZC, '--c-out', 'outSpine');

// IN
metalBar(0, 0, POLY_CT_Z, POLY_CT_Z+0.9, '--c-in', 'inPin');
metalViaPad(0, POLY_CT_Z, '--c-in', 'inPin');

// =====================================================================
// LABELS
// =====================================================================
function addLabel(text, x,y,z, colorHex, groupKey){
  var s = makeLabel(text, colorHex);
  s.position.set(x,y,z);
  s.userData.isLabel = true;
  groups[groupKey].add(s);
  return s;
}
addLabel('VDD', -9, Y.metalTop+0.6, RAIL_Z, '#e35d5d', 'metal');
addLabel('PMOS', SRC_X-1.2, Y.actTop+0.9, PMOS_ZC, '#cf8a4a', 'active');
addLabel('N-WELL', 4.8, Y.wellTop+0.5, nwellZC, '#3f8f6f', 'well');
addLabel('P-WELL', 4.8, Y.wellTop+0.5, pwellZC, '#4a92c9', 'well');
addLabel('POLY GATE', 0, Y.polyTop+0.7, 0, '#d8503c', 'poly');
addLabel('HIGH-K (HfO2)', -1.9, Y.highkTop+0.35, PMOS_ZC, '#c084fc', 'highk');
addLabel('SiO2 OXIDE', 1.9, Y.oxideTop+0.35, PMOS_ZC, '#8fc9dc', 'oxide');
addLabel('IN', 0, Y.metalTop+0.6, POLY_CT_Z+1.1, '#e6c94a', 'metal');
addLabel('OUT', DRN_X+3.6, Y.metalTop+0.6, 0, '#57cf8f', 'metal');
addLabel('NMOS', SRC_X-1.2, Y.actTop+0.9, NMOS_ZC, '#4a92c9', 'active');
addLabel('P-SUBSTRATE', 8.5, Y.subTop+0.4, 0, '#9aa6b6', 'substrate');
addLabel('GND', -9, Y.metalTop+0.6, -RAIL_Z, '#9aa6b6', 'metal');
