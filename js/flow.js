/**
 * flow.js
 * Animated current/electron flow: builds the conventional-current-direction curves for each transistor, rebuilds them whenever Explode changes, and steps the arrow markers each frame.
 */

// =====================================================================
// SHOW CONNECTIONS — animated current / electron flow
// =====================================================================
// Only the transistor that is actually ON conducts, so only ONE path
// (VDD→PMOS→OUT, or OUT→NMOS→GND) is animated at a time, matching real
// inverter behavior for the selected IN value. The CURRENT/ELECTRONS toggle
// flips the arrow direction: conventional current flows from + to -,
// electrons physically move the opposite way. The flow is always shown —
// there is no separate on/off toggle — it simply follows whichever value
// IN is currently set to.
var flowMode = 'current'; // 'current' | 'electron'
var flowSeg = document.getElementById('flow-seg');
var flowCaption = document.getElementById('flow-caption');
var markerGroup = new THREE.Group(); scene.add(markerGroup);

var PMOS_PATH_IDS = ['vddRail','vddStubPmos','pmosSrcCt','pmosSrc','pmosDrn','pmosDrnCt','outSpine'];
var NMOS_PATH_IDS = ['outSpine','nmosDrnCt','nmosDrn','nmosSrc','nmosSrcCt','gndStubNmos','gndRail'];

// Points given in the CONVENTIONAL CURRENT direction (source of charge →
// sink), tagged with which layer group each point belongs to. Rebuilt
// whenever explode changes, so the animated markers stay glued to the
// (possibly offset) geometry instead of floating at their un-exploded spot.
var PMOS_PATH_BASE = [
  { p:new THREE.Vector3(SRC_X, Y.metalTop-0.15, RAIL_Z), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, Y.metalTop-0.15, PMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(0,      Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(DRN_X, Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(DRN_X, Y.metalTop-0.15, PMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, Y.metalTop-0.15, 0), layer:'metal' }
];
var NMOS_PATH_BASE = [
  { p:new THREE.Vector3(DRN_X, Y.metalTop-0.15, 0), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, Y.metalTop-0.15, NMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(0,      Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(SRC_X, Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(SRC_X, Y.metalTop-0.15, NMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, Y.metalTop-0.15, -RAIL_Z), layer:'metal' }
];
var pmosCurve, nmosCurve;
function rebuildFlowCurves(){
  function build(base){
    var pts = base.map(function(pt){
      var offsetY = groups[pt.layer] ? groups[pt.layer].position.y : 0;
      return new THREE.Vector3(pt.p.x, pt.p.y + offsetY, pt.p.z);
    });
    return new THREE.CatmullRomCurve3(pts);
  }
  pmosCurve = build(PMOS_PATH_BASE);
  nmosCurve = build(NMOS_PATH_BASE);
}
rebuildFlowCurves();

var N_MARKERS = 4;
var flowMarkers = [];
for (var fi=0; fi<N_MARKERS; fi++){
  var coneGeo = new THREE.ConeGeometry(0.14, 0.34, 10);
  var coneMat = new THREE.MeshStandardMaterial({ color:0xffcf4d, emissive:0xffcf4d, emissiveIntensity:0.9 });
  var cone = new THREE.Mesh(coneGeo, coneMat);
  markerGroup.add(cone);
  flowMarkers.push({ mesh:cone, t: fi / N_MARKERS });
}

function activePathIds(){ return currentIn === 0 ? PMOS_PATH_IDS : NMOS_PATH_IDS; }
function activeCurve(){ return currentIn === 0 ? pmosCurve : nmosCurve; }

function updateFlowCaption(){
  flowCaption.classList.add('visible');
  var modeLabel = flowMode === 'current' ? 'CONVENTIONAL CURRENT' : 'ELECTRON FLOW';
  var desc;
  if (currentIn === 0){
    desc = flowMode === 'current' ? 'VDD \u2192 PMOS \u2192 OUT' : 'OUT \u2192 PMOS \u2192 VDD';
  } else {
    desc = flowMode === 'current' ? 'OUT \u2192 NMOS \u2192 GND' : 'GND \u2192 NMOS \u2192 OUT';
  }
  flowCaption.textContent = modeLabel + ':  ' + desc;
}

function refreshConnections(){
  // clear pulsing on everything, then re-arm only the currently-active path
  selectable.forEach(function(m){ m.userData.pulsing = false; });
  activePathIds().forEach(function(id){
    var m = findMesh(id);
    if (m) m.userData.pulsing = true;
  });
  var col = flowMode === 'current' ? 0xffcf4d : 0x4fd1ff;
  flowMarkers.forEach(function(fm){ fm.mesh.visible = true; fm.mesh.material.color.setHex(col); fm.mesh.material.emissive.setHex(col); });
  updateFlowCaption();
}

flowSeg.addEventListener('click', function(e){
  var btn = e.target.closest('button'); if (!btn) return;
  flowSeg.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  flowMode = btn.dataset.flow === 'electron' ? 'electron' : 'current';
  refreshConnections();
});

var UP_AXIS = new THREE.Vector3(0,1,0);
function stepFlowMarkers(dt){
  var curve = activeCurve();
  var reversed = flowMode === 'electron';
  flowMarkers.forEach(function(fm){
    fm.t += dt * 0.22;
    if (fm.t > 1) fm.t -= 1;
    var sampleT = reversed ? (1 - fm.t) : fm.t;
    var p = curve.getPointAt(Math.min(Math.max(sampleT,0.0001),0.9999));
    var tan = curve.getTangentAt(Math.min(Math.max(sampleT,0.0001),0.9999)).normalize();
    if (reversed) tan.multiplyScalar(-1);
    fm.mesh.position.copy(p);
    var q = new THREE.Quaternion().setFromUnitVectors(UP_AXIS, tan);
    fm.mesh.quaternion.copy(q);
  });
}

