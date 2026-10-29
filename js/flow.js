/**
 * flow.js
 * Animated current/electron flow: builds the conventional-current-direction curves for each transistor,
 * including shoot-through leakage current for High-Z floating input (IN = OFF), rebuilds them whenever
 * Explode changes, and steps the arrow markers each frame.
 */

// =====================================================================
// SHOW CONNECTIONS — animated current / electron flow
// =====================================================================
var flowMode = 'current'; // 'current' | 'electron'
var flowSeg = document.getElementById('flow-seg');
var flowCaption = document.getElementById('flow-caption');
var markerGroup = new THREE.Group(); scene.add(markerGroup);

var PMOS_PATH_IDS = ['vddRail','vddStubPmos','pmosSrcCt','pmosSrc','pmosDrn','pmosDrnCt','outSpine'];
var NMOS_PATH_IDS = ['outSpine','nmosDrnCt','nmosDrn','nmosSrc','nmosSrcCt','gndStubNmos','gndRail'];

// Shoot-through / leakage current path when IN = OFF (floating gate):
// Direct conduction from VDD rail through PMOS down through OUT spine into NMOS and sinking into GND
var SHOOT_THROUGH_PATH_IDS = [
  'vddRail','vddStubPmos','pmosSrcCt','pmosSrc','pmosDrn','pmosDrnCt',
  'outSpine',
  'nmosDrnCt','nmosDrn','nmosSrc','nmosSrcCt','gndStubNmos','gndRail'
];

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

var SHOOT_THROUGH_PATH_BASE = [
  { p:new THREE.Vector3(SRC_X, Y.metalTop-0.15, RAIL_Z), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, Y.metalTop-0.15, PMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(0,      Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(DRN_X, Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(DRN_X, Y.metalTop-0.15, PMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, Y.metalTop-0.15, 0), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, Y.metalTop-0.15, NMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(0,      Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(SRC_X, Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(SRC_X, Y.metalTop-0.15, NMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, Y.metalTop-0.15, -RAIL_Z), layer:'metal' }
];

var pmosCurve, nmosCurve, shootThroughCurve;
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
  shootThroughCurve = build(SHOOT_THROUGH_PATH_BASE);
}
rebuildFlowCurves();

var N_MARKERS = 6;
var flowMarkers = [];
for (var fi=0; fi<N_MARKERS; fi++){
  var coneGeo = new THREE.ConeGeometry(0.14, 0.34, 10);
  var coneMat = new THREE.MeshStandardMaterial({ color:0xffcf4d, emissive:0xffcf4d, emissiveIntensity:0.9 });
  var cone = new THREE.Mesh(coneGeo, coneMat);
  markerGroup.add(cone);
  flowMarkers.push({ mesh:cone, t: fi / N_MARKERS });
}

function activePathIds(){
  if (currentIn === 'off') return SHOOT_THROUGH_PATH_IDS;
  return currentIn === 0 ? PMOS_PATH_IDS : NMOS_PATH_IDS;
}
function activeCurve(){
  if (currentIn === 'off') return shootThroughCurve;
  return currentIn === 0 ? pmosCurve : nmosCurve;
}

function updateFlowCaption(){
  flowCaption.classList.add('visible');
  var modeLabel = flowMode === 'current' ? 'CONVENTIONAL CURRENT' : 'ELECTRON FLOW';
  var desc;
  if (currentIn === 'off'){
    modeLabel += ' [HIGH-Z LEAKAGE]';
    desc = flowMode === 'current'
      ? 'VDD \u2192 PMOS \u2192 OUT \u2192 NMOS \u2192 GND (SHOOT-THROUGH LEAKAGE)'
      : 'GND \u2192 NMOS \u2192 OUT \u2192 PMOS \u2192 VDD (SHOOT-THROUGH LEAKAGE)';
  } else if (currentIn === 0){
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
  var col;
  if (currentIn === 'off'){
    col = flowMode === 'current' ? 0xf59e0b : 0x38bdf8;
  } else {
    col = flowMode === 'current' ? 0xffcf4d : 0x4fd1ff;
  }
  flowMarkers.forEach(function(fm){
    fm.mesh.visible = true;
    fm.mesh.material.color.setHex(col);
    fm.mesh.material.emissive.setHex(col);
  });
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
  var speed = currentIn === 'off' ? 0.18 : 0.22;
  flowMarkers.forEach(function(fm){
    fm.t += dt * speed;
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
