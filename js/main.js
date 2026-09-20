/**
 * main.js
 * Side-panel drawer toggles (with the view-hud reposition-on-drawer-open fix), the STATUS/VIEW CONTROLS collapse toggles, the full Reset-to-default routine, and the final bootstrap calls that start the app. Load this file LAST.
 */

// =====================================================================
// SIDE PANEL DRAWERS (mobile-friendly overlay toggles)
// =====================================================================
var leftPanel = document.getElementById('left-panel');
var rightPanel = document.getElementById('right-panel');
var leftToggleBtn = document.getElementById('left-toggle');
var rightToggleBtn = document.getElementById('right-toggle');
leftToggleBtn.addEventListener('click', function(){
  var open = leftPanel.classList.toggle('open');
  leftToggleBtn.classList.toggle('is-open', open);
});
rightToggleBtn.addEventListener('click', function(){
  var open = rightPanel.classList.toggle('open');
  rightToggleBtn.classList.toggle('is-open', open);
  updateViewHudPosition();
});

// Keep the Explode/Section-Scrub HUD clear of the right drawer instead of
// letting the drawer cover it — slide it left by the drawer's actual width.
var viewHud = document.getElementById('view-hud');
function updateViewHudPosition(){
  if (rightPanel.classList.contains('open')){
    var w = rightPanel.getBoundingClientRect().width;
    viewHud.style.right = (w + 14) + 'px';
  } else {
    viewHud.style.right = '';
  }
}
window.addEventListener('resize', updateViewHudPosition);

document.getElementById('status-toggle').addEventListener('click', function(){
  stateBadge.classList.toggle('mobile-open');
});

document.getElementById('view-hud-toggle').addEventListener('click', function(){
  var body = document.getElementById('view-hud-body');
  var chev = document.getElementById('view-hud-chev');
  var collapsed = body.classList.toggle('collapsed');
  chev.classList.toggle('closed', collapsed);
});

// =====================================================================
// RESET — returns camera, explode, section scrub, IN and flow mode to
// their defaults, and clears any selection.
// =====================================================================
function resetAll(){
  activeCamera.position.copy(TOP_VIEW_POS);
  controls.target.set(-0.5, 0, 0);
  controls.update();

  explodeSlider.value = 1;
  applyExplode(1);

  resetScrub();

  currentIn = 0;
  inSeg.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.dataset.in === '0'); });
  flowMode = 'current';
  flowSeg.querySelectorAll('button').forEach(function(b){ b.classList.toggle('active', b.dataset.flow === 'current'); });
  applyLogicState();
  refreshConnections();

  clearSelection();
  lastSelectedId = null;
  hidePopover();
  document.getElementById('inspector').innerHTML = '<div class="empty">Select a layer, region, or tree node to inspect its function, electrical role, and physical relationships.</div>';
  document.getElementById('crumb-sel').textContent = '';
}

resize();
stateBadge.classList.add('visible');
resetAll();
requestAnimationFrame(function(){
  document.getElementById('loading').style.display = 'none';
});
animate();

