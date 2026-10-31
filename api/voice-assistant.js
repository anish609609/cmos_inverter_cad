/**
 * api/voice-assistant.js
 * Vercel Serverless Function & Node backend handler for Sarvam AI Voice Tutor.
 * 
 * 1. Accepts user question, current CMOS layout context, language_code, and speaker persona.
 * 2. Queries Sarvam AI chat completions (sarvam-105b-conversations) to generate a crisp,
 *    student-friendly 2-3 sentence VLSI explanation.
 * 3. Streams text into Sarvam AI streaming TTS (bulbul:v4-flash) at 24kHz.
 * 4. Progressive streaming of audio/wav chunks back to the client with X-Explanation-Text header.
 */

const SARVAM_API_KEY = process.env.SARVAM_API_KEY || '';

// Valid speaker personas for Sarvam Bulbul v4 Flash
const SPEAKER_MAP = {
  'en-IN': {
    default: 'aparna_en_edtech',
    valid: ['aparna_en_edtech', 'aparna_en_companion']
  },
  'hi-IN': {
    default: 'aparna_hi_customer',
    valid: ['aparna_hi_customer', 'shubh_hi_customer', 'ritu_hi_customer']
  },
  'te-IN': {
    default: 'kavitha_te_narration',
    valid: ['kavitha_te_narration']
  }
};

/**
 * Fallback deterministic explanation in case LLM is unreachable
 */
function getFallbackExplanation(question, context, lang) {
  const comp = context && context.title ? context.title : 'CMOS Inverter';
  const role = context && context.role ? context.role : 'performing complementary digital logic inversion.';
  const state = context && context.circuitState ? `In our current circuit state, the input is ${context.circuitState.in}, PMOS is ${context.circuitState.pmos}, NMOS is ${context.circuitState.nmos}, and Output is ${context.circuitState.out}.` : '';

  if (lang === 'hi-IN') {
    return `सीमॉस इन्वर्टर में प्रत्येक परत एक महत्वपूर्ण भौतिक समस्या को हल करती है। ${comp} का मुख्य कार्य ${role} वर्तमान स्थिति में, ${state}`;
  } else if (lang === 'te-IN') {
    return `సిమోస్ ఇన్వర్టర్‌లో ప్రతి పొర ఒక ముఖ్యమైన భౌతిక సమస్యను పరిష్కరిస్తుంది. ${comp} యొక్క ముఖ్య ఉద్దేశ్యం ${role} ప్రస్తుత స్థితిలో, ${state}`;
  } else {
    return `Every physical layer in this CMOS layout solves a critical electrical challenge. The ${comp} fulfills this requirement by ${role} ${state}`;
  }
}

/**
 * Generate student-friendly VLSI explanation via Sarvam LLM
 */
async function generateExplanation(question, context, langCode, apiKey) {
  const langName = langCode === 'hi-IN' ? 'Hindi (hi-IN)' : (langCode === 'te-IN' ? 'Telugu (te-IN)' : 'English (en-IN)');
  
  const systemPrompt = `You are an expert CMOS VLSI tutor and layout educator for an interactive 3D CMOS Inverter CAD viewer.
Never use a mechanical "Step 1, Step 2" or numbered list format. Instead, use a cohesive, engaging storytelling format.
Whenever explaining fabrication, layout, or components, always connect the physical or electrical problem ("the why", such as mechanical support, isolating polarities, preventing short-circuits or quantum leakage, supplying charge carriers, or routing signals) with the physical layer or component acting as the solution ("the what", exactly as it appears on screen).
Provide a crisp, clear, student-friendly explanation (2 to 3 concise spoken sentences, ~45-65 words) in ${langName} that directly answers the user's question using the provided component metadata, lambda design rules, and circuit state.
Never use markdown formatting, bold asterisks, bullet points, numbered lists, or awkward raw equations that sound unnatural when spoken aloud. Use natural conversational phrasing specifically crafted for voice speech synthesis in ${langName}.`;

  const ctxSummary = context ? [
    context.title ? `Selected Component: ${context.title}` : null,
    context.fn ? `Function: ${context.fn}` : null,
    context.role ? `Electrical Role: ${context.role}` : null,
    context.rel ? `Physical Relationship: ${context.rel}` : null,
    context.doping ? `Doping: ${context.doping}` : null,
    context.dimensions ? `Dimensions: ${typeof context.dimensions === 'string' ? context.dimensions : JSON.stringify(context.dimensions)}` : null,
    context.circuitState ? `Current Circuit State: IN=${context.circuitState.in}, PMOS=${context.circuitState.pmos}, NMOS=${context.circuitState.nmos}, OUT=${context.circuitState.out}` : null
  ].filter(Boolean).join('\n') : 'No specific component selected; full inverter layout.';

  const userPrompt = `Layout & Circuit Context:
${ctxSummary}

User Question: ${question || 'Explain the role and physics of this component in the CMOS inverter.'}`;

  if (!apiKey) {
    return getFallbackExplanation(question, context, langCode);
  }

  try {
    const chatRes = await fetch('https://api.sarvam.ai/v1/chat/completions', {
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
      })
    });

    if (chatRes.ok) {
      const data = await chatRes.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        let text = data.choices[0].message.content.trim();
        // Strip any residual markdown asterisks or quotes
        text = text.replace(/[*_#`]/g, '').replace(/\s+/g, ' ').trim();
        if (text.length > 5) return text;
      }
    } else {
      console.warn('Sarvam chat completion returned non-200:', chatRes.status, await chatRes.text());
    }
  } catch (err) {
    console.error('Sarvam chat completion fetch error:', err);
  }

  return getFallbackExplanation(question, context, langCode);
}

/**
 * Main Serverless Function Handler
 */
module.exports = async function handler(req, res) {
  // CORS Configuration
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, api-subscription-key');
  res.setHeader('Access-Control-Expose-Headers', 'X-Explanation-Text, X-Language-Code, X-Speaker, X-Audio-Model');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      service: 'CMOS Inverter CAD AI Voice Assistant',
      tts_model: 'bulbul:v4-flash',
      llm_model: 'sarvam-105b-conversations',
      supported_languages: ['en-IN', 'hi-IN', 'te-IN'],
      speakers: SPEAKER_MAP
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Parse body
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  } else if (!body) {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve({}); }
      });
    });
  }

  const userApiKey = req.headers['api-subscription-key'] || req.headers['x-sarvam-api-key'] || (body && body.api_key) || SARVAM_API_KEY;
  if (!userApiKey) {
    return res.status(401).json({
      error: 'Missing Sarvam API Key',
      message: 'Please provide a valid Sarvam AI API subscription key in localStorage or request headers.'
    });
  }

  const question = (body.question || '').trim();
  const context = body.context || {};
  let langCode = body.language_code || 'en-IN';
  if (!SPEAKER_MAP[langCode]) langCode = 'en-IN';

  let speaker = body.speaker;
  const langConfig = SPEAKER_MAP[langCode];
  if (!speaker || !langConfig.valid.includes(speaker)) {
    speaker = langConfig.default;
  }

  try {
    // 1. Generate text explanation from LLM
    const explanationText = await generateExplanation(question, context, langCode, userApiKey);

    // 2. Stream audio from Sarvam Bulbul v4 Flash
    const ttsRes = await fetch('https://api.sarvam.ai/text-to-speech/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': userApiKey
      },
      body: JSON.stringify({
        text: explanationText,
        model: 'bulbul:v4-flash',
        language_code: langCode,
        speaker: speaker,
        speech_sample_rate: 24000,
        output_audio_codec: 'wav',
        pace: 1.0,
        enable_preprocessing: true
      })
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.error('Sarvam TTS error:', ttsRes.status, errText);
      return res.status(ttsRes.status).json({
        error: 'Sarvam TTS streaming failed',
        details: errText,
        text: explanationText
      });
    }

    // 3. Set response headers so frontend gets transcript + metadata immediately
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Explanation-Text', encodeURIComponent(explanationText));
    res.setHeader('X-Language-Code', langCode);
    res.setHeader('X-Speaker', speaker);
    res.setHeader('X-Audio-Model', 'bulbul:v4-flash');

    // 4. Pipe streaming chunks to response
    const reader = ttsRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();

  } catch (err) {
    console.error('Voice assistant handler error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Voice assistant failed', message: err.message });
    }
    res.end();
  }
};
