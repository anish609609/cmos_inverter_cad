/**
 * js/build-anim.js
 * Deliberate 45–60 Second CMOS Fabrication Animation Sequence
 * 
 * Executes an event-driven sequential drop-in assembly following bottom-to-top lithography order.
 * Dynamically synchronized to the AI Voice Tutor using the HTML5 Audio `onended` event to eliminate
 * audio clipping. Features cohesive problem-and-solution storytelling narrative connecting
 * the physical requirement ("why") with the fabricated layer ("what").
 */

// =====================================================================
// STATE & CONSTANTS
// =====================================================================
var isBuildAnimating = false;
var isBuildPaused = false;
var currentStepIdx = -1;
var totalAnimTime = 0;

var DROP_HEIGHT = 16.0;
var DROP_DURATION = 1.35; // Seconds for physical drop
var INTER_STEP_PAUSE = 0.50; // Natural storytelling pause after audio finishes (500ms)
var MAX_TOTAL_DURATION = 65.0; // Maximum safety window (45–60s sequence)

var stepDropElapsed = 0;
var isStepDropping = false;
var stepAudioEnded = false;
var stepPauseElapsed = 0;
var currentCamLerp = null;

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

// 7 deliberate fabrication steps in bottom-to-top lithographic order
var buildSteps = [];

function initBuildSteps(){
  if (buildSteps.length > 0) return;

  function getMeshes(groupKey){
    if (typeof groups === 'undefined' || !groups[groupKey]) return [];
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
      camPos: new THREE.Vector3(24, 20, 26),
      camTarget: new THREE.Vector3(-0.5, 1.5, 0),
      narration: {
        'en-IN': 'Every integrated circuit requires a physical starting canvas. We begin with a high-purity P-type silicon wafer that provides mechanical rigidity and body grounding, though raw silicon alone cannot yet isolate opposing devices or conduct controlled signals.',
        'hi-IN': 'किसी भी एकीकृत सर्किट को एक ठोस भौतिक आधार की आवश्यकता होती है। हम एक उच्च-शुद्धता वाले पी-टाइप सिलिकॉन वेफर से शुरुआत करते हैं जो यांत्रिक आधार और बॉडी ग्राउंड प्रदान करता है, हालांकि कच्चा सिलिकॉन अकेले विपरीत ट्रांजिस्टरों को अलग नहीं रख सकता।',
        'te-IN': 'ఏదైనా ఇంటిగ్రేటెడ్ సర్క్యూట్‌కు బలమైన భౌతిక పునాది అవసరం. మనం అధిక స్వచ్ఛత గల పి-రకం సిలికాన్ వేఫర్‌తో ప్రారంభిస్తాము, ఇది యాంత్రిక స్థిరత్వాన్ని మరియు బాడీ గ్రౌండ్‌ను అందిస్తుంది, కానీ స్వచ్ఛమైన సిలికాన్ మాత్రమే పరికరాలను వేరు చేయలేదు.'
      }
    },
    {
      index: 2,
      title: 'Retrograde Twin Wells',
      meshes: step2Meshes,
      camPos: new THREE.Vector3(20, 17, 23),
      camTarget: new THREE.Vector3(-0.5, 1.8, 0),
      narration: {
        'en-IN': 'To build both NMOS and PMOS on the same substrate without parasitic latch-up or short-circuits, we implant deep retrograde N-well and P-well basins, establishing isolated conductivity domains with tailored threshold voltages.',
        'hi-IN': 'एक ही सबस्ट्रेट पर एन-मॉस और पी-मॉस दोनों को बिना किसी शॉर्ट-सर्किट या विनाशकारी लैच-अप के संचालित करने के लिए, हम गहरे रेट्रोग्रेड एन-वेल और पी-वेल बेसिन बनाकर अलग-अलग विद्युत क्षेत्र और थ्रेसहोल्ड वोल्टेज स्थापित करते हैं।',
        'te-IN': 'షార్ట్ సర్క్యూట్‌లు మరియు లాచ్-అప్ సమస్యలు లేకుండా ఒకే సబ్‌స్ట్రేట్‌పై ఎన్-మాస్ మరియు పి-మాస్ నిర్మించడానికి, మనం వివిక్త విద్యుత్ మండలాలను మరియు థ్రెషోల్డ్ వోల్టేజ్‌లను ఏర్పాటు చేయడానికి లోతైన ఎన్-వెల్ మరియు పి-వెల్ బేసిన్‌లను అమర్చుతాము.'
      }
    },
    {
      index: 3,
      title: 'Gate Dielectrics (SiO₂ & HfO₂)',
      meshes: step3Meshes,
      camPos: new THREE.Vector3(17, 14, 19),
      camTarget: new THREE.Vector3(-0.5, 2.0, 0),
      narration: {
        'en-IN': 'If the gate touches the silicon directly, massive current would short-circuit, while quantum tunneling causes parasitic leakage. An ultra-thin interfacial oxide and high-k hafnium dielectric solve this, enabling intense capacitive control while stopping leakage.',
        'hi-IN': 'यदि गेट सीधे सिलिकॉन को छुए तो शॉर्ट-सर्किट हो जाएगा और क्वांटम टनलिंग से लीकेज बढ़ेगी। इस समस्या को हल करने के लिए, हम एक अत्यंत पतली इंटरफेशियल ऑक्साइड और हाई-के हॉफ्नियम डाइइलेक्ट्रिक परत बिछाते हैं, जो मजबूत कैपेसिटिव नियंत्रण देती है।',
        'te-IN': 'గేట్ నేరుగా సిలికాన్‌ను తాకితే షార్ట్ సర్క్యూట్ అవుతుంది మరియు క్వాంటమ్ లీకేజ్ ఏర్పడుతుంది. దీనిని పరిష్కరించడానికి, ఒక సన్నని ఆక్సైడ్ మరియు హై-కె డైఎలెక్ట్రిక్ పొరను నిక్షిప్తం చేస్తాము, ఇది లీకేజీని అరికడుతూ బలమైన కెపాసిటివ్ నియంత్రణను అందిస్తుంది.'
      }
    },
    {
      index: 4,
      title: 'Active Source & Drain Diffusions',
      meshes: step4Meshes,
      camPos: new THREE.Vector3(15, 13, 17),
      camTarget: new THREE.Vector3(-0.5, 2.0, 0),
      narration: {
        'en-IN': 'To switch digital signals, we need localized reservoirs packed with mobile charge carriers. Heavy ion implantation forms low-resistance N-plus and P-plus source and drain diffusions with shallow extensions, resisting short-channel effects.',
        'hi-IN': 'डिजिटल सिग्नल स्विच करने के लिए हमें गतिशील चार्ज कैरियर्स के प्रचुर स्रोतों की आवश्यकता होती है। भारी आयन इम्प्लांटेशन द्वारा कम प्रतिरोध वाले एन-प्लस और पी-प्लस एक्टिव सोर्स और ड्रेन डिफ्यूजन बनाए जाते हैं, जो शॉर्ट-चैनल प्रभावों को भी रोकते हैं।',
        'te-IN': 'సిగ్నల్‌లను స్విచ్ చేయడానికి మొబైల్ ఛార్జ్ క్యారియర్లు అవసరం. భారీ అయాన్ ఇంప్లాంటేషన్ ద్వారా తక్కువ నిరోధకత కలిగిన ఎన్-ప్లస్ మరియు పి-ప్లస్ సోర్స్ మరియు డ్రెయిన్ డిఫ్యూజన్లు ఏర్పడతాయి, ఇవి షార్ట్-ఛానల్ ప్రభావాలను కూడా నిరోధిస్తాయి.'
      }
    },
    {
      index: 5,
      title: 'Polysilicon Gate Electrode',
      meshes: step5Meshes,
      camPos: new THREE.Vector3(13, 12, 16),
      camTarget: new THREE.Vector3(-0.5, 2.1, 0),
      narration: {
        'en-IN': 'How do we switch one transistor on while turning the other off with a single input? A patterned polysilicon gate bridges both channels, simultaneously controlling NMOS and PMOS via self-aligned electrostatic field effect.',
        'hi-IN': 'एक ही इनपुट से एक ट्रांजिस्टर को ऑन और दूसरे को ऑफ कैसे करें? एक पैटर्न्ड पॉलीसिलिकॉन गेट दोनों चैनलों को जोड़ता है और सेल्फ-अलाइन्ड इलेक्ट्रोस्टैटिक फील्ड इफेक्ट के माध्यम से दोनों को एक साथ नियंत्रित करता है।',
        'te-IN': 'ఒకే ఇన్‌పుట్‌తో ఒక ట్రాన్సిస్టర్‌ను ఆన్ చేసి మరొకటి ఆఫ్ చేయడం ఎలా? ఒక తీర్చిదిద్దిన పాలీసిలికాన్ గేట్ రెండు ఛానళ్లను కలుపుతూ, సెల్ఫ్-అలైన్డ్ ఫీల్డ్ ఎఫెక్ట్ ద్వారా ఎన్-మాస్ మరియు పి-మాస్‌లను ఏకకాలంలో నియంత్రిస్తుంది.'
      }
    },
    {
      index: 6,
      title: 'Tungsten Contact Plugs',
      meshes: step6Meshes,
      camPos: new THREE.Vector3(14, 12, 15),
      camTarget: new THREE.Vector3(-0.5, 2.2, 0),
      narration: {
        'en-IN': 'External metal wiring cannot contact bare silicon directly without spiking and causing catastrophic damage. Refractory tungsten contact plugs vertically pierce the interlayer dielectric to form rugged, low-resistance ohmic connections.',
        'hi-IN': 'ऊपरी मेटल वायरिंग सीधे सिलिकॉन को छूकर वेफर को पिघला या क्षतिग्रस्त कर सकती है। इसलिए दुर्दम्य टंगस्टन कॉन्टैक्ट प्लग डाइइलेक्ट्रिक को लंबवत भेदकर नीचे तक मजबूत, कम प्रतिरोध वाले ओमिक संपर्क बनाते हैं।',
        'te-IN': 'బాహ్య మెటల్ వైరింగ్ నేరుగా సిలికాన్‌ను తాకితే నష్టం వాటిల్లుతుంది. కాబట్టి టంగ్‌స్టన్ కాంటాక్ట్ ప్లగ్‌లు ఇంటర్‌లేయర్ డైఎలెక్ట్రిక్‌ను నిలువుగా ఛేదిస్తూ గేట్లు మరియు డిఫ్యూజన్‌లకు బలమైన ఓమిక్ కనెక్షన్‌లను ఏర్పాటు చేస్తాయి.'
      }
    },
    {
      index: 7,
      title: 'Metal-1 Rails & Interconnects',
      meshes: step7Meshes,
      camPos: new THREE.Vector3(16, 13, 18),
      camTarget: new THREE.Vector3(-0.5, 1.9, 0),
      narration: {
        'en-IN': 'Finally, our discrete transistors must receive power and deliver inverted signals. Low-resistance metal-one tracks route VDD, ground, input, and the common output node, completing the operational CMOS inverter.',
        'hi-IN': 'अंत में, अलग-अलग ट्रांजिस्टरों को पावर और सिग्नल रूटिंग की आवश्यकता होती है। कम प्रतिरोध वाले मेटल-वन ट्रैक्स वीडीडी, ग्राउंड, इनपुट और आउटपुट नोड को जोड़कर इस पूर्ण सीमॉस लॉजिक इन्वर्टर को तैयार करते हैं।',
        'te-IN': 'చివరగా, వేర్వేరుగా ఉన్న ట్రాన్సిస్టర్లకు పవర్ మరియు సిగ్నల్ రూటింగ్ అవసరం. తక్కువ నిరోధకత కలిగిన మెటల్-వన్ ట్రాక్‌లు విడిడి, గ్రౌండ్, ఇన్‌పుట్ మరియు అవుట్‌పుట్ నోడ్‌లను అనుసంధానిస్తూ కార్యాచరణ సిమోస్ ఇన్వర్టర్‌ను పూర్తి చేస్తాయి.'
      }
    }
  ];

  // Record initial origin Y and opacity for each mesh
  stepData.forEach(function(step){
    step.meshes.forEach(function(m){
      if (typeof m.userData.origY === 'undefined'){
        m.userData.origY = m.position.y;
      }
      if (m.material){
        if (typeof m.userData.origOpacity === 'undefined'){
          m.userData.origOpacity = (typeof m.material.opacity === 'number') ? m.material.opacity : 1.0;
          m.userData.origTransparent = !!m.material.transparent;
        }
      }
    });
    step.narrated = false;
    buildSteps.push(step);
  });
}

function getAllLabels(){
  var labels = [];
  if (typeof LAYER_ORDER === 'undefined' || typeof groups === 'undefined') return labels;
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

// =====================================================================
// STEP EXECUTION & DYNAMIC AUDIO SYNCHRONIZATION
// =====================================================================

function executeStep(stepIndex){
  if (!isBuildAnimating) return;

  // If all 7 layers have been fabricated, finalize assembly sequence
  if (stepIndex >= buildSteps.length){
    finishBuildAnimation();
    return;
  }

  currentStepIdx = stepIndex;
  var step = buildSteps[stepIndex];

  stepDropElapsed = 0;
  isStepDropping = true;
  stepAudioEnded = false;
  stepPauseElapsed = 0;

  // Reveal current layer: make visible at elevated drop height with zero opacity
  step.meshes.forEach(function(m){
    m.visible = true;
    m.position.y = m.userData.origY + DROP_HEIGHT;
    if (m.material){
      m.material.transparent = true;
      m.material.opacity = 0.0;
    }
  });

  // Smooth camera choreography to this step's perspective
  var startPos = activeCamera.position.clone();
  var startTarget = controls.target.clone();
  currentCamLerp = {
    startPos: startPos,
    endPos: step.camPos.clone(),
    startTarget: startTarget,
    endTarget: step.camTarget.clone(),
    duration: 1.8,
    elapsed: 0
  };

  // Trigger audio narration with onEnded event synchronization
  if (typeof window.playVoiceNarration === 'function'){
    window.playVoiceNarration(
      step.index,
      step.title,
      step.narration,
      6.0,
      function onAudioEnded(){
        // Dynamically synchronized: wait for current audio to finish before advancing
        if (!isBuildAnimating || currentStepIdx !== stepIndex) return;
        stepAudioEnded = true;
        stepPauseElapsed = 0;
      }
    );
  } else {
    // Fallback if voice tutor is absent
    setTimeout(function(){
      if (!isBuildAnimating || currentStepIdx !== stepIndex) return;
      stepAudioEnded = true;
      stepPauseElapsed = 0;
    }, 6000);
  }
}

// =====================================================================
// LIFECYCLE CONTROLS
// =====================================================================

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
  totalAnimTime = 0;
  currentCamLerp = null;

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
    step.narrated = false;
    step.meshes.forEach(function(m){
      m.visible = false;
      m.position.y = m.userData.origY + DROP_HEIGHT;
      if (m.material){
        m.material.transparent = true;
        m.material.opacity = 0.0;
      }
    });
  });

  // Set camera to initial crane position
  activeCamera.position.copy(buildSteps[0].camPos);
  controls.target.copy(buildSteps[0].camTarget);
  controls.update();

  // Prefetch upcoming animation steps in background using Sarvam TTS API
  if (typeof window.prefetchNarrationSteps === 'function'){
    window.prefetchNarrationSteps(buildSteps);
  }

  // Begin Step 1 immediately
  executeStep(0);
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
  currentStepIdx = buildSteps.length;
  currentCamLerp = null;

  if (btnBuildAnim){
    btnBuildAnim.textContent = 'REPLAY';
    btnBuildAnim.classList.remove('active');
  }

  // Restore all meshes to exact original Y positions and make them visible
  buildSteps.forEach(function(step){
    step.meshes.forEach(function(m){
      m.visible = true;
      m.position.y = m.userData.origY;
      if (m.material && typeof m.userData.origOpacity !== 'undefined'){
        m.material.opacity = m.userData.origOpacity;
        m.material.transparent = m.userData.origTransparent;
      }
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
      'en-IN': 'Fabrication is complete. The NMOS and PMOS operate in complementary harmony, producing clean rail-to-rail logic inversion with zero static power dissipation.',
      'hi-IN': 'निर्माण पूरा हुआ! एन-मॉस और पी-मॉस ट्रांजिस्टर परस्पर सामंजस्य में काम करते हैं और बिना किसी स्टैटिक पावर खर्च के सटीक लॉजिक इन्वर्शन प्रदान करते हैं।',
      'te-IN': 'తయారీ పూర్తయింది! ఎన్-మాస్ మరియు పి-మాస్ ట్రాన్సిస్టర్లు పరస్పర సమన్వయంతో పనిచేస్తూ, సున్నా స్టాటిక్ పవర్ నష్టంతో ఖచ్చితమైన లాజిక్ ఇన్వర్షన్‌ను అందిస్తాయి.'
    }, 5.0);
  }
}

function stopBuildAnimation(){
  isBuildAnimating = false;
  isBuildPaused = false;
  currentStepIdx = -1;
  totalAnimTime = 0;
  currentCamLerp = null;

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
      if (m.material && typeof m.userData.origOpacity !== 'undefined'){
        m.material.opacity = m.userData.origOpacity;
        m.material.transparent = m.userData.origTransparent;
      }
    });
  });

  getAllLabels().forEach(function(l){ l.visible = true; });
  if (typeof markerGroup !== 'undefined' && markerGroup){
    markerGroup.visible = true;
    rebuildFlowCurves();
    refreshConnections();
  }
}

// =====================================================================
// RENDER LOOP UPDATE (CALLED PER FRAME)
// =====================================================================

function updateBuildAnimation(dt){
  if (!isBuildAnimating || isBuildPaused) return;

  totalAnimTime += dt;

  // Safety ceiling: if total duration exceeds maximum window, finalize sequence
  if (totalAnimTime >= MAX_TOTAL_DURATION){
    finishBuildAnimation();
    return;
  }

  // 1. Smooth cinematic camera lerp
  if (currentCamLerp){
    currentCamLerp.elapsed += dt;
    var camP = Math.min(1.0, currentCamLerp.elapsed / currentCamLerp.duration);
    var camEased = camP * camP * (3.0 - 2.0 * camP); // smoothstep
    activeCamera.position.lerpVectors(currentCamLerp.startPos, currentCamLerp.endPos, camEased);
    controls.target.lerpVectors(currentCamLerp.startTarget, currentCamLerp.endTarget, camEased);
    controls.update();
    if (camP >= 1.0){
      currentCamLerp = null;
    }
  }

  // 2. Animate physical drop & opacity reveal of current layer
  if (currentStepIdx >= 0 && currentStepIdx < buildSteps.length){
    var curStep = buildSteps[currentStepIdx];

    if (isStepDropping){
      stepDropElapsed += dt;
      var dropP = Math.min(1.0, stepDropElapsed / DROP_DURATION);
      var eased = easeDrop(dropP);

      curStep.meshes.forEach(function(m){
        m.visible = true;
        m.position.y = m.userData.origY + DROP_HEIGHT * (1.0 - eased);
        if (m.material && typeof m.userData.origOpacity !== 'undefined'){
          var fadeP = Math.min(1.0, dropP / 0.65); // smoothly fade to full opacity
          m.material.opacity = m.userData.origOpacity * fadeP;
        }
      });

      if (dropP >= 1.0){
        isStepDropping = false;
        // Settle cleanly in place
        curStep.meshes.forEach(function(m){
          m.visible = true;
          m.position.y = m.userData.origY;
          if (m.material && typeof m.userData.origOpacity !== 'undefined'){
            m.material.opacity = m.userData.origOpacity;
            m.material.transparent = m.userData.origTransparent;
          }
        });
      }
    }

    // 3. Check for dynamic audio completion & natural storytelling pause
    if (stepAudioEnded){
      stepPauseElapsed += dt;
      if (stepPauseElapsed >= INTER_STEP_PAUSE){
        stepAudioEnded = false;
        executeStep(currentStepIdx + 1);
      }
    }
  }
}

// Play / Pause / Resume / Replay button wiring
if (btnBuildAnim){
  btnBuildAnim.addEventListener('click', function(){
    if (!isBuildAnimating){
      if (typeof window.hasSarvamApiKey === 'function' && !window.hasSarvamApiKey()){
        if (typeof window.openSarvamApiKeyModal === 'function'){
          window.openSarvamApiKeyModal(function(){
            startBuildAnimation();
          });
          return;
        }
      }
      startBuildAnimation();
    } else if (isBuildPaused){
      resumeBuildAnimation();
    } else {
      pauseBuildAnimation();
    }
  });
}
