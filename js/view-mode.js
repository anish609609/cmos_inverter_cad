/**
 * view-mode.js
 * Physical-layout <-> schematic toggle (including the clickable schematic SVG -> 3D id mapping) and the camera Reset button wiring.
 */

// =====================================================================
// PHYSICAL / SCHEMATIC MODE
// =====================================================================
var modeSeg = document.getElementById('mode-seg');
var schematicOverlay = document.getElementById('schematic-overlay');

function setViewMode(mode){
  modeSeg.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.dataset.mode === mode); });
  schematicOverlay.classList.toggle('visible', mode === 'schematic');
  if (mode === 'schematic') hidePopover();
}
modeSeg.addEventListener('click', function(e){
  var btn = e.target.closest('button'); if (!btn) return;
  setViewMode(btn.dataset.mode);
});

// Schematic components map onto the SAME ids used by the 3D model and the
// architecture tree. Clicking a terminal, gate or net in the schematic jumps
// back to the physical layout with that element highlighted, so the two
// views stay legible as one shared netlist.
schematicOverlay.querySelectorAll('[data-id]').forEach(function(el){
  el.addEventListener('click', function(e){
    e.stopPropagation();
    var id = el.dataset.id;
    setViewMode('layout');
    selectById(id);
  });
});

// =====================================================================
// CAMERA — reset returns to a straight top-down view and restores every
// control (explode, scrub, IN, flow mode, selection) to its default state.
// =====================================================================
document.getElementById('btn-reset-cam').addEventListener('click', function(){
  resetAll();
});

