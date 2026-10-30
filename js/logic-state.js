/**
 * logic-state.js
 * The IN = 0/1/OFF logical state machine: which transistor is ON/LEAKING, the OUT value, and the on-screen state badge / STATUS popover.
 */

// =====================================================================
// IN = 0 / 1 / OFF (HIGH-Z) LOGICAL STATE
// =====================================================================
var currentIn = 0; // 0 | 1 | 'off'
var stateBadge = document.getElementById('state-badge');
var inSeg = document.getElementById('in-seg');

function applyLogicState(){
  var badgeIn = document.getElementById('badge-in');
  var badgePmos = document.getElementById('badge-pmos');
  var badgeNmos = document.getElementById('badge-nmos');
  var badgeOut = document.getElementById('badge-out');

  if (currentIn === 'off'){
    // Floating High-Z state: both PMOS & NMOS leak in weak inversion
    badgeIn.textContent = 'OFF';
    badgeIn.className = 'v floating';

    badgePmos.textContent = 'LEAKING / PARTIAL';
    badgePmos.className = 'v warn';

    badgeNmos.textContent = 'LEAKING / PARTIAL';
    badgeNmos.className = 'v warn';

    badgeOut.textContent = 'FLOATING (HIGH-Z)';
    badgeOut.className = 'v floating';

    [pmosAct.src, pmosAct.drn, pmosAct.srcSde, pmosAct.drnSde].forEach(function(m){ if (m) setOnOffTint(m, 'partial'); });
    [nmosAct.src, nmosAct.drn, nmosAct.srcSde, nmosAct.drnSde].forEach(function(m){ if (m) setOnOffTint(m, 'partial'); });
  } else {
    var pmosOn = currentIn === 0;
    var nmosOn = currentIn === 1;
    var out = currentIn === 0 ? 1 : 0;

    badgeIn.textContent = currentIn;
    badgeIn.className = 'v';

    badgePmos.textContent = pmosOn ? 'ON' : 'OFF';
    badgePmos.className = 'v ' + (pmosOn ? 'on':'off');

    badgeNmos.textContent = nmosOn ? 'ON' : 'OFF';
    badgeNmos.className = 'v ' + (nmosOn ? 'on':'off');

    badgeOut.textContent = out;
    badgeOut.className = 'v ' + (out ? 'on':'off');

    [pmosAct.src, pmosAct.drn, pmosAct.srcSde, pmosAct.drnSde].forEach(function(m){ if (m) setOnOffTint(m, pmosOn); });
    [nmosAct.src, nmosAct.drn, nmosAct.srcSde, nmosAct.drnSde].forEach(function(m){ if (m) setOnOffTint(m, nmosOn); });
  }

  if (typeof lastSelectedId !== 'undefined' && lastSelectedId && typeof window.updateVoiceAssistantContext === 'function'){
    window.updateVoiceAssistantContext(lastSelectedId, idToInfo(lastSelectedId));
  } else if (typeof window.clearVoiceAssistantContext === 'function'){
    window.clearVoiceAssistantContext();
  }
}

function setOnOffTint(mesh, state){
  if (!mesh) return;
  if (state === 'partial'){
    mesh.userData.baseEmissive = 0xd97706; // warm amber
    mesh.userData.baseEmissiveIntensity = 0.32;
  } else if (state === true){
    mesh.userData.baseEmissive = 0x2fbf7a; // green ON
    mesh.userData.baseEmissiveIntensity = 0.35;
  } else {
    mesh.userData.baseEmissive = 0x3a1414; // deep red OFF
    mesh.userData.baseEmissiveIntensity = 0.25;
  }
  if (selectedMeshes.indexOf(mesh) === -1 && mesh.material && mesh.material.emissive){
    mesh.material.emissive.setHex(mesh.userData.baseEmissive);
    mesh.material.emissiveIntensity = mesh.userData.baseEmissiveIntensity;
  }
}

inSeg.addEventListener('click', function(e){
  var btn = e.target.closest('button'); if (!btn) return;
  inSeg.querySelectorAll('button').forEach(function(b){ b.classList.remove('active'); });
  btn.classList.add('active');
  var raw = btn.dataset.in;
  currentIn = (raw === 'off') ? 'off' : parseInt(raw, 10);
  stateBadge.classList.add('visible');
  applyLogicState();
  refreshConnections();
});
