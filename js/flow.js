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

var METAL_FLOW_Y = (Y.metalTop + Y.metalBot) / 2;

var PMOS_PATH_BASE = [
  { p:new THREE.Vector3(SRC_X, METAL_FLOW_Y, RAIL_Z), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, METAL_FLOW_Y, PMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(0,      Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(DRN_X, Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(DRN_X, METAL_FLOW_Y, PMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, METAL_FLOW_Y, 0), layer:'metal' }
];

var NMOS_PATH_BASE = [
  { p:new THREE.Vector3(DRN_X, METAL_FLOW_Y, 0), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, METAL_FLOW_Y, NMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(0,      Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(SRC_X, Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(SRC_X, METAL_FLOW_Y, NMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, METAL_FLOW_Y, -RAIL_Z), layer:'metal' }
];

var SHOOT_THROUGH_PATH_BASE = [
  { p:new THREE.Vector3(SRC_X, METAL_FLOW_Y, RAIL_Z), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, METAL_FLOW_Y, PMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(0,      Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(DRN_X, Y.actTop+0.15, PMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(DRN_X, METAL_FLOW_Y, PMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, METAL_FLOW_Y, 0), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, METAL_FLOW_Y, NMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(DRN_X, Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(0,      Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(SRC_X, Y.actTop+0.15, NMOS_ZC), layer:'active' },
  { p:new THREE.Vector3(SRC_X, METAL_FLOW_Y, NMOS_ZC), layer:'metal' },
  { p:new THREE.Vector3(SRC_X, METAL_FLOW_Y, -RAIL_Z), layer:'metal' }
];

var pmosCurve, nmosCurve, shootThroughCurve;
function rebuildFlowCurves(){
  function build(base){
    var pts = base.map(function(pt){
      var grp = groups[pt.layer];
      var offsetX = grp ? grp.position.x : 0;
      var offsetY = grp ? grp.position.y : 0;
      var offsetZ = grp ? grp.position.z : 0;
      return new THREE.Vector3(pt.p.x + offsetX, pt.p.y + offsetY, pt.p.z + offsetZ);
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
  // clear pulsing on everything
  selectable.forEach(function(m){ m.userData.pulsing = false; });

  if (currentIn === 'off'){
    // In OFF state, all flow is deactivated, particles are hidden and frozen
    flowMarkers.forEach(function(fm){ fm.mesh.visible = false; });
    flowCaption.classList.add('visible');
    flowCaption.textContent = 'CIRCUIT STATE: OFF / HIGH-Z (STATIONARY — ALL FLOW INACTIVE)';
    selectable.forEach(function(m){
      if (m && m.material && m.material.emissive && selectedMeshes.indexOf(m) === -1){
        m.material.emissive.setHex(m.userData.baseEmissive || 0);
        m.material.emissiveIntensity = m.userData.baseEmissiveIntensity || 0;
      }
    });
    return;
  }

  activePathIds().forEach(function(id){
    var m = findMesh(id);
    if (m) m.userData.pulsing = true;
  });
  var col = flowMode === 'current' ? 0xffcf4d : 0x4fd1ff;
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
  if (currentIn === 'off') return; // Completely freeze in OFF state
  var curve = activeCurve();
  var reversed = flowMode === 'electron';
  var speed = 0.075; // Calm, human-readable flow speed
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
