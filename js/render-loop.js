/**
 * render-loop.js
 * The requestAnimationFrame render loop, dynamic travelling emissive glow wave on active Metal-1 routes,
 * indeterminate floating gate warm amber pulsing in High-Z (IN = OFF), and layer-color mapping.
 */

// =====================================================================
// RENDER LOOP
// =====================================================================
var clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  var dt = clock.getDelta();
  var t = clock.getElapsedTime();

  if (typeof updateBuildAnimation === 'function'){
    updateBuildAnimation(dt);
  }

  stepFlowMarkers(dt);
  selectable.forEach(function(m){
    if (!m || !m.material || !m.material.emissive) return;
    if (m.userData.pulsing){
      if (selectedMeshes.indexOf(m) === -1){
        if (m.userData.layer === 'metal'){
          // Dynamic travelling emissive glow wave along conducting Metal-1 routes
          var flowColor;
          if (typeof currentIn !== 'undefined' && currentIn === 'off'){
            flowColor = (typeof flowMode !== 'undefined' && flowMode === 'electron') ? 0x38bdf8 : 0xf59e0b;
          } else {
            flowColor = (typeof flowMode !== 'undefined' && flowMode === 'electron') ? 0x4fd1ff : 0xffcf4d;
          }
          var wave = 0.5 + 0.5 * Math.sin(t * 5.0 - (m.position.z || 0) * 0.5);
          var pulse = 0.35 + 0.55 * wave;
          m.material.emissive.setHex(flowColor);
          m.material.emissiveIntensity = pulse;
        } else {
          var pulse = 0.35 + Math.abs(Math.sin(t*2.2))*0.35;
          m.material.emissive.setHex(new THREE.Color(cssVar(layerColorOf(m))).getHex());
          m.material.emissiveIntensity = pulse;
        }
      }
    } else if (selectedMeshes.indexOf(m) === -1 && m.material.emissiveIntensity !== m.userData.baseEmissiveIntensity){
      m.material.emissive.setHex(m.userData.baseEmissive || 0);
      m.material.emissiveIntensity = m.userData.baseEmissiveIntensity || 0;
    }
  });

  // Floating Gate Visual FX:
  // IN Metal-1 wire and continuous Polysilicon Gate strip pulse with warm amber glow when IN = OFF
  if (typeof currentIn !== 'undefined' && currentIn === 'off'){
    var amberWave = 0.5 + 0.5 * Math.sin(t * 3.8);
    var amberPulse = 0.35 + 0.45 * amberWave;
    var inPinMesh = findMesh('inPin');
    var polyMesh = findMesh('poly');
    if (inPinMesh && inPinMesh.material && inPinMesh.material.emissive && selectedMeshes.indexOf(inPinMesh) === -1){
      inPinMesh.material.emissive.setHex(0xf59e0b);
      inPinMesh.material.emissiveIntensity = amberPulse;
    }
    if (polyMesh && polyMesh.material && polyMesh.material.emissive && selectedMeshes.indexOf(polyMesh) === -1){
      polyMesh.material.emissive.setHex(0xf59e0b);
      polyMesh.material.emissiveIntensity = amberPulse;
    }
  }

  controls.update();
  updatePopoverPosition();
  renderer.render(scene, activeCamera);
}
function layerColorOf(m){
  var id = m.userData.id;
  if (id === 'inPin') return '--c-in';
  if (id.indexOf('out') === 0 || id === 'outSpine') return '--c-out';
  if (id.indexOf('vdd') === 0) return '--c-vdd';
  if (id.indexOf('gnd') === 0) return '--c-gnd';
  if (id.indexOf('Ct') !== -1) return '--c-contact';
  if (id === 'pmosSrc' || id === 'pmosDrn') return '--c-active-p';
  if (id === 'nmosSrc' || id === 'nmosDrn') return '--c-active-n';
  return '--c-metal';
}
