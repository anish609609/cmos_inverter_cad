/**
 * controls-explode-scrub.js
 * The Explode (X, Y, Z) sliders and the always-on X/Y/Z section-scrub clipping planes.
 */

// =====================================================================
// EXPLODE (X, Y, Z)
// =====================================================================
var explodeXSlider = document.getElementById('explode-x-slider');
var explodeYSlider = document.getElementById('explode-y-slider');
var explodeZSlider = document.getElementById('explode-z-slider');
var explodeSlider = explodeYSlider; // backward-compatibility alias

var explodeXVal = document.getElementById('explode-x-val');
var explodeYVal = document.getElementById('explode-y-val');
var explodeZVal = document.getElementById('explode-z-val');

var explodeX = 0;
var explodeY = 1;
var explodeZ = 0;

function applyExplode(pctX, pctY, pctZ){
  // Support legacy single-argument call applyExplode(pctY)
  if (arguments.length === 1 && typeof arguments[0] === 'number'){
    pctY = pctX;
    pctX = 0;
    pctZ = 0;
  }

  if (typeof pctX === 'number') explodeX = pctX;
  if (typeof pctY === 'number') explodeY = pctY;
  if (typeof pctZ === 'number') explodeZ = pctZ;

  var fx = explodeX / 100;
  var fy = explodeY / 100;
  var fz = explodeZ / 100;

  LAYER_ORDER.forEach(function(key, idx){
    if (!groups[key]) return;
    groups[key].position.x = idx * EXPLODE_GAP * fx;
    groups[key].position.y = idx * EXPLODE_GAP * fy;
    groups[key].position.z = idx * EXPLODE_GAP * fz;
  });

  if (explodeXVal) explodeXVal.textContent = Math.round(explodeX) + '%';
  if (explodeYVal) explodeYVal.textContent = Math.round(explodeY) + '%';
  if (explodeZVal) explodeZVal.textContent = Math.round(explodeZ) + '%';

  if (explodeXSlider && parseInt(explodeXSlider.value, 10) !== Math.round(explodeX)) explodeXSlider.value = Math.round(explodeX);
  if (explodeYSlider && parseInt(explodeYSlider.value, 10) !== Math.round(explodeY)) explodeYSlider.value = Math.round(explodeY);
  if (explodeZSlider && parseInt(explodeZSlider.value, 10) !== Math.round(explodeZ)) explodeZSlider.value = Math.round(explodeZ);

  rebuildFlowCurves(); // keep animated flow markers glued to offset geometry
}

if (explodeXSlider){
  explodeXSlider.addEventListener('input', function(e){
    applyExplode(parseInt(e.target.value, 10), undefined, undefined);
  });
}
if (explodeYSlider){
  explodeYSlider.addEventListener('input', function(e){
    applyExplode(undefined, parseInt(e.target.value, 10), undefined);
  });
}
if (explodeZSlider){
  explodeZSlider.addEventListener('input', function(e){
    applyExplode(undefined, undefined, parseInt(e.target.value, 10));
  });
}

// =====================================================================
// SECTION SCRUB — always available, three independent axis-aligned planes.
// Max values positioned beyond the model, so nothing is clipped until dragged.
// Y max is 50.0 (slider 5000) ensuring 100% explode (top metal at y=25.5)
// is never clipped by the scrub plane.
// =====================================================================
var clipX = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 35);
var clipY = new THREE.Plane(new THREE.Vector3(0, -1, 0), 50);
var clipZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 35);
renderer.clippingPlanes = [clipX, clipY, clipZ];

function wireScrub(sliderId, valId, plane, scale){
  var slider = document.getElementById(sliderId);
  var valEl = document.getElementById(valId);
  if (!slider || !valEl) return { slider: slider, apply: function(){} };
  var maxV = parseFloat(slider.max);
  function apply(){
    var raw = parseFloat(slider.value);
    plane.constant = raw / scale;
    valEl.textContent = (raw >= maxV) ? 'off' : (Math.round((raw / scale) * 10) / 10);
  }
  slider.addEventListener('input', apply);
  apply();
  return { slider: slider, apply: apply };
}

var scrubX = wireScrub('scrub-x-slider', 'scrub-x-val', clipX, 100);
var scrubY = wireScrub('scrub-y-slider', 'scrub-y-val', clipY, 100);
var scrubZ = wireScrub('scrub-z-slider', 'scrub-z-val', clipZ, 100);

function resetScrub(){
  [scrubX, scrubY, scrubZ].forEach(function(s){
    if (s && s.slider){
      s.slider.value = s.slider.max;
      s.apply();
    }
  });
}
