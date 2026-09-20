/**
 * controls-explode-scrub.js
 * The Explode-layers slider and the always-on X/Y/Z section-scrub clipping planes.
 */

// =====================================================================
// EXPLODE
// =====================================================================
var explodeSlider = document.getElementById('explode-slider');
var explodeVal = document.getElementById('explode-val');
function applyExplode(pct){
  var f = pct/100;
  LAYER_ORDER.forEach(function(key, idx){
    groups[key].position.y = idx * EXPLODE_GAP * f;
  });
  explodeVal.textContent = pct + '%';
  rebuildFlowCurves(); // keep the animated flow markers glued to the (now offset) geometry
}
explodeSlider.addEventListener('input', function(e){ applyExplode(parseInt(e.target.value,10)); });

// =====================================================================
// SECTION SCRUB — always available, three independent axis-aligned planes.
// Each slider defaults to the extreme end of its range, i.e. positioned
// beyond the model entirely, so nothing is clipped until the user drags it.
// =====================================================================
var clipX = new THREE.Plane(new THREE.Vector3(-1,0,0), 12.5);
var clipY = new THREE.Plane(new THREE.Vector3(0,-1,0), 22);
var clipZ = new THREE.Plane(new THREE.Vector3(0,0,-1), 15);
renderer.clippingPlanes = [clipX, clipY, clipZ];

function wireScrub(sliderId, valId, plane, scale){
  var slider = document.getElementById(sliderId);
  var valEl = document.getElementById(valId);
  var maxV = parseFloat(slider.max);
  function apply(){
    var raw = parseFloat(slider.value);
    plane.constant = raw / scale;
    valEl.textContent = (raw >= maxV) ? 'off' : (Math.round((raw/scale)*100)/100);
  }
  slider.addEventListener('input', apply);
  apply();
  return { slider:slider, apply:apply };
}
var scrubX = wireScrub('scrub-x-slider', 'scrub-x-val', clipX, 100);
var scrubY = wireScrub('scrub-y-slider', 'scrub-y-val', clipY, 100);
var scrubZ = wireScrub('scrub-z-slider', 'scrub-z-val', clipZ, 100);

function resetScrub(){
  [scrubX, scrubY, scrubZ].forEach(function(s){ s.slider.value = s.slider.max; s.apply(); });
}

