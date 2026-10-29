/**
 * theme.js
 * Light / Dark Mode theme manager with adaptive color management:
 * Persists theme preference in localStorage, toggles CSS custom properties,
 * and dynamically adapts 3D canvas lighting, background, fog, ground grid, and material contrast.
 */

var currentTheme = 'dark';

function initTheme(){
  try {
    var saved = localStorage.getItem('cmos_viewer_theme');
    if (saved === 'light' || saved === 'dark') {
      currentTheme = saved;
    }
  } catch(e){}

  applyTheme(currentTheme, false);

  var toggleBtn = document.getElementById('btn-theme-toggle');
  if (toggleBtn){
    toggleBtn.addEventListener('click', function(){
      var nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme, true);
    });
  }
}

function applyTheme(theme, savePreference){
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);

  if (savePreference){
    try {
      localStorage.setItem('cmos_viewer_theme', theme);
    } catch(e){}
  }

  var btn = document.getElementById('btn-theme-toggle');
  if (btn){
    btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme');
    btn.title = theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme';
    var label = document.getElementById('theme-btn-label');
    if (label){
      label.textContent = theme === 'dark' ? 'LIGHT' : 'DARK';
    }
  }

  // 1. Adapt 3D Scene lighting, background, fog & grid
  if (typeof applySceneTheme === 'function'){
    applySceneTheme(theme);
  }

  // 2. Adapt 3D mesh material colors, outlines & label chips
  if (typeof updateMaterialsTheme === 'function'){
    updateMaterialsTheme();
  }

  // 3. Update selection highlight color
  if (typeof HIGHLIGHT_COLOR !== 'undefined' && typeof cssVar === 'function'){
    var hlHex = cssVar('--highlight');
    if (hlHex) HIGHLIGHT_COLOR.set(hlHex);
  }
}
