/**
 * render-loop.js
 * The requestAnimationFrame render loop and the small helper that maps a mesh id to its legend color for the pulsing highlight.
 */

// =====================================================================
// RENDER LOOP
// =====================================================================
var clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  var dt = clock.getDelta();
  var t = clock.getElapsedTime();

  stepFlowMarkers(dt);
  selectable.forEach(function(m){
    if (m.userData.pulsing){
      var pulse = 0.35 + Math.abs(Math.sin(t*2.2))*0.35;
      if (selectedMeshes.indexOf(m) === -1){
        m.material.emissive.setHex(new THREE.Color(cssVar(layerColorOf(m))).getHex());
        m.material.emissiveIntensity = pulse;
      }
    } else if (selectedMeshes.indexOf(m) === -1 && m.material.emissiveIntensity !== m.userData.baseEmissiveIntensity){
      m.material.emissive.setHex(m.userData.baseEmissive);
      m.material.emissiveIntensity = m.userData.baseEmissiveIntensity;
    }
  });

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

