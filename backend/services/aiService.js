const { GoogleGenerativeAI } = require('@google/generative-ai');
const { sanitizeInput } = require('../utils/sanitizer');

// Setup Google Gen AI if key is present
const geminiApiKey = process.env.GEMINI_API_KEY;
let genAI = null;

if (geminiApiKey) {
  try {
    genAI = new GoogleGenerativeAI(geminiApiKey);
  } catch (error) {
    console.error('Failed to initialize Google Gen AI:', error.message);
  }
}

// System Instruction for Swasthya AI Engine
const SYSTEM_INSTRUCTION = `
You are the vocal and visual cognitive engine for 'Swasthya' (स्वास्थ्य), a bidirectional face-to-face mental wellness companion for Indian competitive exam students (preparing for JEE, NEET, UPSC, CA, etc.).
You receive live voice-to-text data and your output must drive a real-time responsive 2D avatar and a multimedia suggestion UI.

Analysis Rules:
1. Read between the lines of short, exhausted, voice-transcribed inputs for underlying stress triggers.
2. Maintain absolute empathy; acknowledge the intense difficulty of Indian exams without minimizing them.
3. Provide brief, supportive spoken audio scripts synchronized with an avatar expression cue.
4. Immediately suggest one specific visual or audible exercise video/image relevant to their state.
5. Output STRICTLY as a JSON object matching the expected schema.

Expected JSON Schema:
{
  "emotional_analysis": "Internal assessment of their state (e.g., 'Panic Attack Imminent', 'General Burnout').",
  "avatar_motor_cue": "The visual state cue for the frontend avatar. Must be one of: 'empathetic_nod', 'concerned_listen', 'calm_breathing_motion', 'warm_smile', 'reassuring_look'.",
  "spoken_script": "The warm, conversational text to be spoken by the Text-to-Speech engine. No markdown, very conversational, in English with occasional Hindi words for warmth (like 'Beta', 'yaar', 'bilkul'). Keep it under 2-3 sentences.",
  "multimedia_suggestion": {
    "title": "Short, bold UI label (e.g., '1-MINUTE BOX BREATHING').",
    "type": "youtube_embed_id" | "calming_image_query" | "grounding_gif_url",
    "value": "The specific data value (e.g., YouTube video ID 'dIUTsTz8P1c', or a query string/URL). Use 'dIUTsTz8P1c' for box breathing, 'X3H188GgCgI' for grounding exercise, or standard calming queries/URLs.",
    "accessible_rationale": "Short explanation for screen readers on why this video helps (e.g., 'Guided exercise for anxiety')."
  }
}
`;

// A catalog of expert-designed mental wellness mock responses for Indian students when API keys are not provided
const MOCK_WELLNESS_CATALOG = [
  {
    triggers: ['exam', 'test', 'marks', 'fail', 'score', 'percentile', 'rank'],
    response: {
      emotional_analysis: 'Performance Anxiety / Fear of Failure',
      avatar_motor_cue: 'empathetic_nod',
      spoken_script: 'I hear you, beta. It is completely natural to feel overwhelmed when mock test scores do not match your hard work. JEE and NEET ranks do not define your worth. Let us take a short pause together.',
      multimedia_suggestion: {
        title: '5-MINUTE STRESS RELEASE',
        type: 'youtube_embed_id',
        value: 'X3H188GgCgI',
        accessible_rationale: 'Guided meditation to release exam stress and performance anxiety.'
      }
    }
  },
  {
    triggers: ['parents', 'family', 'expectation', 'disappoint', 'pressure', 'papa', 'mummy'],
    response: {
      emotional_analysis: 'External Pressure / Guilt Complex',
      avatar_motor_cue: 'reassuring_look',
      spoken_script: 'I understand how heavy the expectations of your parents can feel, yaar. You care deeply about them, and that is beautiful. But remember, they want you to be healthy and happy first. Let us take a breath.',
      multimedia_suggestion: {
        title: '1-MINUTE BOX BREATHING',
        type: 'youtube_embed_id',
        value: 'dIUTsTz8P1c',
        accessible_rationale: 'A simple breathing exercise to regulate the nervous system and calm anxiety.'
      }
    }
  },
  {
    triggers: ['tired', 'sleep', 'exhaust', 'burnout', 'study', 'hours', 'focus', 'concentrate'],
    response: {
      emotional_analysis: 'General Burnout / Fatigue',
      avatar_motor_cue: 'calm_breathing_motion',
      spoken_script: 'You have been pushing yourself so hard, bilkul exhaust ho gaye ho. Studying 12 hours a day without rest isn\'t productive. Your brain needs time to recover. Let us try a quick grounding exercise now.',
      multimedia_suggestion: {
        title: 'GROUNDING NATURE SCENE',
        type: 'calming_image_query',
        value: 'himalayan valley morning mist serene',
        accessible_rationale: 'High contrast tranquil image of a serene Himalayan valley to relax visual strain.'
      }
    }
  },
  {
    triggers: ['panic', 'scared', 'breath', 'shaking', 'heart', 'crying', 'anxious'],
    response: {
      emotional_analysis: 'Panic Attack Imminent / High Anxiety',
      avatar_motor_cue: 'calm_breathing_motion',
      spoken_script: 'I am right here with you. You are safe. Take a slow breath in... and let it out. Let us do the 5-4-3-2-1 grounding technique together to bring you back to the present moment.',
      multimedia_suggestion: {
        title: '5-4-3-2-1 GROUNDING TECHNIQUE',
        type: 'grounding_gif_url',
        value: 'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3k4d3c3MHF6dnpxNng1cmRxN2NmaDkxZmpxMWxtMTZ2d2k4czlhMiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/3o7TKoWXm3okO1kgdW/giphy.gif',
        accessible_rationale: 'An animated visual guide for the 5-4-3-2-1 sensory grounding exercise.'
      }
    }
  }
];

// Default fallback response if no match is found
const DEFAULT_MOCK_RESPONSE = {
  emotional_analysis: 'General Academic Stress',
  avatar_motor_cue: 'concerned_listen',
  spoken_script: 'I understand it is incredibly tough. Indian exams demand so much of your energy and time. Please know you are not alone in this journey. Let\'s do a quick breathing pause.',
  multimedia_suggestion: {
    title: '1-MINUTE BOX BREATHING',
    type: 'youtube_embed_id',
    value: 'dIUTsTz8P1c',
    accessible_rationale: 'Guided box breathing tutorial to reduce immediate stress.'
  }
};

/**
 * Generate ElevenLabs base64 audio block
 * @param {string} text - Text to synthesize
 * @returns {Promise<string|null>} Base64 audio string or null
 */
async function generateElevenLabsTTS(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return null;

  try {
    const voiceId = "pMs2tJ1xkHqT05M09A9g"; // Aditi Indian Female voice
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs API error response:', errText);
      return null;
    }

    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString('base64');
  } catch (error) {
    console.error('ElevenLabs request failed:', error.message);
    return null;
  }
}

/**
 * Invokes LLM or generates a structured wellness response.
 * 
 * @param {string} userMessage - User's voice transcription
 * @returns {Promise<object>} The structured wellness response matching expected schema
 */
async function generateWellnessResponse(userMessage) {
  const sanitizedText = sanitizeInput(userMessage);
  
  if (!sanitizedText) {
    return DEFAULT_MOCK_RESPONSE;
  }

  let resultJson = null;

  // 1. Try OpenRouter if key is present
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://swasthya.vercel.app",
          "X-Title": "Swasthya"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_INSTRUCTION },
            { role: "user", content: sanitizedText }
          ],
          response_format: { type: "json_object" }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0].message.content;
        resultJson = JSON.parse(content);
      } else {
        console.error('OpenRouter response failed:', await response.text());
      }
    } catch (err) {
      console.error('OpenRouter failed, attempting fallback:', err.message);
    }
  }

  // 2. If OpenRouter failed or not configured, fall back to native Gemini
  if (!resultJson && genAI) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        systemInstruction: SYSTEM_INSTRUCTION,
        generationConfig: {
          responseMimeType: 'application/json',
        }
      });
      const prompt = `User's voice transcription: "${sanitizedText}"`;
      const result = await model.generateContent(prompt);

      const responseText = result.response.text();
      resultJson = JSON.parse(responseText);
    } catch (err) {
      console.error('Error calling Gemini model, falling back to mock:', err.message);
    }
  }

  // 3. Fallback to local catalog if APIs are unavailable
  if (!resultJson) {
    const matched = MOCK_WELLNESS_CATALOG.find(item => 
      item.triggers.some(trigger => sanitizedText.toLowerCase().includes(trigger))
    );
    resultJson = matched ? { ...matched.response } : { ...DEFAULT_MOCK_RESPONSE };
  }

  // 4. Generate TTS audio via ElevenLabs if key is present
  if (resultJson && resultJson.spoken_script) {
    const audioBase64 = await generateElevenLabsTTS(resultJson.spoken_script);
    if (audioBase64) {
      resultJson.audio_base64 = audioBase64;
    }
  }

  return resultJson;
}

// Mock database for journal parsing fallbacks
const MOCK_JOURNAL_CATALOG = [
  {
    triggers: ['fail', 'test', 'marks', 'score', 'rank', 'low', 'percentile'],
    response: {
      mood: 'Anxious',
      stress_triggers: ['Mock Test Scores', 'Fear of Failure'],
      coping_strategy: 'Set aside grading sheets for the day. List down 3 topic areas where you missed questions, and make a plan to solve only 5 targeted problems in those areas tomorrow. Do not stress about ranks.',
      mindfulness_exercise: 'Do a 4-7-8 deep breathing pause: Inhale for 4 seconds, hold your breath for 7 seconds, exhale slowly making a whoosh sound for 8 seconds. Repeat 4 times.',
      encouragement: 'Beta, a mock test is just diagnostic feedback, not a final verdict on your intelligence. You have time to improve.',
      resource: {
        title: '5-MINUTE EXAM STRESS RELEASE',
        type: 'youtube_embed_id',
        value: 'X3H188GgCgI',
        accessible_rationale: 'Guided session specifically mapped to release physical stress and test panic.'
      }
    }
  },
  {
    triggers: ['parents', 'family', 'expectation', 'papa', 'mummy', 'expectations'],
    response: {
      mood: 'Stressed',
      stress_triggers: ['Parental Expectations', 'External Pressure'],
      coping_strategy: 'Acknowledge their hopes but set a mental boundary. Remember you are studying for your future. Take a 15-minute walk outside or listen to instrumental music to distance yourself from the expectations.',
      mindfulness_exercise: 'Do a 5-4-3-2-1 Sensory Grounding: Identify 5 things you can see, 4 things you can feel, 3 things you can hear, 2 things you can smell, and 1 thing you can taste in your study room.',
      encouragement: 'Carrying the dreams of your family is tough, yaar. But remember they want your well-being first. Keep going.',
      resource: {
        title: '1-MINUTE BOX BREATHING',
        type: 'youtube_embed_id',
        value: 'dIUTsTz8P1c',
        accessible_rationale: 'Box breathing guide to regulate hyperventilation and focus visual tracks.'
      }
    }
  },
  {
    triggers: ['tired', 'sleep', 'burnout', 'exhausted', 'study', 'focus', 'hours'],
    response: {
      mood: 'Burnt Out',
      stress_triggers: ['Study Overload', 'Physical Fatigue'],
      coping_strategy: 'Implement a strict Pomodoro limit: 25 minutes of focused study followed by 5 minutes of moving away from your desk. Stop studying after 9:00 PM today and prioritize getting 7.5 hours of sleep.',
      mindfulness_exercise: 'Do a Progressive Muscle Relaxation: Tense your shoulder muscles for 5 seconds, then release them completely. Feel the tension melt away. Repeat for your neck, arms, and legs.',
      encouragement: 'Studying continuously without rest causes cognitive overload, Beta. Sleep is as important as active reading. Take a nap.',
      resource: {
        title: 'SERENE VALLEY VISUALIZATION',
        type: 'calming_image_query',
        value: 'himalayan valley morning mist serene',
        accessible_rationale: 'High-contrast calm nature image of a Himalayan valley to relax visual strain.'
      }
    }
  }
];

const DEFAULT_JOURNAL_RESPONSE = {
  mood: 'Neutral',
  stress_triggers: ['General Academic Pressure'],
  coping_strategy: 'Maintain a consistent study routine with breaks every 45 minutes. Document small daily accomplishments in a journal.',
  mindfulness_exercise: 'Inhale deeply for 4 seconds, hold for 4 seconds, and exhale for 6 seconds. Repeat 5 times to reset your pulse.',
  encouragement: 'You are doing great on your academic prep. Take care of your mental well-being alongside your study goals.',
  resource: {
    title: '1-MINUTE BOX BREATHING',
    type: 'youtube_embed_id',
    value: 'dIUTsTz8P1c',
    accessible_rationale: 'Guided box breathing exercise.'
  }
};

/**
 * Analyzes journal entries to extract emotional patterns, triggers, and support messages.
 * 
 * @param {string} entryText - The daily journal transcription/text
 * @returns {Promise<object>} The parsed journal stats
 */
async function analyzeJournalEntry(entryText) {
  const sanitizedText = sanitizeInput(entryText);
  if (!sanitizedText) {
    return DEFAULT_JOURNAL_RESPONSE;
  }

  const journalPrompt = `
  Analyze this student's journal entry: "${sanitizedText}"
  
  Identify:
  1. The dominant mood (e.g. 'Anxious', 'Burnt Out', 'Hopeful', 'Stressed').
  2. A list of specific academic stress triggers (e.g. ['Mock Test Scores', 'Parental Expectations', 'Time Management']).
  3. A tailored step-by-step Coping Strategy.
  4. An adaptive Mindfulness Exercise.
  5. A warm, empathetic, personalized coping Encouragement.
  6. A suggested calming Grounding Resource (matching the structure below).
  
  Output STRICTLY as a JSON object matching this schema:
  {
    "mood": "mood name",
    "stress_triggers": ["trigger 1", "trigger 2"],
    "coping_strategy": "Tailored step-by-step strategy details",
    "mindfulness_exercise": "Mindfulness exercise details",
    "encouragement": "Warm motivational words under 2 sentences",
    "resource": {
      "title": "Bold UI label (e.g., '1-MINUTE BOX BREATHING')",
      "type": "youtube_embed_id" | "calming_image_query" | "grounding_gif_url",
      "value": "youtube video ID 'dIUTsTz8P1c' or image query string or GIF URL",
      "accessible_rationale": "Short explanation for screen readers on how this helps"
    }
  }
  `;

  // 1. Try OpenRouter
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: journalPrompt }],
          response_format: { type: "json_object" }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const content = data.choices[0].message.content;
        return JSON.parse(content);
      }
    } catch (err) {
      console.error('OpenRouter journal analysis failed, fallback to Gemini SDK:', err.message);
    }
  }

  // 2. Try Gemini SDK
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({
        model: 'gemini-1.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
        }
      });
      const result = await model.generateContent(journalPrompt);
      return JSON.parse(result.response.text());
    } catch (err) {
      console.error('Gemini SDK journal analysis failed, fallback to catalog:', err.message);
    }
  }

  // 3. Try catalog matching
  const matched = MOCK_JOURNAL_CATALOG.find(item =>
    item.triggers.some(trigger => sanitizedText.toLowerCase().includes(trigger))
  );

  return matched ? matched.response : DEFAULT_JOURNAL_RESPONSE;
}

module.exports = {
  generateWellnessResponse,
  analyzeJournalEntry,
  SYSTEM_INSTRUCTION
};
