/**
 * logic-state.js
 * The IN = 0/1 logical state machine: which transistor is ON, the OUT value, and the on-screen state badge / STATUS popover.
 */

// =====================================================================
// IN = 0/1 LOGICAL STATE (section 16)
// =====================================================================
var currentIn = 0;
var stateBadge = document.getElementById('state-badge');
var inSeg = document.getElementById('in-seg');

function applyLogicState(){
  var pmosOn = currentIn === 0;
  var nmosOn = currentIn === 1;
  var out = currentIn === 0 ? 1 : 0;

  document.getElementById('badge-in').textContent = currentIn;
  document.getElementById('badge-pmos').textContent = pmosOn ? 'ON' : 'OFF';
  document.getElementById('badge-pmos').className = 'v ' + (pmosOn ? 'on':'off');
  document.getElementById('badge-nmos').textContent = nmosOn ? 'ON' : 'OFF';
  document.getElementById('badge-nmos').className = 'v ' + (nmosOn ? 'on':'off');
  document.getElementById('badge-out').textContent = out;
  document.getElementById('badge-out').className = 'v ' + (out ? 'on':'off');

  [pmosAct.src, pmosAct.drn].forEach(function(m){ setOnOffTint(m, pmosOn); });
  [nmosAct.src, nmosAct.drn].forEach(function(m){ setOnOffTint(m, nmosOn); });
}
function setOnOffTint(mesh, on){
  mesh.userData.baseEmissive = on ? 0x2fbf7a : 0x3a1414;
  mesh.userData.baseEmissiveIntensity = on ? 0.35 : 0.25;
  if (selectedMeshes.indexOf(mesh) === -1){
    mesh.material.emissive.setHex(mesh.userData.baseEmissive);
    mesh.material.emissiveIntensity = mesh.userData.baseEmissiveIntensity;
  }
}

inSeg.addEventListener('click', function(e){
  var btn = e.target.closest('button'); if (!btn) return;
  inSeg.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  currentIn = parseInt(btn.dataset.in,10);
  stateBadge.classList.add('visible');
  applyLogicState();
  refreshConnections();
});

