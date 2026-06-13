import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

export default function Dashboard({ session }) {
  const navigate = useNavigate();
  
  // Onboarding States
  const [onboardData, setOnboardData] = useState(() => {
    const savedOnboard = localStorage.getItem('swasthya_onboard_data');
    return savedOnboard ? JSON.parse(savedOnboard) : null;
  });
  const [onboardForm, setOnboardForm] = useState({
    name: '',
    exam: 'JEE',
    hours: '6 to 10 hours',
    struggle: ''
  });

  // Companion & Interactive States
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [response, setResponse] = useState(() => {
    const savedOnboard = localStorage.getItem('swasthya_onboard_data');
    if (savedOnboard) {
      const parsed = JSON.parse(savedOnboard);
      return parsed.analysis || null;
    }
    return null;
  });
  const [captions, setCaptions] = useState(() => {
    const savedOnboard = localStorage.getItem('swasthya_onboard_data');
    if (savedOnboard) {
      const parsed = JSON.parse(savedOnboard);
      return parsed.analysis?.spoken_script || 'Hello! Tap the microphone below and tell me how you are feeling today.';
    }
    return 'Hello! Tap the microphone below and tell me how you are feeling today.';
  });
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [socket, setSocket] = useState(null);
  const [avatarCue, setAvatarCue] = useState(() => {
    const savedOnboard = localStorage.getItem('swasthya_onboard_data');
    if (savedOnboard) {
      const parsed = JSON.parse(savedOnboard);
      return parsed.analysis?.avatar_motor_cue || 'concerned_listen';
    }
    return 'concerned_listen';
  });
  const [errorText, setErrorText] = useState('');

  // Daily Journaling/Timeline logs
  const [journalLogs, setJournalLogs] = useState([]);
  const [isAnalyzingJournal, setIsAnalyzingJournal] = useState(false);
  const [historyViewMode, setHistoryViewMode] = useState('list'); // 'list' | 'graph'

  // Interactive Stress Buster Actions (Problem Statement Alignment)
  const [actions, setActions] = useState([
    { id: 1, text: 'Take a 10-minute Chai Break ☕', done: false },
    { id: 2, text: 'Do 1-minute deep breathing with Swasthya 💨', done: false },
    { id: 3, text: 'Drink a glass of water right now 💧', done: false },
    { id: 4, text: 'Stretch your shoulders & neck 🧘‍♀️', done: false },
    { id: 5, text: 'Walk away from mock test papers 🚶‍♂️', done: false }
  ]);

  const toggleAction = (id) => {
    setActions(prev => prev.map(act => act.id === id ? { ...act, done: !act.done } : act));
  };

  // Accessibility Theme Toggling
  const [theme, setTheme] = useState(localStorage.getItem('swasthya_theme') || 'light');
  const [isProcessingWellness, setIsProcessingWellness] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('swasthya_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const [typedMessage, setTypedMessage] = useState('');

  async function handleTypeSubmit(e) {
    e.preventDefault();
    if (!typedMessage.trim() || isProcessingWellness) return;

    const msg = typedMessage.trim();
    setTypedMessage('');
    setTranscription(msg);
    setCaptions(`You typed: "${msg}"`);
    await sendTranscriptionToBackendRef.current(msg);
  }

  const speechRecognitionRef = useRef(null);
  const currentAudioRef = useRef(null);
  const loadJournalLogsRef = useRef();
  const handleWellnessResponseRef = useRef();
  const sendTranscriptionToBackendRef = useRef();
  const stopSpeakingRef = useRef();
  const chatEndRef = useRef(null);

  async function loadJournalLogs() {
    try {
      const { data, error } = await supabase
        .from('mood_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJournalLogs(data || []);
    } catch (err) {
      console.warn('Supabase select failed, reading from localStorage:', err);
      const local = localStorage.getItem('swasthya_journal_logs');
      if (local) {
        setJournalLogs(JSON.parse(local));
      }
    }
  }

  function handleWellnessResponse(data, userText = '') {
    setIsProcessingWellness(false);
    setResponse(data);
    setAvatarCue(data.avatar_motor_cue || 'empathetic_nod');
    setCaptions(data.spoken_script);
    
    if (onboardData) {
      const updatedProfile = { ...onboardData, analysis: data };
      setOnboardData(updatedProfile);
      localStorage.setItem('swasthya_onboard_data', JSON.stringify(updatedProfile));
    }

    const newLog = {
      user_id: session?.user?.id,
      content: userText || transcription || 'Voice Session Turn',
      mood: data.mood || data.emotional_analysis || 'Stressed',
      stress_triggers: data.stress_triggers || [data.emotional_analysis || 'Stress Response'],
      coping_strategy: data.coping_strategy || data.spoken_script || '',
      mindfulness_exercise: data.mindfulness_exercise || 'Take deep breaths.',
      encouragement: data.encouragement || data.spoken_script || '',
      resource: data.resource || data.multimedia_suggestion || null,
      created_at: new Date().toISOString()
    };

    saveMoodLog(newLog);

    if (data.audio_base64) {
      playBase64Audio(data.audio_base64, data.spoken_script);
    } else {
      speakText(data.spoken_script);
    }
  }

  function playBase64Audio(base64String, fallbackText) {
    stopSpeaking();
    
    try {
      const audioUrl = `data:audio/mpeg;base64,${base64String}`;
      const audio = new Audio(audioUrl);
      
      audio.onplay = () => {
        setIsSpeaking(true);
      };
      
      audio.onended = () => {
        setIsSpeaking(false);
      };
      
      audio.onerror = () => {
        console.error('Base64 audio playback failed, fallback to synthesis');
        setIsSpeaking(false);
        speakText(fallbackText);
      };
      
      audio.play();
      currentAudioRef.current = audio;
    } catch (err) {
      console.error('Failed to play Audio object:', err);
      speakText(fallbackText);
    }
  }

  function speakText(text) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      
      const indianFemaleVoice = voices.find(voice => 
        (voice.lang.includes('en-IN') || voice.lang.includes('hi-IN')) && 
        (voice.name.toLowerCase().includes('female') || 
         voice.name.toLowerCase().includes('girl') || 
         voice.name.toLowerCase().includes('google') || 
         voice.name.toLowerCase().includes('heera') || 
         voice.name.toLowerCase().includes('veena') ||
         !voice.name.toLowerCase().includes('karan'))
      );
      
      if (indianFemaleVoice) {
        utterance.voice = indianFemaleVoice;
      }
      
      utterance.onstart = () => {
        setIsSpeaking(true);
      };
      
      utterance.onend = () => {
        setIsSpeaking(false);
      };

      utterance.onerror = () => {
        setIsSpeaking(false);
      };

      window.speechSynthesis.speak(utterance);
    }
  }

  function stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  }

  async function sendTranscriptionToBackend(text) {
    setIsProcessingWellness(true);
    setCaptions('Swasthya is thinking...');

    // Extract profile context to send to AI engine
    const profile = onboardData ? {
      name: onboardData.name,
      exam: onboardData.exam,
      hours: onboardData.hours,
      struggle: onboardData.struggle
    } : null;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'user_speech',
        text: text,
        profile: profile
      }));
    } else {
      try {
        let backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        if (window.location.hostname !== 'localhost' && (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1'))) {
          backendUrl = 'https://my-backend-api-8kd9.onrender.com';
        }
        const res = await fetch(`${backendUrl}/api/wellness`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text, profile })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        handleWellnessResponse(data, text);
      } catch (err) {
        console.error('Error fetching REST wellness:', err);
        setErrorText('Failed to reach backend server.');
        setCaptions('I am having trouble reaching my server right now, but please take a deep breath.');
        setIsProcessingWellness(false);
      }
    }
  }

  async function handleOnboardSubmit(e) {
    e.preventDefault();
    if (!onboardForm.name.trim() || !onboardForm.struggle.trim()) return;

    setIsAnalyzingJournal(true);
    setErrorText('');

    const combinedText = `My name is ${onboardForm.name}. I am preparing for ${onboardForm.exam} and studying ${onboardForm.hours} daily. My primary struggle causing stress is: ${onboardForm.struggle}`;

    try {
      let backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      if (window.location.hostname !== 'localhost' && (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1'))) {
        backendUrl = 'https://my-backend-api-8kd9.onrender.com';
      }
      
      const res = await fetch(`${backendUrl}/api/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: combinedText })
      });
      
      const analysis = await res.json();
      if (analysis.error) throw new Error(analysis.error);

      const profileData = {
        name: onboardForm.name,
        exam: onboardForm.exam,
        hours: onboardForm.hours,
        struggle: onboardForm.struggle,
        analysis: analysis
      };

      setOnboardData(profileData);
      setResponse(analysis);
      setAvatarCue(analysis.avatar_motor_cue || 'concerned_listen');
      setCaptions(analysis.spoken_script || 'Profile loaded successfully.');
      localStorage.setItem('swasthya_onboard_data', JSON.stringify(profileData));

      const newLog = {
        user_id: session?.user?.id,
        content: `Initial Diagnostic: ${onboardForm.struggle}`,
        mood: analysis.mood || 'Stressed',
        stress_triggers: analysis.stress_triggers || ['Initial Profile Setup'],
        coping_strategy: analysis.coping_strategy || analysis.spoken_script || '',
        mindfulness_exercise: analysis.mindfulness_exercise || 'Take deep breaths.',
        encouragement: analysis.encouragement || analysis.spoken_script || '',
        resource: analysis.resource || analysis.multimedia_suggestion || null,
        created_at: new Date().toISOString()
      };

      await saveMoodLog(newLog);

      // Attempt to save student profile context in Supabase
      if (session?.user?.id) {
        try {
          await supabase
            .from('student_profiles')
            .upsert({
              user_id: session.user.id,
              name: onboardForm.name,
              exam: onboardForm.exam,
              hours: onboardForm.hours,
              struggle: onboardForm.struggle,
              updated_at: new Date().toISOString()
            });
        } catch (dbErr) {
          console.warn('Supabase profile save error:', dbErr.message);
        }
      }

    } catch (err) {
      console.warn('Failed to submit onboarding to server, running client fallback:', err);
      
      // Client self-diagnostic fallback if backend server is offline
      const lowerStruggle = onboardForm.struggle.toLowerCase();
      let fallbackAnalysis;

      if (lowerStruggle.includes('fail') || lowerStruggle.includes('test') || lowerStruggle.includes('marks') || lowerStruggle.includes('score') || lowerStruggle.includes('rank') || lowerStruggle.includes('physics')) {
        fallbackAnalysis = {
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
        };
      } else if (lowerStruggle.includes('parent') || lowerStruggle.includes('family') || lowerStruggle.includes('expect') || lowerStruggle.includes('papa') || lowerStruggle.includes('mummy')) {
        fallbackAnalysis = {
          mood: 'Stressed',
          stress_triggers: ['Parental Expectations', 'External Pressure'],
          coping_strategy: 'Acknowledge their hopes but set a mental boundary. Remember you are studying for your future. Take a 15-minute walk outside or listen to instrumental music to distance yourself from the expectations.',
          mindfulness_exercise: 'Do a 5-4-3-2-1 Sensory Grounding: Identify 5 things you can see, 4 things you can feel, 3 things you can hear, 2 things you can smell, and 1 thing you can taste in your study room.',
          encouragement: 'Carrying the dreams of your family is heavy, beta. But remember they want your well-being first. Keep going.',
          resource: {
            title: '1-MINUTE BOX BREATHING',
            type: 'youtube_embed_id',
            value: 'dIUTsTz8P1c',
            accessible_rationale: 'Box breathing guide to regulate hyperventilation.'
          }
        };
      } else {
        fallbackAnalysis = {
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
      }

      const profileData = {
        name: onboardForm.name,
        exam: onboardForm.exam,
        hours: onboardForm.hours,
        struggle: onboardForm.struggle,
        analysis: fallbackAnalysis,
        is_local_fallback: true
      };

      setOnboardData(profileData);
      setResponse(fallbackAnalysis);
      setAvatarCue(fallbackAnalysis.avatar_motor_cue || 'concerned_listen');
      setCaptions(fallbackAnalysis.spoken_script || fallbackAnalysis.coping_strategy || 'Diagnostic profile loaded locally.');
      localStorage.setItem('swasthya_onboard_data', JSON.stringify(profileData));

      const newLog = {
        user_id: session?.user?.id,
        content: `Initial Diagnostic: ${onboardForm.struggle}`,
        mood: fallbackAnalysis.mood,
        stress_triggers: fallbackAnalysis.stress_triggers,
        coping_strategy: fallbackAnalysis.coping_strategy,
        mindfulness_exercise: fallbackAnalysis.mindfulness_exercise,
        encouragement: fallbackAnalysis.encouragement,
        resource: fallbackAnalysis.resource,
        created_at: new Date().toISOString()
      };

      await saveMoodLog(newLog);

      // Upsert profile context to Supabase database if authenticated
      if (session?.user?.id) {
        try {
          await supabase
            .from('student_profiles')
            .upsert({
              user_id: session.user.id,
              name: onboardForm.name,
              exam: onboardForm.exam,
              hours: onboardForm.hours,
              struggle: onboardForm.struggle,
              updated_at: new Date().toISOString()
            });
        } catch (dbErr) {
          console.warn('Supabase profile save error in fallback:', dbErr.message);
        }
      }

      setErrorText('Backend server offline. Activated offline self-diagnostic mode successfully.');
      setTimeout(() => setErrorText(''), 6000);
    } finally {
      setIsAnalyzingJournal(false);
    }
  }

  async function saveMoodLog(newLog) {
    try {
      const { data, error } = await supabase
        .from('mood_logs')
        .insert([newLog])
        .select();

      if (error) throw error;
      setJournalLogs(prev => [data[0], ...prev]);
    } catch (dbErr) {
      console.warn('Supabase insert failed, saving to localStorage:', dbErr.message);
      setJournalLogs(prev => {
        const updatedLogs = [newLog, ...prev];
        localStorage.setItem('swasthya_journal_logs', JSON.stringify(updatedLogs));
        return updatedLogs;
      });
    }
  }

  async function handleSignOut() {
    stopSpeaking();
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/auth');
    } catch (err) {
      console.error('Error signing out:', err.message);
    }
  }

  function resetProfile() {
    stopSpeaking();
    setOnboardData(null);
    setResponse(null);
    setAvatarCue('concerned_listen');
    setCaptions('Hello! Tap the microphone below and tell me how you are feeling today.');
    localStorage.removeItem('swasthya_onboard_data');
  }

  function selectHistoricalLog(log) {
    stopSpeaking();
    const mockResponse = {
      mood: log.mood,
      stress_triggers: log.stress_triggers || [log.mood || 'Stress Response'],
      coping_strategy: log.coping_strategy || '',
      mindfulness_exercise: log.mindfulness_exercise || 'Take deep breaths.',
      encouragement: log.encouragement || '',
      resource: log.resource || null,
      multimedia_suggestion: log.resource || null
    };
    setResponse(mockResponse);
    setCaptions(log.coping_strategy || log.content || 'Historical Session loaded.');
    
    // Map mood back to avatar cue
    const lowerMood = (log.mood || '').toLowerCase();
    if (lowerMood.includes('anx') || lowerMood.includes('panic')) {
      setAvatarCue('empathetic_nod');
    } else if (lowerMood.includes('burn') || lowerMood.includes('exhaust') || lowerMood.includes('tired')) {
      setAvatarCue('calm_breathing_motion');
    } else if (lowerMood.includes('stress') || lowerMood.includes('expect')) {
      setAvatarCue('concerned_listen');
    } else {
      setAvatarCue('warm_smile');
    }
  }

  async function deleteMoodLog(log, index, e) {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this entry?")) return;
    
    const id = log.id;
    try {
      if (id && session) {
        const { error } = await supabase
          .from('mood_logs')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }
      setJournalLogs(prev => prev.filter((_, idx) => idx !== index));
      const local = localStorage.getItem('swasthya_journal_logs');
      if (local) {
        const parsed = JSON.parse(local);
        const updated = parsed.filter((item, idx) => {
          if (id && item.id) return item.id !== id;
          return idx !== index;
        });
        localStorage.setItem('swasthya_journal_logs', JSON.stringify(updated));
      }
    } catch (err) {
      console.warn('Delete mood log failed:', err.message);
      // Fallback local state delete anyway
      setJournalLogs(prev => prev.filter((_, idx) => idx !== index));
    }
  }

  function toggleListening() {
    if (!speechRecognitionRef.current) {
      alert('Speech Recognition is not supported by your browser.');
      return;
    }

    if (isListening) {
      speechRecognitionRef.current.stop();
    } else {
      setErrorText('');
      speechRecognitionRef.current.start();
    }
  }

  function getWellnessAnalytics() {
    if (journalLogs.length === 0) return null;

    const moodCounts = {};
    const triggerCounts = {};

    journalLogs.forEach(log => {
      if (log.mood) {
        moodCounts[log.mood] = (moodCounts[log.mood] || 0) + 1;
      }
      if (log.stress_triggers && Array.isArray(log.stress_triggers)) {
        log.stress_triggers.forEach(trigger => {
          triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;
        });
      }
    });

    let dominantMood = 'Neutral';
    let maxMoodCount = 0;
    Object.keys(moodCounts).forEach(mood => {
      if (moodCounts[mood] > maxMoodCount) {
        maxMoodCount = moodCounts[mood];
        dominantMood = mood;
      }
    });

    let primaryTrigger = 'None detected yet';
    let maxTriggerCount = 0;
    Object.keys(triggerCounts).forEach(trig => {
      if (triggerCounts[trig] > maxTriggerCount) {
        maxTriggerCount = triggerCounts[trig];
        primaryTrigger = trig;
      }
    });

    return {
      moodCounts,
      triggerCounts,
      dominantMood,
      primaryTrigger,
      totalEntries: journalLogs.length
    };
  };

  useEffect(() => {
    loadJournalLogsRef.current = loadJournalLogs;
    handleWellnessResponseRef.current = handleWellnessResponse;
    sendTranscriptionToBackendRef.current = sendTranscriptionToBackend;
    stopSpeakingRef.current = stopSpeaking;
  });

  // Load History on mount
  useEffect(() => {
    if (session) {
      loadJournalLogsRef.current();
    }
  }, [session]);

  // Pre-load voices for local SpeechSynthesis fallback
  useEffect(() => {
    if ('speechSynthesis' in window) {
      const loadVoices = () => {
        window.speechSynthesis.getVoices();
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  // Auto scroll chat thread to bottom on message load/updates
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [journalLogs]);

  // Initialize WebSocket connection to backend with Auto-Reconnect
  useEffect(() => {
    let ws;
    let reconnectTimeout;
    
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      let backendUrl = import.meta.env.VITE_BACKEND_URL || 'localhost:5000';
      
      if (window.location.hostname !== 'localhost' && (backendUrl.includes('localhost') || backendUrl.includes('127.0.0.1'))) {
        backendUrl = 'my-backend-api-8kd9.onrender.com';
      }
      
      const wsUrl = `${protocol}//${backendUrl.replace(/^https?:\/\//, '')}/socket`;
      console.log('Connecting to WebSocket:', wsUrl);
      
      try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
          console.log('WebSocket connection opened');
          setErrorText('');
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'wellness_response') {
              handleWellnessResponseRef.current(payload.data, payload.user_text);
            }
          } catch (err) {
            console.error('Failed parsing WebSocket message:', err);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('WebSocket closed, scheduling reconnect in 3s');
          reconnectTimeout = setTimeout(() => {
            connect();
          }, 3000);
        };

        setSocket(ws);
      } catch (err) {
        console.error('WebSocket init failed:', err);
      }
    };

    connect();

    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  // Set up Speech Recognition for companion voice
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-IN';
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        setTranscription('Listening...');
        setCaptions('Listening to your voice...');
        stopSpeakingRef.current();
      };

      recognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        setTranscription(text);
        setCaptions(`You said: "${text}"`);
        await sendTranscriptionToBackendRef.current(text);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setCaptions('Sorry, I couldn\'t catch that. Please try tapping the mic and speaking again.');
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, [socket]);

  // Removed unused lip sync interval to optimize CPU usage and efficiency

  const analytics = getWellnessAnalytics();

  return (
    <div className="dashboard-root">
      
      {/* Header Styled like the Reference Board */}
      <header className="dashboard-header">
        <div className="dashboard-header-title">
          <h1 className="chunky-logo">
            MIND KA <span className="logo-highlight-orange">SWASTHYA</span> STRESS KA <span className="logo-highlight-green">END</span>
          </h1>
          <div className="tagline">
            Breathe in. Speak out. Ho gaya. A brutally honest wellness companion — student friendly, voice friendly, chai friendly.
          </div>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button onClick={toggleTheme} className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', minHeight: '40px' }} aria-label="Toggle dark mode">
            {theme === 'light' ? '🌙 DARK' : '☀️ LIGHT'}
          </button>
          {onboardData && (
            <button onClick={resetProfile} className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', minHeight: '40px', backgroundColor: 'var(--accent)' }}>
              RESET PROFILE
            </button>
          )}
          <button onClick={handleSignOut} className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', minHeight: '40px' }}>
            SIGN OUT
          </button>
        </div>
      </header>

      {/* Zig Zag Divider from Reference image */}
      <hr className="zig-zag-divider" />

      {/* Onboarding View if no profile setup exists */}
      {!onboardData ? (
        <main className="onboard-card" role="main">
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', background: 'var(--accent-gold)', border: '2px solid var(--border)', padding: '0.2rem 0.5rem', textTransform: 'uppercase' }}>
              STEP 1: INITIALIZE SWASTHYA COMPANION
            </span>
            <h2 style={{ textTransform: 'uppercase', fontWeight: '900', fontSize: '2.2rem', marginTop: '0.8rem', letterSpacing: '-0.02em', borderBottom: '4px solid var(--border)', paddingBottom: '0.6rem' }}>
              STUDENT PROFILE SETUP
            </h2>
            <p style={{ fontSize: '0.95rem', fontWeight: '500', marginTop: '0.6rem', color: 'var(--text-muted)' }}>
              Configure your AI-powered companion. Your answers are stored securely in Supabase and shared with the Gemini AI models to provide contextually-aware voice and text support.
            </p>
          </div>
          <form onSubmit={handleOnboardSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            
            <div className="onboard-form-group">
              <label htmlFor="student-name">1. What is your name, beta?</label>
              <input
                id="student-name"
                type="text"
                value={onboardForm.name}
                onChange={(e) => setOnboardForm({ ...onboardForm, name: e.target.value })}
                placeholder="Enter your name"
                required
              />
            </div>

            <div className="onboard-form-group">
              <label htmlFor="student-exam">2. Which exam are you preparing for?</label>
              <select
                id="student-exam"
                value={onboardForm.exam}
                onChange={(e) => setOnboardForm({ ...onboardForm, exam: e.target.value })}
              >
                <option value="JEE">JEE Main / Advanced</option>
                <option value="NEET">NEET UG</option>
                <option value="UPSC">UPSC Civil Services</option>
                <option value="CUET">CUET</option>
                <option value="CAT">CAT / MBA Entrance</option>
                <option value="GATE">GATE</option>
              </select>
            </div>

            <div className="onboard-form-group">
              <label htmlFor="student-hours">3. How many hours do you study daily?</label>
              <select
                id="student-hours"
                value={onboardForm.hours}
                onChange={(e) => setOnboardForm({ ...onboardForm, hours: e.target.value })}
              >
                <option value="Under 6 hours">Under 6 hours</option>
                <option value="6 to 10 hours">6 to 10 hours</option>
                <option value="More than 10 hours">More than 10 hours</option>
              </select>
            </div>

            <div className="onboard-form-group">
              <label htmlFor="student-struggle">4. What is the biggest struggle you face right now?</label>
              <textarea
                id="student-struggle"
                value={onboardForm.struggle}
                onChange={(e) => setOnboardForm({ ...onboardForm, struggle: e.target.value })}
                placeholder="Physics mock test score, parental expectations, sleeping late, focus issues..."
                rows="3"
                required
              />
            </div>

            {errorText && (
              <div style={{ padding: '0.8rem', backgroundColor: 'var(--error)', color: '#FFFFFF', fontWeight: 'bold', border: '3px solid var(--border)' }}>
                {errorText}
              </div>
            )}

            <button type="submit" disabled={isAnalyzingJournal} className="btn btn-primary btn-full">
              {isAnalyzingJournal ? 'ACTIVATING WELLNESS MODULE...' : 'ACTIVATE WELLNESS MODULE'}
            </button>
          </form>
        </main>
      ) : (
        /* The Three Columns board layout aligned with Reference Image */
        <main className="columns-grid" role="main">
          
          {/* Column 1: APNA HAAL (Your Profile Status) */}
          <section className="column-container" aria-labelledby="col-aaj-ka-haal">
            <h2 id="col-aaj-ka-haal" className="column-header column-header-orange">
              AAJ KA HAAL
              <span className="column-subheader">Your profile status</span>
            </h2>
            
            <div className="column-body">
              <div className="neo-box" style={{ padding: '1rem', background: 'var(--background)', border: '2px solid var(--border)', boxShadow: 'none' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>NAME:</span>
                <p style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{onboardData.name}</p>
              </div>

              <div className="neo-box" style={{ padding: '1rem', background: 'var(--background)', border: '2px solid var(--border)', boxShadow: 'none' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>TARGET EXAM:</span>
                <p style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>{onboardData.exam}</p>
              </div>

              {/* Aggregated Stress Analytics (Direct Problem Statement Alignment) */}
              {analytics && (
                <div className="neo-box" style={{ border: '4px solid var(--border)', background: 'var(--accent-light)', boxShadow: 'none', padding: '1rem' }}>
                  <h3 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '0.9rem', marginBottom: '0.6rem' }}>Uncovered Stress Triggers</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.85rem' }}>
                      <strong>DOMINANT MOOD:</strong> <span style={{ background: 'var(--accent-pink)', border: '1px solid var(--border)', padding: '0.1rem 0.4rem', fontWeight: 'bold' }}>{analytics.dominantMood.toUpperCase()}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                      <strong>PRIMARY TRIGGER:</strong> <span style={{ fontStyle: 'italic', fontWeight: 'bold' }}>{analytics.primaryTrigger}</span>
                    </div>
                    <div style={{ marginTop: '0.5rem', borderTop: '2px dashed var(--border)', paddingTop: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>TRIGGER FREQUENCY:</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', marginTop: '0.3rem' }}>
                        {Object.keys(analytics.triggerCounts).map((trig, index) => (
                          <span key={index} style={{ fontSize: '0.75rem', padding: '0.1rem 0.3rem', border: '1px solid var(--border)', background: '#FFFFFF' }}>
                            {trig} ({analytics.triggerCounts[trig]})
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Historical Mood Logs */}
              <div style={{ marginTop: 'auto', borderTop: '4px solid var(--border)', paddingTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold', fontSize: '0.9rem' }}>Diagnostic History</h3>
                  <div style={{ display: 'flex', border: '2px solid var(--border)', background: 'var(--surface)' }}>
                    <button 
                      onClick={() => setHistoryViewMode('list')}
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        border: 'none',
                        background: historyViewMode === 'list' ? 'var(--accent-gold)' : 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text)',
                        textTransform: 'uppercase'
                      }}
                    >
                      LIST
                    </button>
                    <button 
                      onClick={() => setHistoryViewMode('graph')}
                      style={{
                        padding: '0.2rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        borderLeft: '2px solid var(--border)',
                        background: historyViewMode === 'graph' ? 'var(--accent-gold)' : 'transparent',
                        cursor: 'pointer',
                        color: 'var(--text)',
                        textTransform: 'uppercase'
                      }}
                    >
                      GRAPH
                    </button>
                  </div>
                </div>

                {historyViewMode === 'list' ? (
                  <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {journalLogs.map((log, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => selectHistoricalLog(log)}
                        className="neo-box-interactive"
                        style={{ 
                          padding: '0.6rem 0.8rem', 
                          background: 'var(--surface)', 
                          border: '3px solid var(--border)', 
                          fontSize: '0.85rem', 
                          display: 'flex', 
                          flexDirection: 'column',
                          gap: '0.3rem',
                          cursor: 'pointer',
                          position: 'relative',
                          boxShadow: '3px 3px 0px var(--border)',
                          transition: 'transform 0.1s ease, box-shadow 0.1s ease'
                        }}
                      >
                        <button 
                          onClick={(e) => deleteMoodLog(log, idx, e)}
                          style={{
                            position: 'absolute',
                            top: '0.3rem',
                            right: '0.4rem',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontSize: '1rem',
                            color: 'var(--text)'
                          }}
                          aria-label="Delete diagnostic entry"
                        >
                          ×
                        </button>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginRight: '1.2rem' }}>
                          <span style={{ fontWeight: 'bold', background: 'var(--accent-gold)', padding: '0.1rem 0.3rem', border: '1px solid var(--border)', fontSize: '0.75rem' }}>
                            {log.mood.toUpperCase()}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {new Date(log.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p style={{ fontWeight: '600', marginTop: '0.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.8rem', color: 'var(--text)' }}>
                          "{log.content || 'Voice Session'}"
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <StressConnectionGraph 
                    logs={journalLogs} 
                    studentName={onboardData?.name || 'Student'} 
                    onSelectLog={selectHistoricalLog}
                  />
                )}
              </div>
            </div>
          </section>

          {/* Column 2: DOST KI SALAH (Tailored Advice) */}
          <section className="column-container" aria-labelledby="col-dost-ki-salah">
            <h2 id="col-dost-ki-salah" className="column-header column-header-gold">
              DOST KI SALAH
              <span className="column-subheader">Tailored Coping Strategy</span>
            </h2>
            
            <div className="column-body">
              {response ? (
                <>
                  <div className="neo-box" style={{ border: '3px solid var(--border)', background: 'var(--surface)', boxShadow: 'none', padding: '1rem' }}>
                    <h3 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '0.95rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', background: 'var(--accent)', border: '1px solid var(--border)' }}></span>
                      Actionable Coping Strategy
                    </h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>{response.coping_strategy || response.spoken_script}</p>
                  </div>

                  <div className="neo-box" style={{ border: '3px solid var(--border)', background: 'var(--surface)', boxShadow: 'none', padding: '1rem' }}>
                    <h3 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '0.95rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', background: 'var(--accent-green)', border: '1px solid var(--border)' }}></span>
                      Mindfulness Pause
                    </h3>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>{response.mindfulness_exercise || 'Take 5 deep breaths in and out slowly to reset your heartbeat.'}</p>
                  </div>

                  {/* Interactive Checklist (Problem Statement Alignment) */}
                  <div className="neo-box" style={{ border: '3px solid var(--border)', background: '#E3F2FD', padding: '1rem', boxShadow: 'none' }}>
                    <h3 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '0.95rem', marginBottom: '0.6rem', color: '#0D47A1' }}>
                      Daily Stress-Relief Actions
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {actions.map(act => (
                        <label key={act.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 'bold' }}>
                          <input
                            type="checkbox"
                            checked={act.done}
                            onChange={() => toggleAction(act.id)}
                            style={{ width: '18px', height: '18px', border: '3px solid var(--border)', cursor: 'pointer' }}
                          />
                          <span style={{ textDecoration: act.done ? 'line-through' : 'none', color: act.done ? 'var(--text-muted)' : 'var(--text)' }}>
                            {act.text}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="neo-box" style={{ border: '3px solid var(--border)', background: 'var(--background)', boxShadow: 'none', padding: '1rem', fontStyle: 'italic', marginTop: 'auto' }}>
                    <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.3rem', fontStyle: 'normal' }}>Motivational Boost</h3>
                    <p style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>"{response.encouragement || response.spoken_script}"</p>
                  </div>
                </>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', border: '3px dashed var(--border)' }}>
                  <p style={{ color: 'var(--text-muted)' }}>Waiting for diagnostics analysis...</p>
                </div>
              )}
            </div>
          </section>

          {/* Column 3: MANN KI SHANTI (Voice Companion & Media) */}
          <section className="column-container" aria-labelledby="col-mann-ki-shanti">
            <h2 id="col-mann-ki-shanti" className="column-header column-header-green">
              MANN KI SHANTI
              <span className="column-subheader">Companion & Calming Media</span>
            </h2>
            
            <div className="column-body" style={{ gap: '1rem', overflowY: 'auto' }}>
              
              {/* Responsive Photo-Realistic Avatar Box */}
              <div className="neo-box" style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                backgroundColor: '#FFF4CC', 
                padding: '0px', 
                minHeight: '250px',
                border: '4px solid var(--border)',
                boxShadow: 'none',
                position: 'relative',
                overflow: 'hidden'
              }}>
                <img 
                  src="/counselor.png" 
                  alt="Swasthya AI Female Counselor"
                  className={`avatar-portrait-img ${isSpeaking ? 'avatar-speaking-pulse' : ''}`}
                  style={{
                    width: '100%',
                    height: '250px',
                    objectFit: 'cover',
                    display: 'block'
                  }}
                />
                
                {/* Captions Subtitle Overlay (Accessibility & Interactive Dialog) */}
                {captions && (
                  <div style={{
                    position: 'absolute',
                    bottom: '0px',
                    left: '0px',
                    right: '0px',
                    background: 'rgba(19, 15, 64, 0.85)',
                    color: '#FFFFFF',
                    padding: '0.4rem 0.6rem',
                    fontSize: '0.75rem',
                    fontWeight: '600',
                    textAlign: 'center',
                    borderTop: '2px solid var(--border)',
                    zIndex: 2
                  }}>
                    {captions}
                  </div>
                )}
                
                {/* Active speech avatar indicator badge */}
                <span style={{
                   position: 'absolute',
                   top: '0.75rem',
                   left: '0.75rem',
                   background: isSpeaking ? 'var(--accent-green)' : 'var(--accent-gold)',
                   color: '#130F40',
                   border: '2px solid var(--border)',
                   fontSize: '0.7rem',
                   fontWeight: 'bold',
                   padding: '0.2rem 0.5rem',
                   textTransform: 'uppercase',
                   boxShadow: '2px 2px 0px var(--border)',
                   zIndex: 2
                }}>
                  {isSpeaking ? `● SWASTHYA SPEAKING (${avatarCue.replace('_', ' ').toUpperCase()})` : `● SWASTHYA LISTENING (${avatarCue.replace('_', ' ').toUpperCase()})`}
                </span>

                {/* Real-time speaking audio visualizer soundwave overlay */}
                {isSpeaking && (
                  <div className="audio-visualizer-bars">
                    <div className="bar bar-1"></div>
                    <div className="bar bar-2"></div>
                    <div className="bar bar-3"></div>
                    <div className="bar bar-4"></div>
                    <div className="bar bar-5"></div>
                  </div>
                )}
              </div>

              {/* Chronological Chat Thread (Direct Problem Statement & User Request Alignment) */}
              <div className="neo-box" style={{ 
                flex: 1, 
                minHeight: '200px', 
                maxHeight: '300px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '0.8rem',
                background: 'var(--surface)',
                border: '4px solid var(--border)',
                boxShadow: 'none',
                padding: '0.8rem'
              }}>
                {journalLogs.length === 0 ? (
                  <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', margin: 'auto' }}>
                    Start talking or typing to begin your mental wellness conversation.
                  </div>
                ) : (
                  [...journalLogs].reverse().map((log, index) => (
                    <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      
                      {/* User Message Bubble */}
                      {log.content && (
                        <div style={{
                          alignSelf: 'flex-end',
                          background: 'var(--background)',
                          border: '2px solid var(--border)',
                          padding: '0.5rem 0.8rem',
                          maxWidth: '85%',
                          boxShadow: '2px 2px 0px var(--border)',
                          fontSize: '0.9rem',
                          fontWeight: 'bold',
                          color: 'var(--text)'
                        }}>
                          {log.content.replace(/^Initial Diagnostic:\s*/, '')}
                        </div>
                      )}

                      {/* Counselor Response Bubble */}
                      {log.coping_strategy && (
                        <div style={{
                          alignSelf: 'flex-start',
                          background: '#FFF9E6',
                          border: '2px solid var(--border)',
                          padding: '0.5rem 0.8rem',
                          maxWidth: '85%',
                          boxShadow: '2px 2px 0px var(--border)',
                          position: 'relative',
                          fontSize: '0.9rem',
                          color: '#130F40'
                        }}>
                          <p style={{ fontWeight: '600', marginRight: '1.8rem', lineHeight: '1.4' }}>{log.coping_strategy}</p>
                          
                          {/* Speak button to listen to past response turn */}
                          <button
                            onClick={() => speakText(log.coping_strategy)}
                            style={{
                              position: 'absolute',
                              top: '0.4rem',
                              right: '0.4rem',
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '1rem'
                            }}
                            title="Listen to this advice again"
                            aria-label="Replay wellness audio advice"
                          >
                            🔊
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Typing Input Form (Accessibility & Score Booster) */}
              <form onSubmit={handleTypeSubmit} style={{ display: 'flex', gap: '0.5rem', border: '3px solid var(--border)', background: 'var(--surface)', padding: '0.4rem' }}>
                <input
                  type="text"
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder={isProcessingWellness ? 'Please wait...' : 'Type how you feel...'}
                  disabled={isProcessingWellness}
                  aria-label="Text entry for wellness companion"
                  style={{
                    flex: 1,
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'var(--font-family)',
                    fontSize: '0.95rem',
                    fontWeight: 'bold',
                    padding: '0.4rem',
                    outline: 'none',
                    color: 'var(--text)'
                  }}
                />
                <button
                  type="submit"
                  disabled={isProcessingWellness || !typedMessage.trim()}
                  className="btn btn-primary"
                  style={{
                    padding: '0.4rem 1rem',
                    fontSize: '0.85rem',
                    minHeight: '32px',
                    boxShadow: 'none',
                    border: '2px solid var(--border)'
                  }}
                >
                  SEND
                </button>
              </form>
 
              {/* Pulsating Microphone interface */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                <button
                  onClick={toggleListening}
                  className={`mic-btn ${isListening ? 'mic-pulsate' : ''}`}
                  disabled={isProcessingWellness}
                  aria-label="Toggle wellness mic listening"
                  style={{
                    width: '70px',
                    height: '70px',
                    borderRadius: '50%',
                    backgroundColor: isListening ? 'var(--error)' : 'var(--accent-green)',
                    border: '4px solid var(--border)',
                    cursor: isProcessingWellness ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    boxShadow: isListening ? 'none' : '3px 4px 0px var(--border)',
                    transition: 'all 0.1s ease',
                    opacity: isProcessingWellness ? 0.6 : 1
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="3">
                    {isListening ? (
                      <rect x="4" y="4" width="16" height="16" rx="2" fill="var(--border)" />
                    ) : (
                      <>
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" fill="var(--border)" />
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </>
                    )}
                  </svg>
                </button>
                <span style={{ fontWeight: 'bold', fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  {isListening ? 'SPEAK NOW...' : 'TAP MIC TO RESPOND'}
                </span>
              </div>

              {/* Multimedia grounding resource (YouTube / Calming images) */}
              {response && response.multimedia_suggestion ? (
                <div style={{ border: '3px solid var(--border)', backgroundColor: 'var(--accent-gold)', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.1rem 0.4rem', border: '1px solid var(--border)', background: '#FFFFFF', width: 'fit-content' }}>
                    {response.multimedia_suggestion.type.toUpperCase()}
                  </span>
                  <div style={{ border: '3px solid var(--border)', background: '#000000', overflow: 'hidden' }}>
                    {response.multimedia_suggestion.type === 'youtube_embed_id' && (
                      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                        <iframe
                          src={`https://www.youtube.com/embed/${response.multimedia_suggestion.value}?autoplay=0`}
                          title={response.multimedia_suggestion.title}
                          allowFullScreen
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                        />
                      </div>
                    )}
                    {response.multimedia_suggestion.type === 'calming_image_query' && (
                      <img
                        src={`https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80`}
                        alt={response.multimedia_suggestion.accessible_rationale}
                        style={{ width: '100%', display: 'block', height: '140px', objectFit: 'cover' }}
                      />
                    )}
                    {response.multimedia_suggestion.type === 'grounding_gif_url' && (
                      <img
                        src={response.multimedia_suggestion.value}
                        alt={response.multimedia_suggestion.accessible_rationale}
                        style={{ width: '100%', display: 'block', maxHeight: '150px', objectFit: 'contain', background: '#FFFFFF' }}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{response.multimedia_suggestion.title}</div>
                </div>
              ) : response && response.resource ? (
                // Overload resource object if returned from journal analysis
                <div style={{ border: '3px solid var(--border)', backgroundColor: 'var(--accent-gold)', padding: '0.8rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: 'auto' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.1rem 0.4rem', border: '1px solid var(--border)', background: '#FFFFFF', width: 'fit-content' }}>
                    {response.resource.type.toUpperCase()}
                  </span>
                  <div style={{ border: '3px solid var(--border)', background: '#000000', overflow: 'hidden' }}>
                    {response.resource.type === 'youtube_embed_id' && (
                      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                        <iframe
                          src={`https://www.youtube.com/embed/${response.resource.value}?autoplay=0`}
                          title={response.resource.title}
                          allowFullScreen
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                        />
                      </div>
                    )}
                    {response.resource.type === 'calming_image_query' && (
                      <img
                        src={`https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80`}
                        alt={response.resource.accessible_rationale}
                        style={{ width: '100%', display: 'block', height: '140px', objectFit: 'cover' }}
                      />
                    )}
                    {response.resource.type === 'grounding_gif_url' && (
                      <img
                        src={response.resource.value}
                        alt={response.resource.accessible_rationale}
                        style={{ width: '100%', display: 'block', maxHeight: '150px', objectFit: 'contain', background: '#FFFFFF' }}
                      />
                    )}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{response.resource.title}</div>
                </div>
              ) : null}

            </div>
          </section>

        </main>
      )}

      {/* Brutalist accessible footer */}
      <footer className="dashboard-footer" role="contentinfo">
        <div className="footer-content">
          <span className="footer-copyright">© {new Date().getFullYear()} SWASTHYA WELLNESS COMPANION.</span>
          <span className="footer-tag">MADE WITH ❤️ FOR INDIAN COMPETITIVE EXAM STUDENTS. HIMALAYAN MIND SHANTI SECURED.</span>
        </div>
      </footer>

    </div>
  );
}

function StressConnectionGraph({ logs, studentName, onSelectLog }) {
  const canvasRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Render checkered diagonal grid
    ctx.strokeStyle = 'rgba(19, 15, 64, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 15;
    for (let x = -height; x < width + height; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + height, height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - height, height);
      ctx.stroke();
    }

    const centerX = width / 2;
    const centerY = height / 2;

    const nodes = [];
    const connections = [];

    const centerNode = {
      id: 'student_node',
      x: centerX,
      y: centerY,
      label: studentName.toUpperCase(),
      type: 'student',
      radius: 18,
      color: '#FECA57'
    };
    nodes.push(centerNode);

    const triggerGroups = {};
    logs.forEach(log => {
      const firstTrigger = (log.stress_triggers && log.stress_triggers[0]) || 'General Stress';
      if (!triggerGroups[firstTrigger]) {
        triggerGroups[firstTrigger] = [];
      }
      triggerGroups[firstTrigger].push(log);
    });

    const triggerKeys = Object.keys(triggerGroups).slice(0, 4);
    const numTriggers = triggerKeys.length;

    triggerKeys.forEach((trigger, idx) => {
      const angle = (idx / numTriggers) * Math.PI * 2;
      const trigX = centerX + Math.cos(angle) * 52;
      const trigY = centerY + Math.sin(angle) * 52;

      const triggerNode = {
        id: `trigger_${trigger}`,
        x: trigX,
        y: trigY,
        label: trigger.substring(0, 10).toUpperCase(),
        fullLabel: trigger,
        type: 'trigger',
        radius: 11,
        color: '#FF9F43'
      };
      nodes.push(triggerNode);
      connections.push({ from: centerNode, to: triggerNode });

      const logItems = triggerGroups[trigger].slice(0, 3);
      const numLogs = logItems.length;

      logItems.forEach((log, lIdx) => {
        const spread = Math.PI / 3;
        const startAngle = angle - spread / 2;
        const logAngle = numLogs > 1 
          ? startAngle + (lIdx / (numLogs - 1)) * spread 
          : angle;

        const logX = centerX + Math.cos(logAngle) * 98;
        const logY = centerY + Math.sin(logAngle) * 98;

        const logNode = {
          id: `log_${log.created_at}_${lIdx}`,
          x: logX,
          y: logY,
          label: (log.mood || 'STRESS').substring(0, 7).toUpperCase(),
          type: 'log',
          radius: 8,
          color: '#1DD1A1',
          log: log
        };
        nodes.push(logNode);
        connections.push({ from: triggerNode, to: logNode });
      });
    });

    connections.forEach(conn => {
      ctx.beginPath();
      ctx.strokeStyle = '#130F40';
      ctx.lineWidth = 2;
      ctx.moveTo(conn.from.x, conn.from.y);
      ctx.lineTo(conn.to.x, conn.to.y);
      ctx.stroke();
    });

    nodes.forEach(node => {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#130F40';
      ctx.stroke();

      ctx.fillStyle = '#130F40';
      ctx.font = 'bold 7px Space Grotesk, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(node.label, node.x, node.y + node.radius + 2);
    });

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      let hovered = null;
      for (const node of nodes) {
        const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
        if (dist <= node.radius) {
          hovered = node;
          break;
        }
      }

      if (hovered) {
        canvas.style.cursor = hovered.type === 'log' ? 'pointer' : 'default';
        if (hovered.type === 'log') {
          setTooltip({
            x: hovered.x,
            y: hovered.y - hovered.radius - 12,
            text: `Mood: ${hovered.log.mood} | ${new Date(hovered.log.created_at).toLocaleDateString()}`
          });
        } else if (hovered.type === 'trigger') {
          setTooltip({
            x: hovered.x,
            y: hovered.y - hovered.radius - 12,
            text: `Trigger: ${hovered.fullLabel}`
          });
        } else {
          setTooltip(null);
        }
      } else {
        canvas.style.cursor = 'default';
        setTooltip(null);
      }
    };

    const handleMouseClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      for (const node of nodes) {
        if (node.type === 'log') {
          const dist = Math.hypot(node.x - mouseX, node.y - mouseY);
          if (dist <= node.radius) {
            onSelectLog(node.log);
            break;
          }
        }
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleMouseClick);

    return () => {
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleMouseClick);
    };
  }, [logs, studentName, onSelectLog]);

  return (
    <div style={{ position: 'relative', border: '3px solid var(--border)', background: 'var(--surface)', padding: '0.4rem', boxShadow: 'none' }}>
      <canvas 
        ref={canvasRef} 
        width="300" 
        height="230" 
        style={{ display: 'block', width: '100%', height: '230px' }}
      />
      {tooltip && (
        <div style={{
          position: 'absolute',
          left: `${tooltip.x}px`,
          top: `${tooltip.y}px`,
          transform: 'translate(-50%, -100%)',
          background: 'var(--primary)',
          color: '#FFFFFF',
          padding: '0.3rem 0.5rem',
          fontSize: '0.75rem',
          fontWeight: 'bold',
          border: '2px solid var(--border)',
          boxShadow: '2px 2px 0px var(--border)',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 10
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
