/**
 * build-anim.js
 * Cinematic Layer-by-Layer Build Animation sequence:
 * Sequential drop-in assembly following bottom-to-top lithography order with physical weight landing easing,
 * camera sweep/tilt, and interactive Play / Pause / Resume / Replay control.
 */

// =====================================================================
// CINEMATIC BUILD ANIMATION
// =====================================================================
var isBuildAnimating = false;
var isBuildPaused = false;
var animTime = 0;

var DROP_HEIGHT = 16.0;
var TOTAL_DURATION = 4.80; // Relaxed cinematic assembly sequence

var camStartPos = new THREE.Vector3(22, 18, 25);
var camStartTarget = new THREE.Vector3(-0.5, 3.2, 0);
var camEndPos = new THREE.Vector3(16, 12, 18);
var camEndTarget = new THREE.Vector3(-0.5, 1.8, 0);

// Physical weight landing easing: cubic ease-out with a subtle shock-absorption landing cushion
function easeDrop(p){
  p = Math.max(0, Math.min(1, p));
  if (p < 0.74){
    var u = p / 0.74;
    return 1.025 * (1 - Math.pow(1 - u, 3));
  } else {
    var u = (p - 0.74) / 0.26;
    return 1.025 - 0.025 * Math.sin(u * Math.PI * 0.5) * (1 - Math.pow(1 - u, 2));
  }
}

// 7-step bottom-to-top assembly sequence
var buildSteps = [];

function initBuildSteps(){
  if (buildSteps.length > 0) return;

  function getMeshes(groupKey){
    if (!groups[groupKey]) return [];
    return groups[groupKey].children.filter(function(c){
      return !c.userData.isLabel;
    });
  }

  // Step 1: P-Substrate base mesh
  var step1 = getMeshes('substrate');

  // Step 2: N-Well and P-Well meshes
  var step2 = getMeshes('well');

  // Step 3: Gate Oxide (SiO2) and High-k Dielectric (HfO2) layers
  var step3 = [].concat(getMeshes('oxide'), getMeshes('highk'));

  // Step 4: Active / Diffusion regions (PMOS & NMOS sources/drains)
  var step4 = getMeshes('active');

  // Step 5: Polysilicon Gate strip
  var step5 = getMeshes('poly');

  // Step 6: Tungsten Contact vias
  var step6 = getMeshes('contact');

  // Step 7: Metal-1 interconnect traces (VDD, GND, IN, OUT)
  var step7 = getMeshes('metal');

  var stepMeshes = [step1, step2, step3, step4, step5, step6, step7];

  // Record initial origin Y for each mesh
  stepMeshes.forEach(function(list){
    list.forEach(function(m){
      if (typeof m.userData.origY === 'undefined'){
        m.userData.origY = m.position.y;
      }
    });
  });

  // Stagger each layer by ~550ms with 850ms drop duration for majestic, clear pace
  var dur = 0.85;
  var stagger = 0.55;
  for (var i = 0; i < stepMeshes.length; i++){
    buildSteps.push({
      index: i + 1,
      meshes: stepMeshes[i],
      start: i * stagger,
      duration: dur,
      end: i * stagger + dur
    });
  }
}

function getAllLabels(){
  var labels = [];
  LAYER_ORDER.forEach(function(k){
    if (groups[k]){
      groups[k].children.forEach(function(c){
        if (c.userData.isLabel) labels.push(c);
      });
    }
  });
  return labels;
}

var btnBuildAnim = document.getElementById('btn-build-anim');

function startBuildAnimation(){
  initBuildSteps();

  // Reset explode & section scrubs so parts assemble directly in wafer space
  if (typeof explodeSlider !== 'undefined' && explodeSlider){
    explodeSlider.value = 0;
    applyExplode(0);
  }
  if (typeof resetScrub === 'function'){
    resetScrub();
  }

  isBuildAnimating = true;
  isBuildPaused = false;
  animTime = 0;

  if (btnBuildAnim){
    btnBuildAnim.textContent = 'PAUSE';
    btnBuildAnim.classList.add('active');
  }

  // Hide 3D labels and flow markers during assembly
  getAllLabels().forEach(function(l){ l.visible = false; });
  if (typeof markerGroup !== 'undefined' && markerGroup){
    markerGroup.visible = false;
  }

  // Pre-position all assembly meshes at elevated drop height and hide them
  buildSteps.forEach(function(step){
    step.meshes.forEach(function(m){
      m.visible = false;
      m.position.y = m.userData.origY + DROP_HEIGHT;
    });
  });

  // Set camera to initial cinematic crane position
  activeCamera.position.copy(camStartPos);
  controls.target.copy(camStartTarget);
  controls.update();
}

function pauseBuildAnimation(){
  if (!isBuildAnimating) return;
  isBuildPaused = true;
  if (btnBuildAnim){
    btnBuildAnim.textContent = 'RESUME';
  }
}

function resumeBuildAnimation(){
  if (!isBuildAnimating) return;
  isBuildPaused = false;
  if (btnBuildAnim){
    btnBuildAnim.textContent = 'PAUSE';
  }
}

function finishBuildAnimation(){
  isBuildAnimating = false;
  isBuildPaused = false;
  animTime = TOTAL_DURATION;

  if (btnBuildAnim){
    btnBuildAnim.textContent = 'REPLAY';
    btnBuildAnim.classList.remove('active');
  }

  // Restore all meshes to exact original Y positions and make them visible
  buildSteps.forEach(function(step){
    step.meshes.forEach(function(m){
      m.visible = true;
      m.position.y = m.userData.origY;
    });
  });

  // Restore labels and flow markers
  getAllLabels().forEach(function(l){ l.visible = true; });
  if (typeof markerGroup !== 'undefined' && markerGroup){
    markerGroup.visible = true;
    rebuildFlowCurves();
    refreshConnections();
  }

  // Finalize camera at heroic perspective angle
  activeCamera.position.copy(camEndPos);
  controls.target.copy(camEndTarget);
  controls.update();
}

function stopBuildAnimation(){
  isBuildAnimating = false;
  isBuildPaused = false;
  animTime = 0;

  if (btnBuildAnim){
    btnBuildAnim.textContent = 'PLAY';
    btnBuildAnim.classList.remove('active');
  }

  initBuildSteps();
  buildSteps.forEach(function(step){
    step.meshes.forEach(function(m){
      m.visible = true;
      m.position.y = m.userData.origY;
    });
  });

  getAllLabels().forEach(function(l){ l.visible = true; });
  if (typeof markerGroup !== 'undefined' && markerGroup){
    markerGroup.visible = true;
    rebuildFlowCurves();
    refreshConnections();
  }
}

function updateBuildAnimation(dt){
  if (!isBuildAnimating || isBuildPaused) return;

  animTime += dt;

  // Cinematic camera sweep and tilt throughout the assembly sequence
  var camP = Math.min(1.0, animTime / TOTAL_DURATION);
  var camEased = camP * camP * (3.0 - 2.0 * camP); // smoothstep
  activeCamera.position.lerpVectors(camStartPos, camEndPos, camEased);
  controls.target.lerpVectors(camStartTarget, camEndTarget, camEased);
  controls.update();

  // Animate each layer step
  buildSteps.forEach(function(step){
    if (animTime < step.start){
      // Not yet dropped
      step.meshes.forEach(function(m){
        m.visible = false;
        m.position.y = m.userData.origY + DROP_HEIGHT;
      });
    } else if (animTime <= step.end){
      // Dropping into place with physical weight landing easing
      var p = (animTime - step.start) / step.duration;
      var eased = easeDrop(p);
      var curY = mTargetY => mTargetY + DROP_HEIGHT * (1.0 - eased);

      step.meshes.forEach(function(m){
        m.visible = true;
        m.position.y = curY(m.userData.origY);
      });
    } else {
      // Landed
      step.meshes.forEach(function(m){
        m.visible = true;
        m.position.y = m.userData.origY;
      });
    }
  });

  // When animation finishes
  if (animTime >= TOTAL_DURATION){
    finishBuildAnimation();
  }
}

// Button click handler
if (btnBuildAnim){
  btnBuildAnim.addEventListener('click', function(){
    if (!isBuildAnimating){
      startBuildAnimation();
    } else if (isBuildPaused){
      resumeBuildAnimation();
    } else {
      pauseBuildAnimation();
    }
  });
}
