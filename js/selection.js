/**
 * selection.js
 * Click-to-inspect: the shared info-HTML builder, the Property Inspector panel, the anchored component popover (position tracked every frame), and the raycaster click handler that ties 3D clicks to both.
 */

// =====================================================================
// SELECTION / INSPECTOR
// =====================================================================
var selectedMeshes = [];
var HIGHLIGHT_COLOR = new THREE.Color(cssVar('--highlight')); // bright magenta — kept far from the well's teal-green and every layer color so selection is unambiguous

function clearSelection(){
  selectedMeshes.forEach(function(m){
    m.material.emissive.setHex(m.userData.baseEmissive);
    m.material.emissiveIntensity = m.userData.baseEmissiveIntensity;
  });
  selectedMeshes = [];
  document.querySelectorAll('#tree .node.selected').forEach(function(n){ n.classList.remove('selected'); });
}

function highlightMeshes(meshes){
  clearSelection();
  meshes.forEach(function(m){
    m.material.emissive = HIGHLIGHT_COLOR.clone();
    m.material.emissiveIntensity = 0.55;
    selectedMeshes.push(m);
  });
}

var lastSelectedId = null;

function buildInfoHtml(id, info){
  if (!info) return '<div class="empty">No inspector data for this element.</div>';
  return '<div class="title">'+info.title+'</div>'+
    '<div class="field"><div class="k">FUNCTION</div><div class="v">'+info.fn+'</div></div>'+
    '<div class="field"><div class="k">ELECTRICAL ROLE</div><div class="v">'+info.role+'</div></div>'+
    '<div class="field"><div class="k">CONNECTION</div><div class="v">'+info.conn+'</div></div>'+
    '<div class="field"><div class="k">PHYSICAL RELATIONSHIP</div><div class="v">'+info.rel+'</div></div>'+
    (info.doping ? '<div class="field"><div class="k">DOPING CONCENTRATION</div><div class="v">'+info.doping+'</div></div>' : '') +
    dimsHtmlForId(id);
}

function showInspector(id, info){
  document.getElementById('inspector').innerHTML = buildInfoHtml(id, info);
}

// ---- anchored component popover ----
var popoverEl = document.getElementById('popover');
var popoverMeshes = [];
var popoverWorldPos = new THREE.Vector3();

function showPopoverFor(meshes, id, info){
  popoverMeshes = meshes;
  document.getElementById('popover-content').innerHTML = buildInfoHtml(id, info);
  popoverEl.classList.add('visible');
  updatePopoverPosition();
}
function hidePopover(){
  popoverMeshes = [];
  popoverEl.classList.remove('visible');
}
function updatePopoverPosition(){
  if (!popoverMeshes.length) return;
  scene.updateMatrixWorld(true);
  popoverWorldPos.set(0,0,0);
  var tmp = new THREE.Vector3();
  popoverMeshes.forEach(function(m){ m.getWorldPosition(tmp); popoverWorldPos.add(tmp); });
  popoverWorldPos.multiplyScalar(1/popoverMeshes.length);

  var proj = popoverWorldPos.clone().project(activeCamera);
  if (proj.z > 1){ popoverEl.classList.remove('visible'); return; } // behind camera
  if (!popoverMeshes.length) return;
  var rect = renderer.domElement.getBoundingClientRect();
  var x = (proj.x*0.5+0.5) * rect.width;
  var y = (-proj.y*0.5+0.5) * rect.height;
  x = Math.max(70, Math.min(rect.width-70, x));
  y = Math.max(80, Math.min(rect.height-16, y));
  popoverEl.style.left = x + 'px';
  popoverEl.style.top = y + 'px';
  popoverEl.classList.add('visible');
}
document.getElementById('pop-close').addEventListener('click', function(e){
  e.stopPropagation();
  hidePopover();
});

function selectById(id){
  var meshes = meshesForId(id);
  if (!meshes.length) return;
  lastSelectedId = id;
  highlightMeshes(meshes);
  var info = idToInfo(id);
  showInspector(id, info);
  showPopoverFor(meshes, id, info);
  document.getElementById('crumb-sel').textContent = '— ' + (info ? info.title : id);
  document.querySelectorAll('#tree .node').forEach(function(n){
    if (n.dataset.id === id) n.classList.add('selected');
  });
}

// raycaster click — hitting the model selects + anchors the popover;
// clicking empty background dismisses it.
var raycaster = new THREE.Raycaster();
var pointer = new THREE.Vector2();
renderer.domElement.addEventListener('click', function(e){
  var rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX-rect.left)/rect.width)*2-1;
  pointer.y = -((e.clientY-rect.top)/rect.height)*2+1;
  raycaster.setFromCamera(pointer, activeCamera);
  var hits = raycaster.intersectObjects(selectable, false).filter(function(h){ return h.object.visible !== false && h.object.parent.visible; });
  if (hits.length){
    var m = hits[0].object;
    selectById(m.userData.id);
  } else {
    hidePopover();
  }
});

