/**
 * js/build-anim.js
 * COMPLETE REWRITE: Tour & Replay Controller, 3D Layer Sync, and Sarvam AI TTS Engine
 * 
 * Architectural Rules:
 * 1. ZERO ARROWS: Floating drawer arrows (< and >) and 3D current/electron flow vectors
 *    are strictly hidden throughout the tour.
 * 2. SINGLE AUDIO & RUN-ID: Only one global HTML5 Audio instance and one currentTourRunId
 *    preventing overlapping voices, audio clipping, or parallel loops.
 * 3. DEDICATED SARVAM TTS: Sends only short single-sentence strings (< 180 chars) to
 *    Sarvam Bulbul v4 Flash and strictly awaits onended before advancing.
 * 4. STRICT SEQUENTIAL LOOP: Executes Steps 1 to 8 one-by-one in an async loop awaiting
 *    both the 700ms drop (restY + 2.5 -> restY) and the entire voiceover.
 */

// =====================================================================
// GLOBAL TOUR STATE
// =====================================================================
var currentTourRunId = 0;
var tourAudioInstance = null;
var isTourRunning = false;
var isTourPaused = false;
var isBuildAnimating = false;
var isBuildPaused = false;
var camLerp = null;

window.isTourRunning = false;
window.isTourPaused = false;
window.isBuildAnimating = false;
window.isBuildPaused = false;

const DROP_OFFSET = 2.5;
const DROP_DURATION_MS = 700;
const STEP_PAUSE_MS = 300;

// In-memory cache for fetched audio blobs (text -> Blob)
const stepAudioCache = new Map();

// =====================================================================
// 8-STEP ARCHITECTURE TREE & NARRATION DEFINITIONS
// =====================================================================
const TOUR_STEPS = [
  {
    step: 1,
    layerKey: 'substrate',
    layerName: 'SUBSTRATE',
    parentLabel: 'SUBSTRATE',
    childLabels: ['P-SUBSTRATE'],
    primaryId: 'psub',
    camPos: new THREE.Vector3(24, 20, 26),
    camTarget: new THREE.Vector3(-0.5, 1.5, 0),
    narration: {
      'en-IN': "We start with a p-type silicon substrate as our base foundation, where the NMOS device region will reside.",
      'hi-IN': "हम एक पी-टाइप सिलिकॉन सबस्ट्रेट से अपने आधार के रूप में शुरुआत करते हैं, जहां एन-मॉस डिवाइस क्षेत्र स्थित होगा।",
      'te-IN': "మనం ఎన్-మాస్ పరికర ప్రాంతం ఉండే ఆధార పునాదిగా పి-రకం సిలికాన్ సబ్‌స్ట్రేట్‌తో ప్రారంభిస్తాము."
    }
  },
  {
    step: 2,
    layerKey: 'well',
    layerName: 'WELLS (N-WELL & P-WELL)',
    parentLabel: 'WELL',
    childLabels: ['N-WELL', 'P-WELL'],
    primaryId: 'nwell',
    camPos: new THREE.Vector3(20, 17, 23),
    camTarget: new THREE.Vector3(-0.5, 1.8, 0),
    narration: {
      'en-IN': "Next, an N-well and P-well are diffused into the substrate to electrically isolate the PMOS and NMOS territories.",
      'hi-IN': "इसके बाद, पी-मॉस और एन-मॉस क्षेत्रों को विद्युत रूप से अलग करने के लिए सबस्ट्रेट में एन-वेल और पी-वेल डिफ्यूज किए जाते हैं।",
      'te-IN': "తరువాత, పి-మాస్ మరియు ఎన్-మాస్ ప్రాంతాలను విద్యుత్ పరంగా వేరు చేయడానికి సబ్‌స్ట్రేట్‌లోకి ఎన్-వెల్ మరియు పి-వెల్ విస్తరించబడతాయి."
    }
  },
  {
    step: 3,
    layerKey: 'active',
    layerName: 'ACTIVE / DIFFUSION',
    parentLabel: 'TRANSISTORS',
    childLabels: ['PMOS', 'NMOS', 'SOURCE', 'P-SDE (SRC)', 'GATE', 'P-SDE (DRN)', 'DRAIN', 'N-SDE (SRC)', 'N-SDE (DRN)'],
    primaryId: 'pmos',
    camPos: new THREE.Vector3(15, 13, 17),
    camTarget: new THREE.Vector3(-0.5, 2.0, 0),
    narration: {
      'en-IN': "In the active regions, we implant PMOS and NMOS sources and drains, adding lightly doped SDE extensions at the channel edges to prevent short-channel effects.",
      'hi-IN': "सक्रिय क्षेत्रों में, हम पी-मॉस और एन-मॉस सोर्स और ड्रेन प्रत्यारोपित करते हैं, शॉर्ट-चैनल प्रभावों को रोकने के लिए चैनल किनारों पर हल्के डोप किए गए एसडीई एक्सटेंशन जोड़ते हैं।",
      'te-IN': "యాక్టివ్ ప్రాంతాలలో, మనం పి-మాస్ మరియు ఎన్-మాస్ సోర్స్‌లు మరియు డ్రెయిన్‌లను ఇంప్లాంట్ చేస్తాము, షార్ట్-ఛానల్ ప్రభావాలను నిరోధించడానికి ఛానల్ అంచుల వద్ద తేలికగా డోప్ చేయబడిన ఎస్‌డిఇ పొడిగింపులను జోడిస్తాము."
    }
  },
  {
    step: 4,
    layerKey: 'oxide',
    layerName: 'GATE OXIDE (SiO2)',
    parentLabel: 'GATE OXIDE (SiO2)',
    childLabels: ['PMOS OXIDE (SiO2)', 'NMOS OXIDE (SiO2)'],
    primaryId: 'pmosOxide',
    camPos: new THREE.Vector3(17, 14, 19),
    camTarget: new THREE.Vector3(-0.5, 2.0, 0),
    narration: {
      'en-IN': "Ultra-thin Silicon Dioxide layers are grown over both channels to insulate the gates while coupling the electric field.",
      'hi-IN': "इलेक्ट्रिक फील्ड को युग्मित करते हुए गेट्स को इन्सुलेट करने के लिए दोनों चैनलों पर अल्ट्रा-थिन सिलिकॉन डाइऑक्साइड परतें विकसित की जाती हैं।",
      'te-IN': "ఎలక్ట్రిక్ ఫీల్డ్‌ను జతచేస్తూ గేట్లను ఇన్సులేట్ చేయడానికి రెండు ఛానెళ్లపై అల్ట్రా-సన్నని సిలికాన్ డయాక్సైడ్ పొరలు పెంచబడతాయి."
    }
  },
  {
    step: 5,
    layerKey: 'highk',
    layerName: 'HIGH-K DIELECTRIC (HfO2)',
    parentLabel: 'HIGH-K DIELECTRIC (HfO2)',
    childLabels: ['PMOS HIGH-K (HfO2)', 'NMOS HIGH-K (HfO2)'],
    primaryId: 'pmosHighk',
    camPos: new THREE.Vector3(17, 14, 19),
    camTarget: new THREE.Vector3(-0.5, 2.0, 0),
    narration: {
      'en-IN': "Directly above the silicon oxide, we deposit Hafnium Oxide—a high-K dielectric that boosts gate capacitance and blocks quantum tunneling leakage.",
      'hi-IN': "सिलिकॉन ऑक्साइड के ठीक ऊपर, हम हॉफ्नियम ऑक्साइड जमा करते हैं—एक हाई-के डाइइलेक्ट्रिक जो गेट कैपेसिटेंस को बढ़ाता है और क्वांटम टनलिंग लीकेज को रोकता है।",
      'te-IN': "సిలికాన్ ఆక్సైడ్ పైభాగంలో, మనం హాఫ్నియం ఆక్సైడ్‌ను నిక్షిప్తం చేస్తాము—ఇది గేట్ కెపాసిటెన్స్‌ను పెంచే మరియు క్వాంటమ్ టన్నలింగ్ లీకేజీని అడ్డుకునే హై-కె డైఎలెక్ట్రిక్."
    }
  },
  {
    step: 6,
    layerKey: 'poly',
    layerName: 'POLYSILICON',
    parentLabel: 'POLYSILICON',
    childLabels: ['COMMON GATE'],
    primaryId: 'poly',
    camPos: new THREE.Vector3(13, 12, 16),
    camTarget: new THREE.Vector3(-0.5, 2.1, 0),
    narration: {
      'en-IN': "A single continuous polysilicon strip drops across both transistors to form their shared common gate electrode.",
      'hi-IN': "दोनों ट्रांजिस्टर पर एक एकल निरंतर पॉलीसिलिकॉन पट्टी गिरती है ताकि उनका साझा सामान्य गेट इलेक्ट्रोड बन सके।",
      'te-IN': "రెండు ట్రాన్సిస్టర్ల మీదుగా ఒకే నిరంతర పాలీసిలికాన్ స్ట్రిప్ పడి వాటి ఉమ్మడి గేట్ ఎలక్ట్రోడ్‌ను ఏర్పరుస్తుంది."
    }
  },
  {
    step: 7,
    layerKey: 'contact',
    layerName: 'CONTACT (TUNGSTEN)',
    parentLabel: 'CONTACTS (TUNGSTEN)',
    childLabels: ['PMOS SRC CT', 'PMOS DRN CT', 'NMOS SRC CT', 'NMOS DRN CT', 'POLY / IN CT'],
    primaryId: 'contact',
    camPos: new THREE.Vector3(14, 12, 15),
    camTarget: new THREE.Vector3(-0.5, 2.2, 0),
    narration: {
      'en-IN': "Next, five vertical tungsten contact vias drop onto the PMOS and NMOS sources and drains, as well as the shared polysilicon gate.",
      'hi-IN': "इसके बाद, पांच ऊर्ध्वाधर टंगस्टन संपर्क वियाज पी-मॉस और एन-मॉस सोर्स और ड्रेन के साथ-साथ साझा पॉलीसिलिकॉन गेट पर गिरते हैं।",
      'te-IN': "తరువాత, ఐదు నిలువు టంగ్‌స్టన్ కాంటాక్ట్ వయాస్ పి-మాస్ మరియు ఎన్-మాస్ సోర్స్‌లు మరియు డ్రెయిన్‌లపై, అలాగే షేర్డ్ పాలీసిలికాన్ గేట్‌పై పడతాయి."
    }
  },
  {
    step: 8,
    layerKey: 'metal',
    layerName: 'METAL-1 (incl. VDD/GND/IN/OUT)',
    parentLabel: 'METAL-1',
    childLabels: ['VDD', 'GND', 'IN', 'OUT'],
    primaryId: 'metal',
    camPos: new THREE.Vector3(16, 13, 18),
    camTarget: new THREE.Vector3(-0.5, 1.9, 0),
    narration: {
      'en-IN': "Finally, Metal-1 interconnects drop in: VDD supplies the PMOS source, Ground ties the NMOS source, IN drives the gate, and OUT connects both drains.",
      'hi-IN': "अंत में, मेटल-1 इंटरकनेक्ट्स आते हैं: वीडीडी पी-मॉस सोर्स को आपूर्ति करता है, ग्राउंड एन-मॉस सोर्स को जोड़ता है, इन गेट को चलाता है, और आउट दोनों ड्रेन को जोड़ता है।",
      'te-IN': "చివరగా, మెటల్-1 ఇంటర్‌కనెక్ట్‌లు వస్తాయి: విడిడి పి-మాస్ సోర్స్‌ను సరఫరా చేస్తుంది, గ్రౌండ్ ఎన్-మాస్ సోర్స్‌ను కలుపుతుంది, ఇన్ గేట్‌ను నడుపుతుంది మరియు అవుట్ రెండు డ్రెయిన్‌లను కలుపుతుంది."
    }
  }
];

// Cache resting Y and material properties once
function cacheSceneRestCoordinates(){
  if (typeof LAYER_ORDER === 'undefined' || typeof groups === 'undefined') return;
  LAYER_ORDER.forEach(k => {
    const grp = groups[k];
    if (grp){
      grp.children.forEach(item => {
        if (typeof item.userData.restY === 'undefined'){
          item.userData.restY = item.position.y;
        }
        if (item.material && typeof item.userData.origOpacity === 'undefined'){
          item.userData.origOpacity = (typeof item.material.opacity === 'number') ? item.material.opacity : 1.0;
          item.userData.origTransparent = !!item.material.transparent;
        }
      });
    }
  });
}

function getStepNarrationText(step){
  const lang = (window.getCurrentAssistantLang && window.getCurrentAssistantLang()) || 'en-IN';
  if (typeof step.narration === 'object'){
    return step.narration[lang] || step.narration['en-IN'] || step.narration.text;
  }
  return step.narration;
}

// =====================================================================
// UI BUTTON & CONTROLS
// =====================================================================
const btnBuildAnim = document.getElementById('btn-build-anim');

function setBuildBtnUI(state){
  if (!btnBuildAnim) return;
  if (state === 'PAUSE'){
    btnBuildAnim.innerHTML = '<span class="play-icon">⏸</span> <span class="play-label">PAUSE</span>';
    btnBuildAnim.classList.add('active');
    btnBuildAnim.title = 'Pause 3D fabrication sequence';
  } else if (state === 'RESUME'){
    btnBuildAnim.innerHTML = '<span class="play-icon">▶</span> <span class="play-label">RESUME</span>';
    btnBuildAnim.classList.add('active');
    btnBuildAnim.title = 'Resume 3D fabrication sequence';
  } else if (state === 'REPLAY'){
    btnBuildAnim.innerHTML = '<span class="play-icon">↺</span> <span class="play-label">REPLAY</span>';
    btnBuildAnim.classList.remove('active');
    btnBuildAnim.title = 'Replay 3D fabrication sequence';
  } else {
    btnBuildAnim.innerHTML = '<span class="play-icon">▶</span> <span class="play-label">PLAY</span><span class="play-extra">&nbsp;TOUR</span>';
    btnBuildAnim.classList.remove('active');
    btnBuildAnim.title = 'Watch step-by-step 3D fabrication sequence with AI Voice Tutor';
  }
}

function pauseTour(){
  if (!isTourRunning || isTourPaused) return;
  isTourPaused = true;
  isBuildPaused = true;
  window.isTourPaused = true;
  window.isBuildPaused = true;
  if (tourAudioInstance && !tourAudioInstance.paused){
    try { tourAudioInstance.pause(); } catch(e){}
  }
  setBuildBtnUI('RESUME');
}

function resumeTour(){
  if (!isTourRunning || !isTourPaused) return;
  isTourPaused = false;
  isBuildPaused = false;
  window.isTourPaused = false;
  window.isBuildPaused = false;
  if (tourAudioInstance && tourAudioInstance.paused){
    try { tourAudioInstance.play(); } catch(e){}
  }
  setBuildBtnUI('PAUSE');
}

// Rule 1: Strictly hide sidebar toggle drawer arrows (< and >) during tour
function hideSidebarToggleArrows(){
  document.body.classList.add('tour-running');
  const leftToggle = document.getElementById('left-toggle');
  const rightToggle = document.getElementById('right-toggle');
  if (leftToggle){
    leftToggle.style.setProperty('display', 'none', 'important');
  }
  if (rightToggle){
    rightToggle.style.setProperty('display', 'none', 'important');
  }
}

function restoreSidebarToggleArrows(){
  document.body.classList.remove('tour-running');
  const leftToggle = document.getElementById('left-toggle');
  const rightToggle = document.getElementById('right-toggle');
  if (leftToggle){
    leftToggle.style.removeProperty('display');
  }
  if (rightToggle){
    rightToggle.style.removeProperty('display');
  }
}

// Camera transition helper
function transitionCamera(targetPos, targetLookAt, durationSec){
  if (typeof activeCamera === 'undefined' || typeof controls === 'undefined') return;
  camLerp = {
    startPos: activeCamera.position.clone(),
    endPos: targetPos.clone(),
    startTarget: controls.target.clone(),
    endTarget: targetLookAt.clone(),
    duration: durationSec || 1.2,
    elapsed: 0
  };
}

// =====================================================================
// SARVAM AI AUDIO ENGINE & PRE-FETCHING
// =====================================================================

async function fetchSarvamAudioBlob(text){
  if (stepAudioCache.has(text)){
    return stepAudioCache.get(text);
  }

  const apiKey = (localStorage.getItem('sarvam_api_key') || '').trim();
  if (!apiKey){
    throw new Error('Sarvam API key missing');
  }

  const lang = (window.getCurrentAssistantLang && window.getCurrentAssistantLang()) || 'en-IN';
  let speaker = 'aparna_en_edtech';
  if (lang === 'hi-IN') speaker = 'aparna_hi_customer';
  else if (lang === 'te-IN') speaker = 'kavitha_te_narration';

  const payload = {
    inputs: [text],
    target_language_code: lang,
    speaker: speaker,
    model: 'bulbul:v4-flash'
  };

  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': apiKey
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok){
    const errText = await res.text();
    throw new Error(`Sarvam TTS error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (!data || !data.audios || !data.audios[0]){
    throw new Error('No audio data returned by Sarvam API');
  }

  // Base64 -> Blob (audio/wav)
  const binaryString = window.atob(data.audios[0]);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++){
    bytes[i] = binaryString.charCodeAt(i);
  }
  const blob = new Blob([bytes.buffer], { type: 'audio/wav' });
  stepAudioCache.set(text, blob);
  return blob;
}

function prefetchStepAudio(narration){
  const text = (typeof narration === 'object') ? (narration[window.getCurrentAssistantLang ? window.getCurrentAssistantLang() : 'en-IN'] || narration['en-IN']) : narration;
  if (!text || stepAudioCache.has(text)) return;
  fetchSarvamAudioBlob(text).catch(err => {
    console.warn('[Tour] Pre-fetch error (will fetch on landing):', err);
  });
}

function speakStepWithSarvam(narration, runId){
  return new Promise(async (resolve) => {
    if (runId !== currentTourRunId){
      resolve();
      return;
    }

    const text = (typeof narration === 'object') ? (narration[window.getCurrentAssistantLang ? window.getCurrentAssistantLang() : 'en-IN'] || narration['en-IN']) : narration;

    // Clear previous tour audio instance if any
    if (tourAudioInstance){
      try {
        tourAudioInstance.pause();
        tourAudioInstance.currentTime = 0;
        tourAudioInstance.src = '';
      } catch(e){}
      tourAudioInstance = null;
    }

    let blob = null;
    try {
      blob = await fetchSarvamAudioBlob(text);
    } catch(err){
      console.warn('[Tour] TTS fetch failed, using fallback pause:', err);
      // Fallback pause if no key or network error
      const start = performance.now();
      function checkFallback(now){
        if (runId !== currentTourRunId || now - start >= 5000){
          resolve();
        } else {
          requestAnimationFrame(checkFallback);
        }
      }
      requestAnimationFrame(checkFallback);
      return;
    }

    if (runId !== currentTourRunId || !blob){
      resolve();
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    tourAudioInstance = audio;

    if (typeof window.notifyTourAudioStart === 'function'){
      window.notifyTourAudioStart(text);
    }

    let finished = false;
    function cleanup(){
      if (finished) return;
      finished = true;
      if (tourAudioInstance === audio){
        tourAudioInstance = null;
      }
      try { URL.revokeObjectURL(objectUrl); } catch(e){}
      if (typeof window.notifyTourAudioEnd === 'function'){
        window.notifyTourAudioEnd();
      }
      resolve();
    }

    audio.onended = cleanup;
    audio.onerror = cleanup;

    while (isTourPaused && runId === currentTourRunId){
      await new Promise(r => setTimeout(r, 50));
    }

    if (runId !== currentTourRunId){
      cleanup();
      return;
    }

    audio.play().catch(err => {
      console.warn('[Tour] Audio play failed:', err);
      cleanup();
    });
  });
}

// =====================================================================
// 3D SCENE & LAYER ANIMATION
// =====================================================================

function hardResetSceneBlank(){
  cacheSceneRestCoordinates();

  // Rule 1: IN = OFF, no flow markers or directional vector arrows
  currentIn = 'off';
  const inSeg = document.getElementById('in-seg');
  if (inSeg){
    inSeg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.in === 'off');
    });
  }
  if (typeof applyLogicState === 'function') applyLogicState();

  if (typeof markerGroup !== 'undefined' && markerGroup){
    markerGroup.visible = false;
  }

  const flowCap = document.getElementById('flow-caption');
  if (flowCap){
    flowCap.classList.remove('visible');
    flowCap.textContent = '';
  }

  // Reset explode & scrub to 0
  if (typeof applyExplode === 'function') applyExplode(0, 0, 0);
  if (typeof resetScrub === 'function') resetScrub();

  // Hide EVERY 3D mesh group AND every 3D floating label
  LAYER_ORDER.forEach(k => {
    const grp = groups[k];
    if (grp){
      grp.visible = false;
      grp.children.forEach(item => {
        item.visible = false;
        item.position.y = item.userData.restY + DROP_OFFSET;
        if (item.material){
          item.material.transparent = true;
          item.material.opacity = 0.0;
        }
      });
    }
  });

  // Uncheck all 8 checkboxes in the LAYER VISIBILITY panel
  document.querySelectorAll('#layers-body input[type="checkbox"]').forEach(cb => {
    cb.checked = false;
  });

  // Clear tree selections
  document.querySelectorAll('#tree .node.selected').forEach(n => n.classList.remove('selected'));

  // Reset inspector
  const inspector = document.getElementById('inspector');
  if (inspector){
    inspector.innerHTML = '<div class="empty">Starting 3D fabrication tour...</div>';
  }
  const crumb = document.getElementById('crumb-sel');
  if (crumb) crumb.textContent = '';
}

function updateUIForTourStep(step){
  // Check ONLY this step's LAYER VISIBILITY checkbox
  const cb = document.querySelector(`#layers-body input[data-layer="${step.layerKey}"]`);
  if (cb) cb.checked = true;

  // Highlight active node in ARCHITECTURE TREE
  document.querySelectorAll('#tree .node.selected').forEach(n => n.classList.remove('selected'));
  let firstNode = null;
  document.querySelectorAll('#tree .node').forEach(node => {
    const lbl = node.dataset.label;
    if (lbl === step.parentLabel || (step.childLabels && step.childLabels.includes(lbl))){
      node.classList.add('selected');
      if (!firstNode) firstNode = node;
    }
  });
  if (firstNode && typeof firstNode.scrollIntoView === 'function'){
    try { firstNode.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch(e){}
  }

  // Update PROPERTY INSPECTOR
  if (typeof idToInfo === 'function' && typeof showInspector === 'function'){
    const info = idToInfo(step.primaryId);
    if (info){
      showInspector(step.primaryId, info);
      const crumb = document.getElementById('crumb-sel');
      if (crumb) crumb.textContent = '— ' + (info.title || step.layerName);
    }
  }

  // Smooth camera orientation
  transitionCamera(step.camPos, step.camTarget, 1.2);
}

function animateLayerDropIn(layerKey, durationMs, runId){
  return new Promise((resolve) => {
    if (runId !== currentTourRunId){
      resolve();
      return;
    }
    const group = groups[layerKey];
    if (!group){
      resolve();
      return;
    }

    // Reveal group and all its children (both meshes and 3D labels)
    group.visible = true;
    const items = group.children;

    items.forEach(item => {
      item.visible = true;
      item.position.y = item.userData.restY + DROP_OFFSET;
      if (item.material){
        item.material.transparent = true;
        item.material.opacity = 0.0;
      }
    });

    let lastTime = performance.now();
    let elapsed = 0;

    function frame(now){
      if (runId !== currentTourRunId){
        resolve();
        return;
      }

      const dt = now - lastTime;
      lastTime = now;

      if (!isTourPaused){
        elapsed += dt;
      }

      const p = Math.min(1.0, elapsed / durationMs);
      const eased = 1.0 - Math.pow(1.0 - p, 3.0); // cubic-out

      items.forEach(item => {
        item.position.y = item.userData.restY + DROP_OFFSET * (1.0 - eased);
        if (item.material && typeof item.userData.origOpacity !== 'undefined'){
          item.material.opacity = item.userData.origOpacity * p;
        }
      });

      if (p < 1.0){
        requestAnimationFrame(frame);
      } else {
        // Snap cleanly to resting position
        items.forEach(item => {
          item.position.y = item.userData.restY;
          if (item.material && typeof item.userData.origOpacity !== 'undefined'){
            item.material.opacity = item.userData.origOpacity;
            item.material.transparent = item.userData.origTransparent;
          }
        });
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

// =====================================================================
// MAIN TOUR EXECUTION LOOP
// =====================================================================

async function startTour(){
  // Check for Sarvam API key
  if (typeof window.hasSarvamApiKey === 'function' && !window.hasSarvamApiKey()){
    if (typeof window.openSarvamApiKeyModal === 'function'){
      window.openSarvamApiKeyModal(() => {
        startTour();
      });
      return;
    }
  }

  // 1. Cancel any running tour
  const runId = ++currentTourRunId;
  isTourRunning = true;
  isTourPaused = false;
  isBuildAnimating = true;
  isBuildPaused = false;
  window.isTourRunning = true;
  window.isTourPaused = false;
  window.isBuildAnimating = true;
  window.isBuildPaused = false;

  if (tourAudioInstance){
    try {
      tourAudioInstance.pause();
      tourAudioInstance.currentTime = 0;
      tourAudioInstance.src = '';
    } catch(e){}
    tourAudioInstance = null;
  }

  setBuildBtnUI('PAUSE');

  // Rule 1: Strictly hide sidebar toggle drawer arrows (< and >) during tour
  hideSidebarToggleArrows();

  // 2. Hard Reset the 3D scene to 100% blank
  hardResetSceneBlank();

  // Position camera at initial vantage point
  activeCamera.position.copy(TOUR_STEPS[0].camPos);
  controls.target.copy(TOUR_STEPS[0].camTarget);
  controls.update();

  // 3. Strict Sequential for...of Execution Loop
  for (let i = 0; i < TOUR_STEPS.length; i++){
    if (runId !== currentTourRunId) return; // Aborted by Reset or Replay
    const step = TOUR_STEPS[i];

    // A. Pre-fetch next step's Sarvam audio in background
    if (i + 1 < TOUR_STEPS.length){
      prefetchStepAudio(TOUR_STEPS[i + 1].narration);
    }

    // B. Update UI for ONLY this step:
    // Check ONLY this step's LAYER VISIBILITY checkbox, highlight this node in ARCHITECTURE TREE, and update PROPERTY INSPECTOR
    updateUIForTourStep(step);

    // C. Reveal ONLY this step's 3D meshes + its 3D labels, and animate them dropping down from above (restY + 2.5 -> restY over 700ms)
    const dropPromise = animateLayerDropIn(step.layerKey, DROP_DURATION_MS, runId);

    // D. Play this step's Sarvam AI voiceover and wait until `audio.onended` fires
    const audioPromise = speakStepWithSarvam(step.narration, runId);

    // E. STRICT AWAIT: Do NOT move to step i+1 until BOTH the 3D drop AND the entire voiceover finish!
    await Promise.all([dropPromise, audioPromise]);

    if (runId !== currentTourRunId) return;

    // Wait if paused between steps
    while (isTourPaused && runId === currentTourRunId){
      await new Promise(r => setTimeout(r, 50));
    }

    if (runId !== currentTourRunId) return;
    await new Promise(r => setTimeout(r, STEP_PAUSE_MS)); // 300ms natural pause between steps
  }

  if (runId === currentTourRunId){
    onTourFinished(runId);
  }
}

function onTourFinished(runId){
  if (runId !== currentTourRunId) return;
  isTourRunning = false;
  isTourPaused = false;
  isBuildAnimating = false;
  isBuildPaused = false;
  window.isTourRunning = false;
  window.isTourPaused = false;
  window.isBuildAnimating = false;
  window.isBuildPaused = false;
  setBuildBtnUI('REPLAY');

  // Restore sidebar toggle buttons
  restoreSidebarToggleArrows();

  // Re-check all checkboxes
  document.querySelectorAll('#layers-body input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
  });

  // Ensure all groups and meshes are visible at restY
  LAYER_ORDER.forEach(k => {
    const grp = groups[k];
    if (grp){
      grp.visible = true;
      grp.children.forEach(item => {
        if (typeof item.userData.restY !== 'undefined') item.position.y = item.userData.restY;
        item.visible = true;
        if (item.material && typeof item.userData.origOpacity !== 'undefined'){
          item.material.opacity = item.userData.origOpacity;
          item.material.transparent = item.userData.origTransparent;
        }
      });
    }
  });

  // Restore flow markers
  if (typeof markerGroup !== 'undefined' && markerGroup){
    markerGroup.visible = true;
    if (typeof rebuildFlowCurves === 'function') rebuildFlowCurves();
    if (typeof refreshConnections === 'function') refreshConnections();
  }

  // Hero camera view
  transitionCamera(new THREE.Vector3(16, 12, 18), new THREE.Vector3(-0.5, 1.8, 0), 1.8);
}

function stopTour(){
  currentTourRunId++; // Cancels running loop immediately
  isTourRunning = false;
  isTourPaused = false;
  isBuildAnimating = false;
  isBuildPaused = false;
  window.isTourRunning = false;
  window.isTourPaused = false;
  window.isBuildAnimating = false;
  window.isBuildPaused = false;

  if (tourAudioInstance){
    try {
      tourAudioInstance.pause();
      tourAudioInstance.currentTime = 0;
      tourAudioInstance.src = '';
    } catch(e){}
    tourAudioInstance = null;
  }

  camLerp = null;
  restoreSidebarToggleArrows();
  setBuildBtnUI('PLAY');

  // Re-check all checkboxes
  document.querySelectorAll('#layers-body input[type="checkbox"]').forEach(cb => {
    cb.checked = true;
  });

  // Restore all 3D meshes and labels to resting coordinates and opacities
  cacheSceneRestCoordinates();
  LAYER_ORDER.forEach(k => {
    const grp = groups[k];
    if (grp){
      grp.visible = true;
      grp.children.forEach(item => {
        if (typeof item.userData.restY !== 'undefined'){
          item.position.y = item.userData.restY;
        }
        item.visible = true;
        if (item.material && typeof item.userData.origOpacity !== 'undefined'){
          item.material.opacity = item.userData.origOpacity;
          item.material.transparent = item.userData.origTransparent;
        }
      });
    }
  });

  // Restore flow markers
  if (typeof markerGroup !== 'undefined' && markerGroup){
    markerGroup.visible = true;
    if (typeof rebuildFlowCurves === 'function') rebuildFlowCurves();
    if (typeof refreshConnections === 'function') refreshConnections();
  }

  // Clear tree selections
  document.querySelectorAll('#tree .node.selected').forEach(n => n.classList.remove('selected'));

  // Reset inspector
  if (typeof clearSelection === 'function'){
    clearSelection();
  }
}

// =====================================================================
// COMPATIBILITY EXPORTS & RENDER LOOP HOOK
// =====================================================================

function updateBuildAnimation(dt){
  if (isTourPaused) return;
  if (camLerp){
    camLerp.elapsed += dt;
    const p = Math.min(1.0, camLerp.elapsed / camLerp.duration);
    const smoothP = p * p * (3.0 - 2.0 * p); // smoothstep
    activeCamera.position.lerpVectors(camLerp.startPos, camLerp.endPos, smoothP);
    controls.target.lerpVectors(camLerp.startTarget, camLerp.endTarget, smoothP);
    controls.update();
    if (p >= 1.0){
      camLerp = null;
    }
  }
}

window.startBuildAnimation = startTour;
window.stopBuildAnimation = stopTour;
window.pauseBuildAnimation = pauseTour;
window.resumeBuildAnimation = resumeTour;

// Play / Pause / Resume / Replay button listener
if (btnBuildAnim){
  btnBuildAnim.addEventListener('click', function(){
    if (!isTourRunning){
      startTour();
    } else if (isTourPaused){
      resumeTour();
    } else {
      pauseTour();
    }
  });
}
