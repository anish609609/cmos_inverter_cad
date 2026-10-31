/**
 * js/voice-assistant.js
 * Interactive AI Voice Assistant for CMOS Inverter CAD using Sarvam AI Bulbul v4 Flash.
 * 
 * Features:
 * - Floating glassmorphic UI widget with responsive minimize/restore launcher.
 * - Language selection: English (en-IN), Hindi (hi-IN), Telugu (te-IN).
 * - Persona / Speaker selection mapped to Sarvam Bulbul v4 Flash IDs:
 *     en-IN: aparna_en_edtech, aparna_en_companion
 *     hi-IN: aparna_hi_customer, shubh_hi_customer, ritu_hi_customer
 *     te-IN: kavitha_te_narration
 * - Context-aware prompt injection: automatically captures selected component,
 *     title, function, electrical role, doping, lambda rules, and live circuit state (IN/OUT/PMOS/NMOS).
 * - Real-time progressive audio streaming with zero dead air via Web Audio API buffer queue.
 * - Live audio visualizer bars driven by AnalyserNode frequency analysis.
 * - Complete Blob URL assembly with proper cleanup (URL.revokeObjectURL).
 * - Interactive Speech-to-Text mic input using Web Speech API with fallback.
 */

(function(){
  'use strict';

  // ---- Speaker Persona Mapping ----
  var PERSONAS = {
    'en-IN': [
      { id: 'aparna_en_edtech', name: 'Aparna (EdTech Tutor)' },
      { id: 'aparna_en_companion', name: 'Aparna (Companion)' }
    ],
    'hi-IN': [
      { id: 'aparna_hi_customer', name: 'Aparna (Hindi Customer/Tutor)' },
      { id: 'shubh_hi_customer', name: 'Shubh (Hindi Conversational)' },
      { id: 'ritu_hi_customer', name: 'Ritu (Hindi Casual)' }
    ],
    'te-IN': [
      { id: 'kavitha_te_narration', name: 'Kavitha (Telugu Narration)' }
    ]
  };

  // ---- Sarvam API Key & Local Storage Management ----
  var STORAGE_KEY_API = 'sarvam_api_key';
  var STORAGE_KEY_SESSION_ONLY = 'sarvam_session_only';

  function getSavedApiKey(){
    try {
      return (localStorage.getItem(STORAGE_KEY_API) || '').trim();
    } catch(e){
      return '';
    }
  }

  function setSavedApiKey(key, sessionOnly){
    try {
      if (key){
        localStorage.setItem(STORAGE_KEY_API, key.trim());
        if (sessionOnly){
          sessionStorage.setItem(STORAGE_KEY_SESSION_ONLY, '1');
        } else {
          sessionStorage.removeItem(STORAGE_KEY_SESSION_ONLY);
        }
      } else {
        localStorage.removeItem(STORAGE_KEY_API);
        sessionStorage.removeItem(STORAGE_KEY_SESSION_ONLY);
      }
    } catch(e){}
  }

  function clearSavedApiKey(){
    try {
      localStorage.removeItem(STORAGE_KEY_API);
      sessionStorage.removeItem(STORAGE_KEY_SESSION_ONLY);
    } catch(e){}
  }

  // Session exit cleanup: automatically delete API key when session-only mode is enabled
  window.addEventListener('beforeunload', function(){
    try {
      if (sessionStorage.getItem(STORAGE_KEY_SESSION_ONLY) === '1'){
        localStorage.removeItem(STORAGE_KEY_API);
      }
    } catch(e){}
  });

  // ---- State ----
  var currentLang = 'en-IN';
  var currentSpeaker = 'aparna_en_edtech';
  var activeContext = null;
  var currentObjectUrl = null;
  var isPlaying = false;
  var isThinking = false;
  var activeSources = [];
  var audioCtx = null;
  var analyserNode = null;
  var animFrameId = null;
  var speechRecognition = null;
  var isRecognizing = false;

  // ---- Audio Queue, Cancellation & Playback State ----
  var currentPlaybackToken = 0;
  var currentAbortController = null;
  var currentReplayAudio = null;
  var currentAudioInstance = null;
  var currentAudioUrl = null;
  var currentAudioText = null;
  var currentActivePlayBtn = null;
  var activeNarrationPromiseResolve = null;
  var narrationAudioCache = {}; // lang:text -> { blob, base64 }

  // Modal DOM Elements & Callback
  var keyModalBackdrop = null;
  var keyModalTitle = null;
  var keyModalInput = null;
  var keyModalEyeBtn = null;
  var keyModalStatusMsg = null;
  var keyModalSessionOnlyChk = null;
  var keyModalClearBtn = null;
  var keyModalCancelBtn = null;
  var keyModalCloseBtn = null;
  var keyModalSaveBtn = null;
  var settingsBtn = null;
  var pendingActionCallback = null;

  // DOM Elements (cached after init)
  var widgetEl = null;
  var launcherEl = null;
  var langSelect = null;
  var speakerSelect = null;
  var statusPill = null;
  var statusText = null;
  var playBtnEl = null;
  var stopBtn = null;
  var inputField = null;
  var sendBtn = null;
  var micBtn = null;
  var ctxVal = null;
  var ctxState = null;
  var responseArea = null;
  var visualizerBars = [];

  // =========================================================================
  // AUDIO CONTEXT & PROGRESSIVE PLAYBACK
  // =========================================================================

  function getAudioContext(){
    if (!audioCtx){
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass){
        audioCtx = new AudioContextClass({ sampleRate: 24000 });
        analyserNode = audioCtx.createAnalyser();
        analyserNode.fftSize = 64;
      }
    }
    return audioCtx;
  }

  function stopAudioPlayback(){
    // Immediately invalidate all pending async loops, scheduled audio buffers, and tokens
    currentPlaybackToken++;

    if (activeNarrationPromiseResolve){
      try { activeNarrationPromiseResolve(); } catch(e){}
      activeNarrationPromiseResolve = null;
    }

    // 1. Abort in-flight network requests
    if (currentAbortController){
      try { currentAbortController.abort(); } catch(e){}
      currentAbortController = null;
    }

    // 2. Halt Web Speech API speech
    if ('speechSynthesis' in window){
      try { window.speechSynthesis.cancel(); } catch(e){}
    }

    // 3. Stop standalone replay & HTML5 Audio narration instances
    if (currentAudioInstance){
      try {
        currentAudioInstance.pause();
        currentAudioInstance.currentTime = 0;
      } catch(e){}
      currentAudioInstance = null;
    }
    if (currentAudioUrl){
      try { URL.revokeObjectURL(currentAudioUrl); } catch(e){}
      currentAudioUrl = null;
    }
    if (currentReplayAudio){
      try {
        currentReplayAudio.pause();
        currentReplayAudio.currentTime = 0;
      } catch(e){}
      currentReplayAudio = null;
    }

    if (currentActivePlayBtn){
      currentActivePlayBtn._audioInstance = null;
      currentActivePlayBtn._audioUrl = null;
      currentActivePlayBtn.innerHTML = '▶ Play Audio';
      currentActivePlayBtn.classList.remove('is-playing');
      currentActivePlayBtn.disabled = false;
      currentActivePlayBtn = null;
    }

    // 4. Stop all actively scheduled Web Audio buffer source nodes
    activeSources.forEach(function(src){
      try {
        src.onended = null;
        src.stop(0);
        src.disconnect();
      } catch(e){}
    });
    activeSources = [];
    isPlaying = false;

    // 5. Stop visualizer animation
    if (animFrameId){
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    resetVisualizer();

    if (stopBtn) stopBtn.disabled = true;
    if (playBtnEl){
      playBtnEl.textContent = '▶ Play';
      playBtnEl.disabled = !currentAudioText;
    }
    updateStatus('ready', 'AI Tutor Ready');

    // Revoke previous audio blob url to prevent memory leaks
    if (currentObjectUrl){
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }
  }

  function resetVisualizer(){
    visualizerBars.forEach(function(bar){
      bar.style.height = '3px';
      bar.style.opacity = '0.4';
    });
  }

  function startVisualizerAnimation(){
    if (!analyserNode) return;
    var dataArray = new Uint8Array(analyserNode.frequencyBinCount);

    function render(){
      if (!isPlaying){
        resetVisualizer();
        return;
      }
      analyserNode.getByteFrequencyData(dataArray);
      for (var i = 0; i < visualizerBars.length; i++){
        var idx = Math.min(i * 3 + 1, dataArray.length - 1);
        var val = dataArray[idx] || 0;
        var h = Math.max(3, Math.min(22, (val / 255) * 22));
        visualizerBars[i].style.height = h + 'px';
        visualizerBars[i].style.opacity = (val > 10) ? '1' : '0.4';
      }
      animFrameId = requestAnimationFrame(render);
    }
    render();
  }

  // =========================================================================
  // CONTEXT-AWARE STATE INJECTION
  // =========================================================================

  function getCircuitStateInfo(){
    var state = {
      in: (typeof currentIn !== 'undefined') ? currentIn : 0,
      pmos: 'OFF',
      nmos: 'OFF',
      out: '1'
    };

    if (state.in === 'off'){
      state.pmos = 'LEAKING / PARTIAL';
      state.nmos = 'LEAKING / PARTIAL';
      state.out = 'FLOATING (HIGH-Z)';
    } else {
      state.pmos = (state.in === 0) ? 'ON' : 'OFF';
      state.nmos = (state.in === 1) ? 'ON' : 'OFF';
      state.out = (state.in === 0) ? '1 (VDD)' : '0 (GND)';
    }
    return state;
  }

  function getFormattedDimensions(id){
    if (typeof DIM_MAP === 'undefined' || !DIM_MAP[id]) return null;
    var list = DIM_MAP[id];
    var p = (typeof currentPreset !== 'undefined') ? currentPreset : { name:'90nm', lambda:90 };
    return list.map(function(item){
      var nm = Math.round(item.l * p.lambda);
      return item.label + ': ' + nm + ' nm (' + item.rule + ')';
    }).join('; ');
  }

  window.updateVoiceAssistantContext = function(id, info){
    if (!info) return;
    var state = getCircuitStateInfo();
    var dims = getFormattedDimensions(id);

    activeContext = {
      id: id,
      title: info.title || id,
      fn: info.fn || '',
      role: info.role || '',
      rel: info.rel || '',
      doping: info.doping || null,
      dimensions: dims,
      circuitState: state
    };

    if (ctxVal) ctxVal.textContent = activeContext.title;
    if (ctxState) ctxState.textContent = 'IN=' + state.in + ' → PMOS ' + state.pmos + ' · OUT=' + state.out;

    // Update the first quick chip to mention the selected component
    var firstChip = document.getElementById('va-chip-selected');
    if (firstChip){
      firstChip.style.display = 'inline-flex';
      var chipLabel = 'Explain ' + (activeContext.title.length > 20 ? activeContext.title.slice(0, 18) + '…' : activeContext.title);
      firstChip.textContent = chipLabel;
    }
  };

  window.clearVoiceAssistantContext = function(){
    var state = getCircuitStateInfo();
    activeContext = {
      id: null,
      title: 'CMOS Inverter (Full Layout)',
      fn: 'Complementary MOSFET logic inverter circuit converting IN to inverted OUT.',
      role: 'Basic logic NOT gate with zero static DC power dissipation.',
      dimensions: null,
      circuitState: state
    };
    if (ctxVal) ctxVal.textContent = 'None (Full Layout)';
    if (ctxState) ctxState.textContent = 'IN=' + state.in + ' → PMOS ' + state.pmos + ' · OUT=' + state.out;

    var firstChip = document.getElementById('va-chip-selected');
    if (firstChip){
      firstChip.style.display = 'none';
    }
  };

  // =========================================================================
  // STATUS & UI UPDATES
  // =========================================================================

  function updateStatus(state, label){
    if (!statusPill || !statusText) return;
    statusPill.className = 'va-status-pill ' + state;
    statusText.textContent = label;
  }

  function appendMessage(sender, text, audioUrl){
    if (!responseArea) return null;
    var msg = document.createElement('div');
    msg.className = 'va-msg va-msg-' + sender;

    var header = document.createElement('div');
    header.className = 'va-msg-header';
    header.textContent = (sender === 'user') ? 'You' : 'Sarvam AI Tutor';
    msg.appendChild(header);

    var body = document.createElement('div');
    body.className = 'va-msg-body';
    body.textContent = text;
    msg.appendChild(body);

    var playBtn = null;
    if (sender === 'ai'){
      var actions = document.createElement('div');
      actions.className = 'va-msg-actions';

      playBtn = document.createElement('button');
      playBtn.className = 'va-play-btn';
      playBtn.innerHTML = '▶ Play Audio';
      playBtn.title = 'Play / Pause voice audio with Sarvam TTS';
      playBtn.addEventListener('click', function(){
        toggleMessageAudio(playBtn, text, audioUrl);
      });
      actions.appendChild(playBtn);
      msg.appendChild(actions);
    }

    responseArea.appendChild(msg);
    responseArea.scrollTop = responseArea.scrollHeight;
    return { element: msg, playBtn: playBtn };
  }

  // =========================================================================
  // SARVAM AI TEXT-TO-SPEECH API (BULBUL V4 FLASH) AUDIO ENGINE
  // =========================================================================

  function base64ToWavBlob(base64Data){
    var binaryString = window.atob(base64Data);
    var len = binaryString.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++){
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new Blob([bytes.buffer], { type: 'audio/wav' });
  }

  function getSarvamSpeaker(langCode, requestedSpeaker){
    var lang = langCode || currentLang || 'en-IN';
    var speaker = requestedSpeaker || currentSpeaker;

    // Map 'meera' and generic speaker requests to natural high-fidelity voices
    if (!speaker || speaker === 'meera'){
      if (lang === 'hi-IN') return 'aparna_hi_customer';
      if (lang === 'te-IN') return 'kavitha_te_narration';
      return 'aparna_en_edtech';
    }
    return speaker;
  }

  // =========================================================================
  // SARVAM AI API KEY MODAL & LOCAL CREDENTIAL MANAGEMENT
  // =========================================================================

  function openApiKeyModal(callback){
    pendingActionCallback = (typeof callback === 'function') ? callback : null;
    if (!keyModalBackdrop) return;

    var currentKey = getSavedApiKey();
    if (keyModalInput){
      keyModalInput.value = currentKey;
      keyModalInput.type = 'password';
    }
    if (keyModalEyeBtn){
      keyModalEyeBtn.textContent = '👁️';
    }
    if (keyModalStatusMsg){
      keyModalStatusMsg.style.display = 'none';
      keyModalStatusMsg.textContent = '';
      keyModalStatusMsg.className = 'va-field-msg';
    }
    if (keyModalTitle){
      keyModalTitle.textContent = currentKey ? 'Manage Sarvam AI API Key' : 'Sarvam AI API Key Required';
    }
    if (keyModalClearBtn){
      keyModalClearBtn.style.display = currentKey ? 'inline-flex' : 'none';
    }
    if (keyModalSessionOnlyChk){
      keyModalSessionOnlyChk.checked = (sessionStorage.getItem(STORAGE_KEY_SESSION_ONLY) === '1') || !currentKey;
    }
    if (keyModalSaveBtn){
      keyModalSaveBtn.disabled = false;
      keyModalSaveBtn.innerHTML = 'Save & Test Voice 🔊';
    }

    keyModalBackdrop.style.display = 'flex';
    requestAnimationFrame(function(){
      keyModalBackdrop.classList.add('is-open');
      if (keyModalInput && keyModalInput.focus) keyModalInput.focus();
    });
  }

  function closeApiKeyModal(){
    if (!keyModalBackdrop) return;
    keyModalBackdrop.classList.remove('is-open');
    setTimeout(function(){
      keyModalBackdrop.style.display = 'none';
    }, 200);
  }

  function showModalStatus(type, message){
    if (!keyModalStatusMsg) return;
    keyModalStatusMsg.className = 'va-field-msg ' + type;
    keyModalStatusMsg.textContent = message;
    keyModalStatusMsg.style.display = 'block';
  }

  async function handleSaveAndTestVoice(){
    var key = keyModalInput ? keyModalInput.value.trim() : '';
    if (!key){
      showModalStatus('error', 'Please enter your personal Sarvam AI API subscription key.');
      if (keyModalInput && keyModalInput.focus) keyModalInput.focus();
      return;
    }

    if (keyModalSaveBtn){
      keyModalSaveBtn.disabled = true;
      keyModalSaveBtn.innerHTML = '⏳ Verifying with Sarvam...';
    }
    showModalStatus('info', 'Connecting to Sarvam AI voice service to verify credentials...');

    try {
      var res = await fetch('https://api.sarvam.ai/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': key
        },
        body: JSON.stringify({
          inputs: ['Sarvam AI voice tutor is ready.'],
          target_language_code: currentLang || 'en-IN',
          speaker: getSarvamSpeaker(currentLang),
          model: 'bulbul:v4-flash'
        })
      });

      if (!res.ok){
        var errDetail = '';
        try {
          var errJson = await res.json();
          errDetail = (errJson.error && errJson.error.message) || errJson.message || JSON.stringify(errJson);
        } catch(e){
          errDetail = await res.text();
        }
        throw new Error('Sarvam API error (' + res.status + '): ' + (errDetail || 'Invalid key'));
      }

      var data = await res.json();
      if (!data || !data.audios || !data.audios[0]){
        throw new Error('No audio data returned by Sarvam API.');
      }

      // Valid key! Save to localStorage
      var sessionOnly = keyModalSessionOnlyChk ? keyModalSessionOnlyChk.checked : true;
      setSavedApiKey(key, sessionOnly);

      showModalStatus('success', '✓ API key verified! Playing sample voice...');

      // Play sample voice
      try {
        var blob = base64ToWavBlob(data.audios[0]);
        var testUrl = URL.createObjectURL(blob);
        var testAudio = new Audio(testUrl);
        testAudio.onended = function(){ URL.revokeObjectURL(testUrl); };
        testAudio.play().catch(function(){});
      } catch(e){}

      updateStatus('ready', 'AI Tutor Ready');

      setTimeout(function(){
        closeApiKeyModal();
        if (typeof pendingActionCallback === 'function'){
          var action = pendingActionCallback;
          pendingActionCallback = null;
          action();
        }
      }, 700);

    } catch(err){
      console.warn('[VoiceAssistant] Key verification error:', err);
      showModalStatus('error', '❌ Verification failed: ' + err.message + '. Please check dashboard.sarvam.ai');
      if (keyModalSaveBtn){
        keyModalSaveBtn.disabled = false;
        keyModalSaveBtn.innerHTML = 'Save & Test Voice 🔊';
      }
    }
  }

  // Window exports for external components (e.g. build animation)
  window.hasSarvamApiKey = function(){
    return !!getSavedApiKey();
  };
  window.openSarvamApiKeyModal = function(callback){
    openApiKeyModal(callback);
  };

  /**
   * Sends a POST request to the Sarvam AI TTS endpoint:
   * https://api.sarvam.ai/text-to-speech
   * Parses the base64 audio string returned in data.audios[0] and converts it to a binary Blob (audio/wav).
   */
  async function fetchSarvamTtsAudio(text, langCode, speakerName, signal){
    var apiKey = getSavedApiKey();
    if (!apiKey){
      throw new Error('Missing Sarvam API Key. Please configure your key in settings.');
    }
    var lang = langCode || currentLang || 'en-IN';
    var speaker = getSarvamSpeaker(lang, speakerName);

    var payload = {
      inputs: [text],
      target_language_code: lang,
      speaker: speaker,
      model: 'bulbul:v4-flash'
    };

    var res = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': apiKey
      },
      body: JSON.stringify(payload),
      signal: signal
    });

    if (!res.ok){
      var errDetail = await res.text();
      throw new Error('Sarvam TTS API returned ' + res.status + ': ' + errDetail);
    }

    var data = await res.json();
    if (!data || !data.audios || !data.audios[0]){
      throw new Error('Sarvam TTS API response did not contain audio data');
    }

    var base64 = data.audios[0];
    var blob = base64ToWavBlob(base64);
    return { blob: blob, base64: base64 };
  }

  function startSyntheticVisualizer(){
    if (animFrameId) cancelAnimationFrame(animFrameId);
    var t = 0;
    function step(){
      t += 0.18;
      for (var i = 0; i < visualizerBars.length; i++){
        var wave = Math.sin(t + i * 1.3) * 0.5 + 0.5;
        var h = Math.max(3, Math.round(wave * 18 + 4));
        visualizerBars[i].style.height = h + 'px';
        visualizerBars[i].style.opacity = (wave > 0.2) ? '1' : '0.4';
      }
      animFrameId = requestAnimationFrame(step);
    }
    animFrameId = requestAnimationFrame(step);
  }

  function setupAndPlayAudio(url, blob, playBtn, text, thisToken, onEndedCallback){
    var audio = new Audio(url);
    if (playBtn){
      playBtn._audioInstance = audio;
      playBtn._audioUrl = url;
      playBtn.disabled = false;
      playBtn.innerHTML = '⏸ Pause Audio';
      playBtn.classList.add('is-playing');
      currentActivePlayBtn = playBtn;
    }
    currentAudioInstance = audio;
    currentAudioUrl = url;
    currentAudioText = text;
    isPlaying = true;

    if (playBtnEl){
      playBtnEl.disabled = false;
      playBtnEl.textContent = '⏸ Pause';
    }
    if (stopBtn) stopBtn.disabled = false;

    updateStatus('speaking', 'Speaking...');
    startSyntheticVisualizer();

    var callbackCalled = false;
    function triggerOnEnded(){
      if (callbackCalled) return;
      callbackCalled = true;
      if (typeof onEndedCallback === 'function'){
        try { onEndedCallback(); } catch(e){ console.error('[VoiceAssistant] onEnded callback error:', e); }
      }
    }

    audio.onended = function(){
      if (thisToken !== currentPlaybackToken) return;
      cleanupAudioState(playBtn, url);
      triggerOnEnded();
    };

    audio.onerror = function(){
      if (thisToken !== currentPlaybackToken) return;
      cleanupAudioState(playBtn, url);
      triggerOnEnded();
    };

    audio.play().catch(function(e){
      console.warn('[VoiceAssistant] Audio playback error:', e);
      cleanupAudioState(playBtn, url);
      triggerOnEnded();
    });
  }

  function cleanupAudioState(playBtn, url){
    if (url){
      try { URL.revokeObjectURL(url); } catch(e){}
    }
    if (playBtn){
      playBtn._audioInstance = null;
      playBtn._audioUrl = null;
      playBtn.innerHTML = '↺ Replay Audio';
      playBtn.classList.remove('is-playing');
      playBtn.disabled = false;
    }
    if (currentAudioInstance === (playBtn ? playBtn._audioInstance : currentAudioInstance)){
      currentAudioInstance = null;
      currentAudioUrl = null;
    }
    if (playBtnEl){
      playBtnEl.textContent = '▶ Play';
      playBtnEl.disabled = !currentAudioText;
    }
    if (stopBtn) stopBtn.disabled = true;
    isPlaying = false;
    if (animFrameId){ cancelAnimationFrame(animFrameId); animFrameId = null; }
    resetVisualizer();
    updateStatus('ready', 'AI Tutor Ready');
  }

  function toggleMessageAudio(playBtn, text, preloadedUrl){
    if (!playBtn) return;

    // If this exact button has the active audio instance, cleanly toggle pause/play
    if (playBtn._audioInstance && currentAudioInstance === playBtn._audioInstance){
      if (!playBtn._audioInstance.paused && !playBtn._audioInstance.ended){
        playBtn._audioInstance.pause();
        playBtn.innerHTML = '▶ Resume Audio';
        playBtn.classList.remove('is-playing');
        if (playBtnEl) playBtnEl.textContent = '▶ Resume';
        if (animFrameId){ cancelAnimationFrame(animFrameId); animFrameId = null; }
        resetVisualizer();
        updateStatus('ready', 'Audio Paused');
      } else {
        playBtn._audioInstance.play().catch(function(e){ console.warn('Audio play error:', e); });
        playBtn.innerHTML = '⏸ Pause Audio';
        playBtn.classList.add('is-playing');
        if (playBtnEl) playBtnEl.textContent = '⏸ Pause';
        startSyntheticVisualizer();
        updateStatus('speaking', 'Speaking...');
      }
      return;
    }

    // Check if Sarvam API key exists in localStorage before initiating TTS
    if (!preloadedUrl && !getSavedApiKey()){
      openApiKeyModal(function(){
        toggleMessageAudio(playBtn, text, preloadedUrl);
      });
      return;
    }

    // Otherwise, start clean playback for this message
    stopAudioPlayback();
    var thisToken = ++currentPlaybackToken;
    currentAbortController = new AbortController();
    var signal = currentAbortController.signal;

    currentActivePlayBtn = playBtn;
    currentAudioText = text;
    playBtn.innerHTML = '⏳ Loading...';
    playBtn.disabled = true;
    updateStatus('synthesizing', 'Synthesizing voice...');

    if (preloadedUrl){
      setupAndPlayAudio(preloadedUrl, null, playBtn, text, thisToken);
      return;
    }

    var cacheKey = currentLang + ':' + text;
    var cached = narrationAudioCache[cacheKey];
    if (cached && cached.blob){
      var url = URL.createObjectURL(cached.blob);
      setupAndPlayAudio(url, cached.blob, playBtn, text, thisToken);
      return;
    }

    fetchSarvamTtsAudio(text, currentLang, currentSpeaker, signal)
      .then(function(result){
        if (thisToken !== currentPlaybackToken || signal.aborted) return;
        narrationAudioCache[cacheKey] = result;
        var url = URL.createObjectURL(result.blob);
        setupAndPlayAudio(url, result.blob, playBtn, text, thisToken);
      })
      .catch(function(err){
        if (thisToken !== currentPlaybackToken || signal.aborted) return;
        console.error('[VoiceAssistant] Message TTS error:', err);
        playBtn.innerHTML = '▶ Play Audio';
        playBtn.disabled = false;
        playBtn.classList.remove('is-playing');
        updateStatus('ready', 'AI Tutor Ready');
      });
  }

  // =========================================================================
  // STEP-BY-STEP CMOS BUILD ANIMATION NARRATION (45–60 SECOND DYNAMIC SEQUENCE)
  // =========================================================================

  window.prefetchVoiceAudio = function(textDict){
    var text = (typeof textDict === 'object' && textDict) ? (textDict[currentLang] || textDict['en-IN'] || textDict.text) : textDict;
    if (!text || !getSavedApiKey()) return Promise.resolve(null);
    var cacheKey = currentLang + ':' + text;
    if (narrationAudioCache[cacheKey]) return Promise.resolve(narrationAudioCache[cacheKey]);
    return fetchSarvamTtsAudio(text, currentLang, currentSpeaker)
      .then(function(res){
        narrationAudioCache[cacheKey] = res;
        return res;
      })
      .catch(function(err){
        console.warn('[VoiceAssistant] Prefetch error:', err);
        return null;
      });
  };

  window.prefetchNarrationSteps = function(steps){
    if (!Array.isArray(steps) || !getSavedApiKey()) return;
    steps.forEach(function(step){
      var scriptObj = step.script || step.narration;
      var text = (typeof scriptObj === 'object' && scriptObj) ? (scriptObj[currentLang] || scriptObj['en-IN']) : scriptObj;
      if (!text) return;
      var cacheKey = currentLang + ':' + text;
      if (narrationAudioCache[cacheKey]) return;
      fetchSarvamTtsAudio(text, currentLang, currentSpeaker)
        .then(function(res){
          narrationAudioCache[cacheKey] = res;
        })
        .catch(function(){
          // Silently ignore prefetch errors, will fetch synchronously on step landing
        });
    });
  };

  window.playVoiceNarration = function(stepIndex, title, textDict, durationSec, onEndedCallback){
    return new Promise(function(resolve){
      var isResolved = false;
      function onDone(){
        if (isResolved) return;
        isResolved = true;
        activeNarrationPromiseResolve = null;
        if (typeof onEndedCallback === 'function'){
          try { onEndedCallback(); } catch(e){}
        }
        resolve();
      }
      activeNarrationPromiseResolve = onDone;

      var text = (typeof textDict === 'object' && textDict) ? (textDict[currentLang] || textDict['en-IN'] || textDict.text) : textDict;
      if (!text){
        onDone();
        return;
      }

      // Check if Sarvam API key exists in localStorage before initiating narration
      if (!getSavedApiKey()){
        if (typeof isBuildAnimating !== 'undefined' && isBuildAnimating && typeof pauseBuildAnimation === 'function'){
          pauseBuildAnimation();
        }
        openApiKeyModal(function(){
          if (typeof isBuildAnimating !== 'undefined' && isBuildAnimating && typeof resumeBuildAnimation === 'function'){
            resumeBuildAnimation();
          }
          window.playVoiceNarration(stepIndex, title, textDict, durationSec, onDone);
        });
        return;
      }

      // Immediately halt all existing playback and cancel any in-flight requests
      stopAudioPlayback();
      activeNarrationPromiseResolve = onDone; // restore after stopAudioPlayback
      var thisToken = ++currentPlaybackToken;
      currentAbortController = new AbortController();
      var signal = currentAbortController.signal;

      currentAudioText = text;
      isPlaying = true;
      if (ctxVal) ctxVal.textContent = title;
      updateStatus('speaking', 'Explaining ' + title + '...');
      if (stopBtn) stopBtn.disabled = false;
      if (playBtnEl){
        playBtnEl.disabled = false;
        playBtnEl.textContent = '⏸ Pause';
      }

      // Append in assistant message area with interactive Play/Pause button
      var msgObj = appendMessage('ai', text);
      var playBtn = msgObj ? msgObj.playBtn : null;
      currentActivePlayBtn = playBtn;

      // Check prefetch / narration cache
      var cacheKey = currentLang + ':' + text;
      var cached = narrationAudioCache[cacheKey];

      if (cached && cached.blob){
        var url = URL.createObjectURL(cached.blob);
        setupAndPlayAudio(url, cached.blob, playBtn, text, thisToken, onDone);
        return;
      }

      // Fetch audio from Sarvam TTS API
      if (playBtn){
        playBtn.innerHTML = '⏳ Loading...';
        playBtn.disabled = true;
      }

      fetchSarvamTtsAudio(text, currentLang, currentSpeaker, signal)
        .then(function(result){
          if (thisToken !== currentPlaybackToken || signal.aborted){
            onDone();
            return;
          }
          narrationAudioCache[cacheKey] = result;
          var url = URL.createObjectURL(result.blob);
          setupAndPlayAudio(url, result.blob, playBtn, text, thisToken, onDone);
        })
        .catch(function(err){
          if (thisToken !== currentPlaybackToken || signal.aborted){
            onDone();
            return;
          }
          console.error('[VoiceAssistant] Narration TTS error:', err);
          if (playBtn){
            playBtn.innerHTML = '▶ Play Audio';
            playBtn.disabled = false;
          }
          // Fallback visualizer timing if audio fails
          startSyntheticVisualizer();
          setTimeout(function(){
            if (thisToken !== currentPlaybackToken){
              onDone();
              return;
            }
            if (animFrameId){ cancelAnimationFrame(animFrameId); animFrameId = null; }
            resetVisualizer();
            updateStatus('ready', 'AI Tutor Ready');
            onDone();
          }, (durationSec || 5.0) * 1000);
        });
    });
  };

  window.pauseVoiceNarration = function(){
    if (currentAudioInstance && !currentAudioInstance.paused){
      try { currentAudioInstance.pause(); } catch(e){}
    }
    if (currentActivePlayBtn){
      currentActivePlayBtn.innerHTML = '▶ Resume Audio';
      currentActivePlayBtn.classList.remove('is-playing');
    }
    if (playBtnEl){
      playBtnEl.textContent = '▶ Resume';
      playBtnEl.disabled = false;
    }
    if (animFrameId){ cancelAnimationFrame(animFrameId); animFrameId = null; }
    resetVisualizer();
    updateStatus('ready', 'Narration Paused');
  };

  window.resumeVoiceNarration = function(){
    if (currentAudioInstance && currentAudioInstance.paused){
      try { currentAudioInstance.play(); } catch(e){}
    }
    if (currentActivePlayBtn){
      currentActivePlayBtn.innerHTML = '⏸ Pause Audio';
      currentActivePlayBtn.classList.add('is-playing');
    }
    if (playBtnEl){
      playBtnEl.textContent = '⏸ Pause';
      playBtnEl.disabled = false;
    }
    startSyntheticVisualizer();
    updateStatus('speaking', 'Speaking...');
  };

  window.stopVoiceNarration = function(){
    stopAudioPlayback();
  };

  function playCompleteAudioBlob(url){
    stopAudioPlayback();
    var thisToken = ++currentPlaybackToken;
    setupAndPlayAudio(url, null, null, '', thisToken);
  }

  // =========================================================================
  // STREAMING QUERY & PROGRESSIVE WEB AUDIO QUEUE
  // =========================================================================

  async function generateDirectExplanation(question, context, langCode, signal){
    var langName = (langCode === 'hi-IN') ? 'Hindi (hi-IN)' : ((langCode === 'te-IN') ? 'Telugu (te-IN)' : 'English (en-IN)');
    var systemPrompt = 'You are an expert CMOS VLSI tutor and layout educator for an interactive 3D CMOS Inverter CAD viewer. ' +
      'Never use a mechanical "Step 1, Step 2" or numbered list format. Instead, use a cohesive, engaging storytelling format. ' +
      'Whenever explaining fabrication, layout, or components, always connect the physical or electrical problem ("the why", such as mechanical support, isolating polarities, preventing short-circuits or quantum leakage, supplying charge carriers, or routing signals) with the physical layer or component acting as the solution ("the what", exactly as it appears on screen). ' +
      'Provide a crisp, clear, student-friendly explanation (2 to 3 concise spoken sentences, ~45-65 words) in ' + langName + ' that directly answers the user\'s question using the provided component metadata, lambda design rules, and circuit state. ' +
      'Never use markdown formatting, bold asterisks, bullet points, numbered lists, or awkward raw equations that sound unnatural when spoken aloud. Use natural conversational phrasing specifically crafted for voice speech synthesis in ' + langName + '.';

    var ctxSummary = context ? [
      context.title ? ('Selected Component: ' + context.title) : null,
      context.fn ? ('Function: ' + context.fn) : null,
      context.role ? ('Electrical Role: ' + context.role) : null,
      context.rel ? ('Physical Relationship: ' + context.rel) : null,
      context.doping ? ('Doping: ' + context.doping) : null,
      context.dimensions ? ('Dimensions: ' + (typeof context.dimensions === 'string' ? context.dimensions : JSON.stringify(context.dimensions))) : null,
      context.circuitState ? ('Current Circuit State: IN=' + context.circuitState.in + ', PMOS=' + context.circuitState.pmos + ', NMOS=' + context.circuitState.nmos + ', OUT=' + context.circuitState.out) : null
    ].filter(Boolean).join('\n') : 'No specific component selected; full inverter layout.';

    var userPrompt = 'Layout & Circuit Context:\n' + ctxSummary + '\n\nUser Question: ' + (question || 'Explain the role and physics of this component in the CMOS inverter.');

    var apiKey = getSavedApiKey();
    if (!apiKey){
      return getLocalFallbackExplanation(context, langCode);
    }

    try {
      var res = await fetch('https://api.sarvam.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-subscription-key': apiKey
        },
        body: JSON.stringify({
          model: 'sarvam-105b-conversations',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 160,
          temperature: 0.3
        }),
        signal: signal
      });

      if (res.ok) {
        var data = await res.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          var text = data.choices[0].message.content.trim().replace(/[*_#`]/g, '').replace(/\s+/g, ' ');
          if (text.length > 5) return text;
        }
      }
    } catch(err) {
      if (err.name === 'AbortError') throw err;
      console.warn('[VoiceAssistant] Direct chat completion error:', err);
    }

    return getLocalFallbackExplanation(context, langCode);
  }

  function getLocalFallbackExplanation(context, langCode){
    var comp = context && context.title ? context.title : 'CMOS Inverter';
    var role = context && context.role ? context.role : 'performing complementary digital logic inversion.';
    var state = context && context.circuitState ? ('In our current circuit state, the input is ' + context.circuitState.in + ', PMOS is ' + context.circuitState.pmos + ', NMOS is ' + context.circuitState.nmos + ', and Output is ' + context.circuitState.out + '.') : '';

    if (langCode === 'hi-IN'){
      return 'सीमॉस इन्वर्टर में प्रत्येक परत एक महत्वपूर्ण भौतिक समस्या को हल करती है। ' + comp + ' का मुख्य कार्य ' + role + ' वर्तमान स्थिति में, ' + state;
    } else if (langCode === 'te-IN'){
      return 'సిమోస్ ఇన్వర్టర్‌లో ప్రతి పొర ఒక ముఖ్యమైన భౌతిక సమస్యను పరిష్కరిస్తుంది. ' + comp + ' యొక్క ముఖ్య ఉద్దేశ్యం ' + role + ' ప్రస్తుత స్థితిలో, ' + state;
    } else {
      return 'Every physical layer in this CMOS layout solves a critical electrical challenge. The ' + comp + ' fulfills this requirement by ' + role + ' ' + state;
    }
  }

  async function askVoiceAssistant(queryText){
    var text = (queryText || '').trim();
    if (!text && !activeContext) return;

    if (!text){
      text = 'Explain the selected component and how it functions.';
    }

    // Check if Sarvam API key exists in localStorage before querying AI tutor
    if (!getSavedApiKey()){
      openApiKeyModal(function(){
        askVoiceAssistant(queryText);
      });
      return;
    }

    // Immediately halt all existing playback, cancel any in-flight requests, and increment token
    stopAudioPlayback();
    var thisToken = ++currentPlaybackToken;
    currentAbortController = new AbortController();
    var signal = currentAbortController.signal;

    isThinking = true;
    updateStatus('thinking', 'Thinking...');
    if (sendBtn) sendBtn.disabled = true;
    if (inputField) inputField.value = '';

    appendMessage('user', text);

    // Ensure active context has latest circuit state
    if (!activeContext){
      window.clearVoiceAssistantContext();
    } else {
      activeContext.circuitState = getCircuitStateInfo();
    }

    var ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended'){
      try {
        await Promise.race([
          ctx.resume(),
          new Promise(function(resolve){ setTimeout(resolve, 250); })
        ]);
      } catch(e){}
    }

    if (thisToken !== currentPlaybackToken || signal.aborted) return;

    try {
      updateStatus('synthesizing', 'Synthesizing audio...');

      var payload = {
        question: text,
        context: activeContext,
        language_code: currentLang,
        speaker: currentSpeaker
      };

      var explanationText = '';
      var reader = null;
      var backendSuccess = false;
      var apiKey = getSavedApiKey();

      // 1. Try backend serverless route first
      try {
        var response = await fetch('/api/voice-assistant', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey
          },
          body: JSON.stringify(payload),
          signal: signal
        });

        if (thisToken !== currentPlaybackToken || signal.aborted) return;

        if (response.ok && response.body) {
          var rawHeaderText = response.headers.get('x-explanation-text');
          if (rawHeaderText) {
            try { explanationText = decodeURIComponent(rawHeaderText); } catch(e){ explanationText = rawHeaderText; }
          }
          reader = response.body.getReader();
          backendSuccess = true;
        }
      } catch (backendErr) {
        if (backendErr.name === 'AbortError' || thisToken !== currentPlaybackToken) return;
        console.log('[VoiceAssistant] Backend route unavailable (' + backendErr.message + '), falling back to direct Sarvam AI engine.');
      }

      if (thisToken !== currentPlaybackToken || signal.aborted) return;

      // 2. Direct browser-to-Sarvam engine fallback if backend route is unavailable (e.g. static hosting, Live Server)
      if (!backendSuccess) {
        updateStatus('thinking', 'Thinking...');
        explanationText = await generateDirectExplanation(text, activeContext, currentLang, signal);

        if (thisToken !== currentPlaybackToken || signal.aborted) return;

        updateStatus('synthesizing', 'Synthesizing audio...');
        var ttsRes = await fetch('https://api.sarvam.ai/text-to-speech/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-subscription-key': apiKey
          },
          body: JSON.stringify({
            text: explanationText,
            model: 'bulbul:v4-flash',
            language_code: currentLang,
            speaker: currentSpeaker,
            speech_sample_rate: 24000,
            output_audio_codec: 'wav',
            pace: 1.0,
            enable_preprocessing: true
          }),
          signal: signal
        });

        if (thisToken !== currentPlaybackToken || signal.aborted) return;

        if (!ttsRes.ok) {
          var errDetail = await ttsRes.text();
          throw new Error('Sarvam TTS error ' + ttsRes.status + ': ' + errDetail);
        }
        reader = ttsRes.body.getReader();
      }

      if (thisToken !== currentPlaybackToken || signal.aborted) return;

      var rawChunks = [];
      var totalBytes = 0;
      var chunkIndex = 0;

      // Progressive playback schedule tracking
      var nextPlayTime = (ctx ? ctx.currentTime : 0) + 0.05;
      var leftoverByte = null;
      var hasStartedAudio = false;

      // Append assistant message container
      appendMessage('ai', explanationText || 'Streaming explanation...');

      if (stopBtn) stopBtn.disabled = false;
      isPlaying = true;
      updateStatus('speaking', 'Speaking...');

      while (true){
        if (thisToken !== currentPlaybackToken || signal.aborted){
          try { reader.cancel(); } catch(e){}
          break;
        }

        var step = await reader.read();
        if (thisToken !== currentPlaybackToken || signal.aborted) break;
        if (step.done) break;

        var chunk = step.value;
        if (!chunk || chunk.length === 0) continue;

        rawChunks.push(chunk);
        totalBytes += chunk.length;

        // Chunk 0 is the 44-byte WAV header
        if (chunkIndex === 0 && chunk.length >= 44){
          var pcmData = chunk.subarray(44);
          if (pcmData.length > 0 && ctx){
            schedulePcmChunk(pcmData);
          }
        } else if (chunkIndex > 0 && ctx){
          schedulePcmChunk(chunk);
        }

        chunkIndex++;
      }

      function schedulePcmChunk(bytes){
        if (!ctx || thisToken !== currentPlaybackToken || signal.aborted) return;
        var slice = bytes;

        if (leftoverByte !== null){
          var joined = new Uint8Array(slice.length + 1);
          joined[0] = leftoverByte;
          joined.set(slice, 1);
          slice = joined;
          leftoverByte = null;
        }

        if (slice.length % 2 !== 0){
          leftoverByte = slice[slice.length - 1];
          slice = slice.subarray(0, slice.length - 1);
        }

        if (slice.length < 2) return;

        var pcm16 = new Int16Array(slice.buffer, slice.byteOffset, slice.byteLength / 2);
        var float32 = new Float32Array(pcm16.length);
        for (var i = 0; i < pcm16.length; i++){
          float32[i] = pcm16[i] / 32768.0;
        }

        var audioBuffer = ctx.createBuffer(1, float32.length, 24000);
        audioBuffer.copyToChannel(float32, 0);

        var sourceNode = ctx.createBufferSource();
        sourceNode.buffer = audioBuffer;
        sourceNode.connect(analyserNode);
        analyserNode.connect(ctx.destination);

        var startTime = Math.max(ctx.currentTime + 0.02, nextPlayTime);
        sourceNode.start(startTime);
        nextPlayTime = startTime + audioBuffer.duration;

        activeSources.push(sourceNode);

        if (!hasStartedAudio){
          hasStartedAudio = true;
          startVisualizerAnimation();
        }

        sourceNode.onended = function(){
          if (thisToken !== currentPlaybackToken) return;
          var idx = activeSources.indexOf(sourceNode);
          if (idx !== -1) activeSources.splice(idx, 1);
          if (activeSources.length === 0 && !isThinking){
            isPlaying = false;
            if (stopBtn) stopBtn.disabled = true;
            updateStatus('ready', 'AI Tutor Ready');
            resetVisualizer();
          }
        };
      }

      // Assemble complete audio blob for replay & clean cleanup
      if (thisToken === currentPlaybackToken && rawChunks.length > 0){
        var firstChunk = rawChunks[0];
        if (firstChunk && firstChunk.length >= 44){
          var fixedFirst = new Uint8Array(firstChunk);
          var dataSize = totalBytes - 44;
          var fileSize = totalBytes - 8;
          var dv = new DataView(fixedFirst.buffer, fixedFirst.byteOffset, fixedFirst.byteLength);
          dv.setUint32(4, fileSize, true);
          dv.setUint32(40, dataSize, true);
          rawChunks[0] = fixedFirst;
        }

        var blob = new Blob(rawChunks, { type: 'audio/wav' });
        currentObjectUrl = URL.createObjectURL(blob);
        if (explanationText){
          narrationAudioCache[currentLang + ':' + explanationText] = { blob: blob };
          currentAudioText = explanationText;
          if (playBtnEl) playBtnEl.disabled = false;
        }
      }

    } catch (err){
      if (err.name === 'AbortError' || thisToken !== currentPlaybackToken){
        // Silently discard aborted or superseded request
        return;
      }
      console.error('Voice Assistant Error:', err);
      appendMessage('ai', 'Error: ' + err.message);
      updateStatus('ready', 'AI Tutor Ready');
      isPlaying = false;
      if (stopBtn) stopBtn.disabled = true;
    } finally {
      if (thisToken === currentPlaybackToken){
        isThinking = false;
        if (sendBtn) sendBtn.disabled = false;
      }
    }
  }

  // =========================================================================
  // SPEECH-TO-TEXT (MIC INPUT WITH 1.5s SILENCE DEBOUNCE & isFinal GATING)
  // =========================================================================
  var speechDebounceTimer = null;
  var accumulatedSpeechText = '';
  var interimSpeechText = '';
  var SILENCE_DEBOUNCE_MS = 1500; // 1.5-second silence debounce

  function clearSpeechDebounce(){
    if (speechDebounceTimer){
      clearTimeout(speechDebounceTimer);
      speechDebounceTimer = null;
    }
  }

  function commitRecognizedSpeech(){
    clearSpeechDebounce();
    var fullQuery = (accumulatedSpeechText + ' ' + interimSpeechText).trim();
    accumulatedSpeechText = '';
    interimSpeechText = '';

    if (speechRecognition && isRecognizing){
      try { speechRecognition.stop(); } catch(e){}
    }

    if (fullQuery.length > 0){
      askVoiceAssistant(fullQuery);
    }
  }

  function initSpeechRecognition(){
    var SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass){
      if (micBtn){
        micBtn.title = 'Speech recognition not supported in this browser';
        micBtn.style.opacity = '0.5';
      }
      return;
    }

    speechRecognition = new SpeechRecognitionClass();
    speechRecognition.continuous = true;       // Keep listening across natural conversational pauses
    speechRecognition.interimResults = true;    // Capture live partial words for UI feedback without triggering LLM
    speechRecognition.lang = currentLang;

    speechRecognition.onstart = function(){
      isRecognizing = true;
      accumulatedSpeechText = '';
      interimSpeechText = '';
      clearSpeechDebounce();

      if (micBtn){
        micBtn.classList.add('recording');
        micBtn.title = 'Listening... Click to finish speaking';
      }
      updateStatus('listening', 'Listening...');
    };

    speechRecognition.onresult = function(event){
      // Always reset silence debounce timer when any new audio/speech is received
      clearSpeechDebounce();

      var currentInterim = '';
      for (var i = event.resultIndex; i < event.results.length; ++i){
        var res = event.results[i];
        if (res.isFinal){
          accumulatedSpeechText += (accumulatedSpeechText ? ' ' : '') + res[0].transcript.trim();
        } else {
          currentInterim += res[0].transcript;
        }
      }
      interimSpeechText = currentInterim.trim();

      var displayTranscript = (accumulatedSpeechText + (interimSpeechText ? ' ' + interimSpeechText : '')).trim();
      if (inputField && displayTranscript){
        inputField.value = displayTranscript;
      }

      // 1.5-second silence debounce: wait until user has completely stopped speaking
      // before sending the combined final payload to the backend
      if (displayTranscript.length > 0){
        speechDebounceTimer = setTimeout(function(){
          commitRecognizedSpeech();
        }, SILENCE_DEBOUNCE_MS);
      }
    };

    speechRecognition.onerror = function(event){
      if (event.error === 'no-speech'){
        // Silence detected by browser engine without error; do not abort prematurely
        return;
      }
      console.warn('Speech recognition error:', event.error);
      clearSpeechDebounce();
      isRecognizing = false;
      if (micBtn){
        micBtn.classList.remove('recording');
        micBtn.title = 'Voice Input (Mic)';
      }
      updateStatus('ready', 'AI Tutor Ready');
    };

    speechRecognition.onend = function(){
      isRecognizing = false;
      if (micBtn){
        micBtn.classList.remove('recording');
        micBtn.title = 'Voice Input (Mic)';
      }

      // If speech was captured and awaits final debounce, commit it now
      var pending = (accumulatedSpeechText + ' ' + interimSpeechText).trim();
      if (pending.length > 0){
        commitRecognizedSpeech();
      } else if (!isThinking && !isPlaying){
        updateStatus('ready', 'AI Tutor Ready');
      }
    };
  }

  function toggleSpeechRecognition(){
    if (!speechRecognition){
      initSpeechRecognition();
    }
    if (!speechRecognition){
      alert('Speech-to-text recognition is not supported in this browser. Please type your question.');
      return;
    }

    if (isRecognizing){
      // User explicitly clicked mic to finish speaking
      commitRecognizedSpeech();
    } else {
      // Check if Sarvam API key exists before listening
      if (!getSavedApiKey()){
        openApiKeyModal(function(){
          toggleSpeechRecognition();
        });
        return;
      }
      // User clicked mic to start speaking: immediately halt any AI speech output so mic does not capture speaker audio
      stopAudioPlayback();
      speechRecognition.lang = currentLang;
      try {
        speechRecognition.start();
      } catch(e){
        console.warn('Recognition start error:', e);
      }
    }
  }

  // =========================================================================
  // UI INITIALIZATION & EVENT LISTENERS
  // =========================================================================

  function updateSpeakerOptions(lang){
    if (!speakerSelect) return;
    speakerSelect.innerHTML = '';
    var list = PERSONAS[lang] || PERSONAS['en-IN'];
    list.forEach(function(item, idx){
      var opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.name;
      if (idx === 0) opt.selected = true;
      speakerSelect.appendChild(opt);
    });
    currentSpeaker = speakerSelect.value;
  }

  function initVoiceAssistant(){
    widgetEl = document.getElementById('voice-assistant-widget');
    launcherEl = document.getElementById('va-launcher-btn');
    langSelect = document.getElementById('va-lang-select');
    speakerSelect = document.getElementById('va-speaker-select');
    statusPill = document.getElementById('va-status-pill');
    statusText = document.getElementById('va-status-text');
    playBtnEl = document.getElementById('va-btn-play');
    stopBtn = document.getElementById('va-btn-stop');
    inputField = document.getElementById('va-input-text');
    sendBtn = document.getElementById('va-btn-send');
    micBtn = document.getElementById('va-btn-mic');
    ctxVal = document.getElementById('va-ctx-val');
    ctxState = document.getElementById('va-ctx-state');
    responseArea = document.getElementById('va-response-area');
    visualizerBars = Array.from(document.querySelectorAll('#va-visualizer .bar'));

    // Modal elements
    keyModalBackdrop = document.getElementById('va-key-modal');
    keyModalTitle = document.getElementById('va-modal-title');
    keyModalInput = document.getElementById('va-input-apikey');
    keyModalEyeBtn = document.getElementById('va-btn-toggle-key-visibility');
    keyModalStatusMsg = document.getElementById('va-key-status-msg');
    keyModalSessionOnlyChk = document.getElementById('va-chk-session-only');
    keyModalClearBtn = document.getElementById('va-modal-clear-btn');
    keyModalCancelBtn = document.getElementById('va-modal-cancel-btn');
    keyModalCloseBtn = document.getElementById('va-modal-close-btn');
    keyModalSaveBtn = document.getElementById('va-modal-save-btn');
    settingsBtn = document.getElementById('va-btn-settings');

    if (!widgetEl) return;

    // Initialize speaker options
    updateSpeakerOptions(currentLang);

    // Initial status reflects whether custom key is present
    if (!getSavedApiKey()){
      updateStatus('ready', 'AI Tutor Ready (Key Req.)');
    }

    // Modal event listeners
    if (settingsBtn){
      settingsBtn.addEventListener('click', function(){
        openApiKeyModal();
      });
    }

    if (keyModalCloseBtn){
      keyModalCloseBtn.addEventListener('click', closeApiKeyModal);
    }
    if (keyModalCancelBtn){
      keyModalCancelBtn.addEventListener('click', closeApiKeyModal);
    }
    if (keyModalBackdrop){
      keyModalBackdrop.addEventListener('click', function(e){
        if (e.target === keyModalBackdrop) closeApiKeyModal();
      });
    }

    if (keyModalEyeBtn && keyModalInput){
      keyModalEyeBtn.addEventListener('click', function(){
        if (keyModalInput.type === 'password'){
          keyModalInput.type = 'text';
          keyModalEyeBtn.textContent = '🙈';
        } else {
          keyModalInput.type = 'password';
          keyModalEyeBtn.textContent = '👁️';
        }
      });
    }

    if (keyModalSaveBtn){
      keyModalSaveBtn.addEventListener('click', handleSaveAndTestVoice);
    }

    if (keyModalInput){
      keyModalInput.addEventListener('keydown', function(e){
        if (e.key === 'Enter'){
          e.preventDefault();
          handleSaveAndTestVoice();
        }
      });
    }

    if (keyModalClearBtn){
      keyModalClearBtn.addEventListener('click', function(){
        clearSavedApiKey();
        if (keyModalInput) keyModalInput.value = '';
        keyModalClearBtn.style.display = 'none';
        showModalStatus('info', 'API key cleared from local storage.');
        updateStatus('ready', 'AI Tutor Ready (Key Req.)');
        narrationAudioCache = {};
      });
    }

    window.addEventListener('keydown', function(e){
      if (e.key === 'Escape' && keyModalBackdrop && keyModalBackdrop.classList.contains('is-open')){
        closeApiKeyModal();
      }
    });

    // Language select change
    langSelect.addEventListener('change', function(){
      currentLang = langSelect.value;
      updateSpeakerOptions(currentLang);
      if (speechRecognition) speechRecognition.lang = currentLang;
      if (typeof buildSteps !== 'undefined' && Array.isArray(buildSteps)){
        window.prefetchNarrationSteps(buildSteps);
      }
    });

    // Speaker select change
    speakerSelect.addEventListener('change', function(){
      currentSpeaker = speakerSelect.value;
    });

    // Play / Pause toggle button in status bar
    if (playBtnEl){
      playBtnEl.addEventListener('click', function(){
        if (currentAudioInstance){
          if (!currentAudioInstance.paused){
            window.pauseVoiceNarration();
            if (typeof isBuildAnimating !== 'undefined' && isBuildAnimating && !isBuildPaused && typeof pauseBuildAnimation === 'function'){
              pauseBuildAnimation();
            }
          } else {
            window.resumeVoiceNarration();
            if (typeof isBuildAnimating !== 'undefined' && isBuildAnimating && isBuildPaused && typeof resumeBuildAnimation === 'function'){
              resumeBuildAnimation();
            }
          }
        } else {
          if (!getSavedApiKey()){
            openApiKeyModal(function(){
              if (currentActivePlayBtn) currentActivePlayBtn.click();
              else if (currentAudioText) toggleMessageAudio(null, currentAudioText, null);
            });
            return;
          }
          if (currentActivePlayBtn){
            currentActivePlayBtn.click();
          } else if (currentAudioText){
            toggleMessageAudio(null, currentAudioText, null);
          }
        }
      });
    }

    // Stop button
    stopBtn.addEventListener('click', function(){
      stopAudioPlayback();
      if (typeof isBuildAnimating !== 'undefined' && isBuildAnimating && typeof stopBuildAnimation === 'function'){
        stopBuildAnimation();
      }
    });

    // Send button
    if (sendBtn){
      sendBtn.addEventListener('click', function(){
        var text = inputField ? inputField.value : '';
        askVoiceAssistant(text);
      });
    }

    // Enter key in input
    if (inputField){
      inputField.addEventListener('keydown', function(e){
        if (e.key === 'Enter'){
          e.preventDefault();
          askVoiceAssistant(inputField.value);
        }
      });
    }

    // Mic button
    if (micBtn){
      micBtn.addEventListener('click', function(){
        toggleSpeechRecognition();
      });
    }

    // Ensure initial welcome message has an interactive play/pause button
    var initialAiMsg = (responseArea && responseArea.querySelector) ? responseArea.querySelector('.va-msg-ai') : null;
    if (initialAiMsg && initialAiMsg.querySelector && !initialAiMsg.querySelector('.va-play-btn')){
      var bodyText = initialAiMsg.querySelector('.va-msg-body');
      var welcomeText = bodyText ? bodyText.textContent.trim() : '';
      if (welcomeText){
        var actions = document.createElement('div');
        actions.className = 'va-msg-actions';
        var initialPlayBtn = document.createElement('button');
        initialPlayBtn.className = 'va-play-btn';
        initialPlayBtn.innerHTML = '▶ Play Audio';
        initialPlayBtn.title = 'Play / Pause voice audio with Sarvam TTS';
        initialPlayBtn.addEventListener('click', function(){
          toggleMessageAudio(initialPlayBtn, welcomeText, null);
        });
        actions.appendChild(initialPlayBtn);
        initialAiMsg.appendChild(actions);
        currentAudioText = welcomeText;
        if (playBtnEl) playBtnEl.disabled = false;
      }
    }

    // Minimize button
    document.getElementById('va-btn-minimize').addEventListener('click', function(){
      widgetEl.classList.add('minimized');
      launcherEl.classList.add('visible');
    });

    // Close button
    document.getElementById('va-btn-close').addEventListener('click', function(){
      stopAudioPlayback();
      widgetEl.classList.add('minimized');
      launcherEl.classList.add('visible');
    });

    // Launcher button (restore)
    launcherEl.addEventListener('click', function(){
      widgetEl.classList.remove('minimized');
      launcherEl.classList.remove('visible');
      if (inputField) inputField.focus();
    });

    // Quick prompt chips
    document.querySelectorAll('.va-chip').forEach(function(chip){
      chip.addEventListener('click', function(){
        var q = chip.dataset.q;
        if (q){
          askVoiceAssistant(q);
        }
      });
    });

    // Clear context initially
    window.clearVoiceAssistantContext();

    // Adjust position if side panel is toggled
    var rightPanel = document.getElementById('right-panel');
    function updateWidgetRightOffset(){
      if (rightPanel && rightPanel.classList.contains('open')){
        var w = rightPanel.getBoundingClientRect().width;
        widgetEl.style.right = (w + 14) + 'px';
        launcherEl.style.right = (w + 14) + 'px';
      } else {
        widgetEl.style.right = '';
        launcherEl.style.right = '';
      }
    }
    window.addEventListener('resize', updateWidgetRightOffset);
    if (document.getElementById('right-toggle')){
      document.getElementById('right-toggle').addEventListener('click', function(){
        setTimeout(updateWidgetRightOffset, 50);
      });
    }

    window.getCurrentAssistantLang = function(){
      return currentLang || 'en-IN';
    };
    window.getCurrentAssistantSpeaker = function(){
      return currentSpeaker || 'aparna_en_edtech';
    };
    window.notifyTourAudioStart = function(text){
      isPlaying = true;
      updateStatus('speaking', 'Speaking tour...');
      startSyntheticVisualizer();
      if (stopBtn) stopBtn.disabled = false;
    };
    window.notifyTourAudioEnd = function(){
      isPlaying = false;
      if (animFrameId){ cancelAnimationFrame(animFrameId); animFrameId = null; }
      resetVisualizer();
      updateStatus('ready', 'AI Tutor Ready');
      if (stopBtn) stopBtn.disabled = true;
    };

    console.log('[VoiceAssistant] Sarvam AI Bulbul v4 Flash Voice Assistant initialized.');
  }

  // Bootstrap when DOM ready
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initVoiceAssistant);
  } else {
    initVoiceAssistant();
  }

})();
