/**
 * render-loop.js
 * The requestAnimationFrame render loop, dynamic travelling emissive glow wave on active Metal-1 routes,
 * layer-color mapping, and stationary inspection freeze in OFF / High-Z state.
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

  var isOffState = (typeof currentIn !== 'undefined' && currentIn === 'off');

  if (!isOffState){
    stepFlowMarkers(dt);
  }

  selectable.forEach(function(m){
    if (!m || !m.material || !m.material.emissive) return;
    if (selectedMeshes.indexOf(m) !== -1) return; // Retain user selection highlight

    if (isOffState){
      // Complete freeze in OFF state: reset all meshes to static base emissive, no motion or pulsing
      if (m.material.emissiveIntensity !== (m.userData.baseEmissiveIntensity || 0)){
        m.material.emissive.setHex(m.userData.baseEmissive || 0);
        m.material.emissiveIntensity = m.userData.baseEmissiveIntensity || 0;
      }
      return;
    }

    if (m.userData.pulsing){
      if (m.userData.layer === 'metal'){
        // Smooth, human-readable travelling emissive glow wave along conducting Metal-1 routes
        var flowColor = (typeof flowMode !== 'undefined' && flowMode === 'electron') ? 0x4fd1ff : 0xffcf4d;
        var wave = 0.5 + 0.5 * Math.sin(t * 2.0 - (m.position.z || 0) * 0.45);
        var pulse = 0.35 + 0.55 * wave;
        m.material.emissive.setHex(flowColor);
        m.material.emissiveIntensity = pulse;
      } else {
        // Relaxed, calm breathing rhythm
        var pulse = 0.35 + Math.abs(Math.sin(t * 1.2)) * 0.35;
        m.material.emissive.setHex(new THREE.Color(cssVar(layerColorOf(m))).getHex());
        m.material.emissiveIntensity = pulse;
      }
    } else if (m.material.emissiveIntensity !== (m.userData.baseEmissiveIntensity || 0)){
      m.material.emissive.setHex(m.userData.baseEmissive || 0);
      m.material.emissiveIntensity = m.userData.baseEmissiveIntensity || 0;
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
