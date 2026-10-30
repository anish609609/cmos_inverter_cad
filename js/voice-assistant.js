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

  // DOM Elements (cached after init)
  var widgetEl = null;
  var launcherEl = null;
  var langSelect = null;
  var speakerSelect = null;
  var statusPill = null;
  var statusText = null;
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
    // Stop all actively scheduled buffer source nodes
    activeSources.forEach(function(src){
      try { src.stop(); src.disconnect(); } catch(e){}
    });
    activeSources = [];
    isPlaying = false;

    // Stop visualizer animation
    if (animFrameId){
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    resetVisualizer();

    if (stopBtn) stopBtn.disabled = true;
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
    if (!responseArea) return;
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

    if (audioUrl && sender === 'ai'){
      var actions = document.createElement('div');
      actions.className = 'va-msg-actions';

      var replayBtn = document.createElement('button');
      replayBtn.className = 'va-replay-btn';
      replayBtn.innerHTML = '▶ Replay Audio';
      replayBtn.addEventListener('click', function(){
        playCompleteAudioBlob(audioUrl);
      });
      actions.appendChild(replayBtn);
      msg.appendChild(actions);
    }

    responseArea.appendChild(msg);
    responseArea.scrollTop = responseArea.scrollHeight;
  }

  function playCompleteAudioBlob(url){
    stopAudioPlayback();
    var audio = new Audio(url);
    isPlaying = true;
    if (stopBtn) stopBtn.disabled = false;
    updateStatus('speaking', 'Speaking...');

    audio.onended = function(){
      isPlaying = false;
      if (stopBtn) stopBtn.disabled = true;
      updateStatus('ready', 'AI Tutor Ready');
    };
    audio.onerror = function(){
      isPlaying = false;
      if (stopBtn) stopBtn.disabled = true;
      updateStatus('ready', 'AI Tutor Ready');
    };
    audio.play();
  }

  // =========================================================================
  // STREAMING QUERY & PROGRESSIVE WEB AUDIO QUEUE
  // =========================================================================

  async function askVoiceAssistant(queryText){
    var text = (queryText || '').trim();
    if (!text && !activeContext) return;

    if (!text){
      text = 'Explain the selected component and how it functions.';
    }

    stopAudioPlayback();
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

    try {
      updateStatus('synthesizing', 'Synthesizing audio...');

      var payload = {
        question: text,
        context: activeContext,
        language_code: currentLang,
        speaker: currentSpeaker
      };

      var response = await fetch('/api/voice-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok){
        var errInfo = await response.text();
        throw new Error('Server returned ' + response.status + ': ' + errInfo);
      }

      // Read transcript from custom header
      var explanationText = '';
      var rawHeaderText = response.headers.get('x-explanation-text');
      if (rawHeaderText){
        try { explanationText = decodeURIComponent(rawHeaderText); } catch(e){ explanationText = rawHeaderText; }
      }

      // Read binary chunk stream from Sarvam Bulbul v4 Flash
      var reader = response.body.getReader();
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
        var step = await reader.read();
        if (step.done) break;

        var chunk = step.value;
        if (!chunk || chunk.length === 0) continue;

        rawChunks.push(chunk);
        totalBytes += chunk.length;

        // Chunk 0 is the 44-byte WAV header
        if (chunkIndex === 0 && chunk.length >= 44){
          // If first chunk contains audio data past header, slice it
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
        if (!ctx) return;
        var slice = bytes;

        // Handle odd bytes alignment across chunk boundaries
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

        // Convert 16-bit PCM buffer to Float32
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
      if (rawChunks.length > 0){
        // Fix up WAV file size in chunk 0 if possible
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
      }

    } catch (err){
      console.error('Voice Assistant Error:', err);
      appendMessage('ai', 'Error: ' + err.message);
      updateStatus('ready', 'AI Tutor Ready');
      isPlaying = false;
      if (stopBtn) stopBtn.disabled = true;
    } finally {
      isThinking = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  // =========================================================================
  // SPEECH-TO-TEXT (MIC INPUT)
  // =========================================================================

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
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;
    speechRecognition.lang = currentLang;

    speechRecognition.onstart = function(){
      isRecognizing = true;
      if (micBtn){
        micBtn.classList.add('recording');
        micBtn.title = 'Listening... Click to stop';
      }
      updateStatus('listening', 'Listening...');
    };

    speechRecognition.onresult = function(event){
      if (event.results && event.results[0] && event.results[0][0]){
        var transcript = event.results[0][0].transcript;
        if (inputField){
          inputField.value = transcript;
        }
        // Auto-ask after voice input
        setTimeout(function(){
          askVoiceAssistant(transcript);
        }, 300);
      }
    };

    speechRecognition.onerror = function(event){
      console.warn('Speech recognition error:', event.error);
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
      if (!isThinking && !isPlaying){
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
      speechRecognition.stop();
    } else {
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
    stopBtn = document.getElementById('va-btn-stop');
    inputField = document.getElementById('va-input-text');
    sendBtn = document.getElementById('va-btn-send');
    micBtn = document.getElementById('va-btn-mic');
    ctxVal = document.getElementById('va-ctx-val');
    ctxState = document.getElementById('va-ctx-state');
    responseArea = document.getElementById('va-response-area');
    visualizerBars = Array.from(document.querySelectorAll('#va-visualizer .bar'));

    if (!widgetEl) return;

    // Initialize speaker options
    updateSpeakerOptions(currentLang);

    // Language select change
    langSelect.addEventListener('change', function(){
      currentLang = langSelect.value;
      updateSpeakerOptions(currentLang);
      if (speechRecognition) speechRecognition.lang = currentLang;
    });

    // Speaker select change
    speakerSelect.addEventListener('change', function(){
      currentSpeaker = speakerSelect.value;
    });

    // Send button
    sendBtn.addEventListener('click', function(){
      var text = inputField.value;
      askVoiceAssistant(text);
    });

    // Enter key in input
    inputField.addEventListener('keydown', function(e){
      if (e.key === 'Enter'){
        e.preventDefault();
        askVoiceAssistant(inputField.value);
      }
    });

    // Mic button
    micBtn.addEventListener('click', function(){
      toggleSpeechRecognition();
    });

    // Stop button
    stopBtn.addEventListener('click', function(){
      stopAudioPlayback();
    });

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

    console.log('[VoiceAssistant] Sarvam AI Bulbul v4 Flash Voice Assistant initialized.');
  }

  // Bootstrap when DOM ready
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initVoiceAssistant);
  } else {
    initVoiceAssistant();
  }

})();
