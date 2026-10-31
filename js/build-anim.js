/**
 * build-anim.js
 * Deliberate 30-Second CMOS Fabrication Animation Sequence
 * 
 * Executes a sequential drop-in assembly following bottom-to-top lithography order,
 * synced step-by-step with the AI Voice Tutor for physical and electrical explanations,
 * completing exactly within a 30-second window.
 */

// =====================================================================
// STEP-BY-STEP CMOS ANIMATION ENGINE (30-SECOND SEQUENCE)
// =====================================================================
var isBuildAnimating = false;
var isBuildPaused = false;
var animTime = 0;

var DROP_HEIGHT = 16.0;
var TOTAL_DURATION = 30.00; // Exact 30-second window

// Physical weight landing easing: cubic ease-out with subtle landing cushion
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

// 7 deliberate fabrication steps spanning exactly 30.0 seconds
var buildSteps = [];

function initBuildSteps(){
  if (buildSteps.length > 0) return;

  function getMeshes(groupKey){
    if (!groups[groupKey]) return [];
    return groups[groupKey].children.filter(function(c){
      return !c.userData.isLabel;
    });
  }

  // 1. P-Substrate Base Wafer
  var step1Meshes = getMeshes('substrate');

  // 2. N-Well & P-Well Implants
  var step2Meshes = getMeshes('well');

  // 3. Gate Dielectric (SiO2 & High-k HfO2)
  var step3Meshes = [].concat(getMeshes('oxide'), getMeshes('highk'));

  // 4. Active Source / Drain Diffusions & SDE
  var step4Meshes = getMeshes('active');

  // 5. Polysilicon Gate Electrode
  var step5Meshes = getMeshes('poly');

  // 6. Tungsten Contact Vias
  var step6Meshes = getMeshes('contact');

  // 7. Metal-1 Interconnects & Power Rails
  var step7Meshes = getMeshes('metal');

  var stepData = [
    {
      index: 1,
      title: 'P-Substrate Base Wafer',
      meshes: step1Meshes,
      start: 0.00,
      end: 4.28,
      dropDuration: 1.35,
      camPos: new THREE.Vector3(24, 20, 26),
      camTarget: new THREE.Vector3(-0.5, 1.5, 0),
      narration: {
        'en-IN': 'Step one: High-purity P-type silicon substrate provides mechanical support and forms the physical body contact for the NMOS transistor.',
        'hi-IN': 'पहला चरण: उच्च शुद्धता वाला पी-टाइप सिलिकॉन सबस्ट्रेट यांत्रिक आधार प्रदान करता है और एन-मॉस ट्रांजिस्टर के लिए बॉडी कॉन्टैक्ट बनाता है।',
        'te-IN': 'మొదటి దశ: అధిక స్వచ్ఛత గల పి-రకం సిలికాన్ సబ్‌స్ట్రేట్ యాంత్రిక మద్దతును అందిస్తుంది మరియు ఎన్-మాస్ ట్రాన్సిస్టర్‌కు బాడీ కాంటాక్ట్‌ను ఏర్పరుస్తుంది.'
      }
    },
    {
      index: 2,
      title: 'Retrograde Twin Wells',
      meshes: step2Meshes,
      start: 4.28,
      end: 8.57,
      dropDuration: 1.35,
      camPos: new THREE.Vector3(20, 17, 23),
      camTarget: new THREE.Vector3(-0.5, 1.8, 0),
      narration: {
        'en-IN': 'Step two: Retrograde N-well and P-well implants establish isolated conductivity basins, set threshold voltages, and prevent CMOS latch-up.',
        'hi-IN': 'दूसरा चरण: रेट्रोग्रेड एन-वेल और पी-वेल रिवर्स-बायस्ड अलगाव स्थापित करते हैं, थ्रेसहोल्ड वोल्टेज तय करते हैं और सीमॉस लैच-अप को रोकते हैं।',
        'te-IN': 'రెండవ దశ: రెట్రోగ్రేడ్ ఎన్-వెల్ మరియు పి-వెల్ రివర్స్-బయాస్డ్ ఐసోలేషన్‌ను ఏర్పాటు చేస్తాయి, థ్రెషోల్డ్ వోల్టేజ్‌లను నిర్ణయిస్తాయి మరియు లాచ్-అప్‌ను నిరోధిస్తాయి.'
      }
    },
    {
      index: 3,
      title: 'Gate Dielectrics (SiO₂ & HfO₂)',
      meshes: step3Meshes,
      start: 8.57,
      end: 12.85,
      dropDuration: 1.35,
      camPos: new THREE.Vector3(17, 14, 19),
      camTarget: new THREE.Vector3(-0.5, 2.0, 0),
      narration: {
        'en-IN': 'Step three: Interfacial silicon dioxide and high-k hafnium dielectric maximize gate capacitive control while suppressing quantum tunneling leakage.',
        'hi-IN': 'तीसरा चरण: इंटरफेशियल सिलिकॉन डाइऑक्साइड और हाई-के हॉफ्नियम डाइइलेक्ट्रिक गेट कैपेसिटेंस को बढ़ाते हैं और क्वांटम लीकेज को रोकते हैं।',
        'te-IN': 'మూడవ దశ: ఇంటర్‌ఫేసియల్ సిలికాన్ డయాక్సైడ్ మరియు హై-కె డైఎలెక్ట్రిక్ గేట్ కెపాసిటివ్ నియంత్రణను గరిష్టం చేస్తూ క్వాంటమ్ లీకేజీని అరికడతాయి.'
      }
    },
    {
      index: 4,
      title: 'Active Source & Drain Diffusions',
      meshes: step4Meshes,
      start: 12.85,
      end: 17.14,
      dropDuration: 1.35,
      camPos: new THREE.Vector3(15, 13, 17),
      camTarget: new THREE.Vector3(-0.5, 2.0, 0),
      narration: {
        'en-IN': 'Step four: Ion-implanted source and drain diffusions with shallow extensions form low-resistance charge reservoirs and conductive channel boundaries.',
        'hi-IN': 'चौथा चरण: आयन-इम्प्लांटेड सोर्स और ड्रेन डिफ्यूजन हल्के एक्सटेंशन के साथ कम प्रतिरोध वाले चार्ज रिज़र्वोयर्स और चैनल सीमाएं बनाते हैं।',
        'te-IN': 'నాల్గవ దశ: అయాన్-ఇంప్లాంట్ చేయబడిన సోర్స్ మరియు డ్రెయిన్ డిఫ్యూజన్లు తక్కువ నిరోధకత గల ఛార్జ్ రిజర్వాయర్లను మరియు వాహక మార్గాలను ఏర్పరుస్తాయి.'
      }
    },
    {
      index: 5,
      title: 'Polysilicon Gate Electrode',
      meshes: step5Meshes,
      start: 17.14,
      end: 21.42,
      dropDuration: 1.35,
      camPos: new THREE.Vector3(13, 12, 16),
      camTarget: new THREE.Vector3(-0.5, 2.1, 0),
      narration: {
        'en-IN': 'Step five: Conductive polysilicon bridges both transistors, forming the common input gate for self-aligned electrostatic switching.',
        'hi-IN': 'पांचवां चरण: अत्यधिक डोप किया गया पॉलीसिलिकॉन दोनों ट्रांजिस्टर को जोड़ता है और सेल्फ-अलाइन्ड इलेक्ट्रोस्टैटिक स्विचिंग के लिए कॉमन इनपुट गेट बनाता है।',
        'te-IN': 'ఐదవ దశ: వాహక పాలీసిలికాన్ రెండు ట్రాన్సిస్టర్లను కలుపుతూ, సెల్ఫ్-అలైన్డ్ ఎలక్ట్రోస్టాటిక్ స్విచ్చింగ్ కోసం ఉమ్మడి ఇన్‌పుట్ గేట్‌ను ఏర్పరుస్తుంది.'
      }
    },
    {
      index: 6,
      title: 'Tungsten Contact Plugs',
      meshes: step6Meshes,
      start: 21.42,
      end: 25.71,
      dropDuration: 1.35,
      camPos: new THREE.Vector3(14, 12, 15),
      camTarget: new THREE.Vector3(-0.5, 2.2, 0),
      narration: {
        'en-IN': 'Step six: Refractory tungsten contact vias vertically penetrate the interlayer dielectric to establish low-resistance ohmic connections.',
        'hi-IN': 'छठा चरण: टंगस्टन कॉन्टैक्ट प्लग वर्टिकल डाइइलेक्ट्रिक को पार करके सिलिकॉन और मेटल के बीच कम प्रतिरोध वाला संपर्क बनाते हैं।',
        'te-IN': 'ఆరవ దశ: టంగ్‌స్టన్ కాంటాక్ట్ ప్లగ్‌లు ఇంటర్‌లేయర్ డైఎలెక్ట్రిక్‌ను ఛేదిస్తూ సిలికాన్ మరియు మెటల్ మధ్య ఓమిక్ కనెక్షన్‌లను ఏర్పాటు చేస్తాయి.'
      }
    },
    {
      index: 7,
      title: 'Metal-1 Rails & Interconnects',
      meshes: step7Meshes,
      start: 25.71,
      end: 30.00,
      dropDuration: 1.35,
      camPos: new THREE.Vector3(16, 13, 18),
      camTarget: new THREE.Vector3(-0.5, 1.9, 0),
      narration: {
        'en-IN': 'Step seven: Metal-one tracks route VDD, ground, input, and the inverted output node to finalize the operational CMOS inverter.',
        'hi-IN': 'सातवां चरण: मेटल-वन ट्रैक्स वीडीडी, ग्राउंड, इनपुट और इनवर्टेड आउटपुट नोड को रूट करके ऑपरेशनल सीमॉस इन्वर्टर को पूरा करते हैं।',
        'te-IN': 'ఏడవ దశ: మెటల్-వన్ ట్రాక్‌లు విడిడి, గ్రౌండ్, ఇన్‌పుట్ మరియు అవుట్‌పుట్ నోడ్‌లను రూట్ చేసి సిమోస్ ఇన్వర్టర్‌ను పూర్తి చేస్తాయి.'
      }
    }
  ];

  // Record initial origin Y for each mesh
  stepData.forEach(function(step){
    step.meshes.forEach(function(m){
      if (typeof m.userData.origY === 'undefined'){
        m.userData.origY = m.position.y;
      }
    });
    step.narrated = false;
    buildSteps.push(step);
  });
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
  if (typeof applyExplode === 'function'){
    applyExplode(0, 0, 0);
  }
  if (typeof resetScrub === 'function'){
    resetScrub();
  }

  isBuildAnimating = true;
  isBuildPaused = false;
  animTime = 0;

  // Reset narrated flags
  buildSteps.forEach(function(step){
    step.narrated = false;
  });

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

  // Set camera to initial crane position
  activeCamera.position.copy(buildSteps[0].camPos);
  controls.target.copy(buildSteps[0].camTarget);
  controls.update();

  // Trigger step 1 narration immediately
  if (buildSteps.length > 0){
    buildSteps[0].narrated = true;
    if (typeof window.playVoiceNarration === 'function'){
      window.playVoiceNarration(buildSteps[0].index, buildSteps[0].title, buildSteps[0].narration, buildSteps[0].end - buildSteps[0].start);
    }
  }
}

function pauseBuildAnimation(){
  if (!isBuildAnimating) return;
  isBuildPaused = true;
  if (typeof window.pauseVoiceNarration === 'function'){
    window.pauseVoiceNarration();
  }
  if (btnBuildAnim){
    btnBuildAnim.textContent = 'RESUME';
  }
}

function resumeBuildAnimation(){
  if (!isBuildAnimating) return;
  isBuildPaused = false;
  if (typeof window.resumeVoiceNarration === 'function'){
    window.resumeVoiceNarration();
  }
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

  // Final heroic isometric camera view
  var finalPos = new THREE.Vector3(16, 12, 18);
  var finalTarget = new THREE.Vector3(-0.5, 1.8, 0);
  activeCamera.position.copy(finalPos);
  controls.target.copy(finalTarget);
  controls.update();

  // Closing voice narration
  if (typeof window.playVoiceNarration === 'function'){
    window.playVoiceNarration(8, 'CMOS Inverter Complete', {
      'en-IN': 'CMOS Inverter fabrication complete. All seven layers are in place and the circuit is fully operational.',
      'hi-IN': 'सीमॉस इन्वर्टर निर्माण पूर्ण हुआ। सभी सात परतें स्थापित हैं और सर्किट पूरी तरह से कार्यशील है।',
      'te-IN': 'సిమోస్ ఇన్వర్టర్ తయారీ పూర్తయింది. ఏడు పొరలు అమర్చబడి సర్క్యూట్ పూర్తిగా పనిచేస్తుంది.'
    }, 4.0);
  }
}

function stopBuildAnimation(){
  isBuildAnimating = false;
  isBuildPaused = false;
  animTime = 0;

  if (typeof window.stopVoiceNarration === 'function'){
    window.stopVoiceNarration();
  }

  if (btnBuildAnim){
    btnBuildAnim.textContent = 'PLAY';
    btnBuildAnim.classList.remove('active');
  }

  initBuildSteps();
  buildSteps.forEach(function(step){
    step.narrated = false;
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

  // Find current step index for camera choreography
  var curStepIdx = 0;
  for (var i = 0; i < buildSteps.length; i++){
    if (animTime >= buildSteps[i].start && animTime < buildSteps[i].end){
      curStepIdx = i;
      break;
    }
    if (i === buildSteps.length - 1) curStepIdx = i;
  }

  var curStep = buildSteps[curStepIdx];
  var nextStep = buildSteps[Math.min(curStepIdx + 1, buildSteps.length - 1)];

  // Trigger narration as soon as step start timestamp is reached
  if (!curStep.narrated && animTime >= curStep.start){
    curStep.narrated = true;
    if (typeof window.playVoiceNarration === 'function'){
      window.playVoiceNarration(curStep.index, curStep.title, curStep.narration, curStep.end - curStep.start);
    }
  }

  // Smooth cinematic camera sweep across the step waypoints
  var stepProgress = Math.max(0, Math.min(1, (animTime - curStep.start) / (curStep.end - curStep.start)));
  var camEased = stepProgress * stepProgress * (3.0 - 2.0 * stepProgress); // smoothstep
  activeCamera.position.lerpVectors(curStep.camPos, nextStep.camPos, camEased * 0.5);
  controls.target.lerpVectors(curStep.camTarget, nextStep.camTarget, camEased * 0.5);
  controls.update();

  // Animate each layer step
  buildSteps.forEach(function(step){
    if (animTime < step.start){
      // Layer not yet dropped: remain hidden at elevated drop height
      step.meshes.forEach(function(m){
        m.visible = false;
        m.position.y = m.userData.origY + DROP_HEIGHT;
      });
    } else if (animTime <= step.start + step.dropDuration){
      // Dropping into place with physical weight landing easing
      var p = (animTime - step.start) / step.dropDuration;
      var eased = easeDrop(p);
      step.meshes.forEach(function(m){
        m.visible = true;
        m.position.y = m.userData.origY + DROP_HEIGHT * (1.0 - eased);
      });
    } else {
      // Landed and settled in place
      step.meshes.forEach(function(m){
        m.visible = true;
        m.position.y = m.userData.origY;
      });
    }
  });

  // Exactly at 30.0 seconds, conclude the animation sequence
  if (animTime >= TOTAL_DURATION){
    finishBuildAnimation();
  }
}

// Play / Pause / Resume / Replay button wiring
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
