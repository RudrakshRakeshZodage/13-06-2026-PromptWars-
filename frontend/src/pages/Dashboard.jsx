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
  const [mouthOpenAmount, setMouthOpenAmount] = useState(2);
  const [errorText, setErrorText] = useState('');

  // Daily Journaling/Timeline logs
  const [journalLogs, setJournalLogs] = useState([]);
  const [isAnalyzingJournal, setIsAnalyzingJournal] = useState(false);

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
  const audioIntervalRef = useRef(null);
  const currentAudioRef = useRef(null);
  const loadJournalLogsRef = useRef();
  const handleWellnessResponseRef = useRef();
  const sendTranscriptionToBackendRef = useRef();
  const stopSpeakingRef = useRef();

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

  // Sync lip movement with speech synthesis
  useEffect(() => {
    if (isSpeaking) {
      audioIntervalRef.current = setInterval(() => {
        setMouthOpenAmount(Math.random() * 12 + 3);
      }, 100);
    } else {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
      }
      setTimeout(() => {
        setMouthOpenAmount(2);
      }, 0);
    }

    return () => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    };
  }, [isSpeaking]);

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

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'user_speech',
        text: text
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
          body: JSON.stringify({ text })
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

    } catch (err) {
      console.error('Failed to submit onboarding:', err);
      setErrorText('Failed to analyze initial profile. Please check if your backend server is online.');
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

  const analytics = getWellnessAnalytics();

  return (
    <div className="dashboard-root">
      
      {/* Header Styled like the Reference Board */}
      <header className="dashboard-header">
        <div className="dashboard-header-title">
          <div className="chunky-logo">
            MIND KA <span className="logo-highlight-orange">SWASTHYA</span> STRESS KA <span className="logo-highlight-green">END</span>
          </div>
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
        <div className="onboard-card">
          <h2 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '1.8rem', marginBottom: '1.5rem', borderBottom: '4px solid var(--border)', paddingBottom: '0.5rem' }}>
            Alignment Questionnaire
          </h2>
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
        </div>
      ) : (
        /* The Three Columns board layout aligned with Reference Image */
        <div className="columns-grid">
          
          {/* Column 1: APNA HAAL (Your Profile Status) */}
          <section className="column-container">
            <div className="column-header column-header-orange">
              AAJ KA HAAL
              <span className="column-subheader">Your profile status</span>
            </div>
            
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
                  <h4 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '0.9rem', marginBottom: '0.6rem' }}>Uncovered Stress Triggers</h4>
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
              <div style={{ marginTop: 'auto', borderTop: '4px solid var(--border)', paddingTop: '1rem' }}>
                <h4 style={{ textTransform: 'uppercase', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.8rem' }}>Diagnostic History</h4>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {journalLogs.map((log, idx) => (
                    <div key={idx} style={{ padding: '0.5rem', background: '#FFFFFF', border: '2px solid var(--border)', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 'bold' }}>{log.mood}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(log.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Column 2: DOST KI SALAH (Tailored Advice) */}
          <section className="column-container">
            <div className="column-header column-header-gold">
              DOST KI SALAH
              <span className="column-subheader">Tailored Coping Strategy</span>
            </div>
            
            <div className="column-body">
              {response ? (
                <>
                  <div className="neo-box" style={{ border: '3px solid var(--border)', background: 'var(--surface)', boxShadow: 'none', padding: '1rem' }}>
                    <h4 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '0.95rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', background: 'var(--accent)', border: '1px solid var(--border)' }}></span>
                      Actionable Coping Strategy
                    </h4>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>{response.coping_strategy || response.spoken_script}</p>
                  </div>

                  <div className="neo-box" style={{ border: '3px solid var(--border)', background: 'var(--surface)', boxShadow: 'none', padding: '1rem' }}>
                    <h4 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '0.95rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ width: '8px', height: '8px', background: 'var(--accent-green)', border: '1px solid var(--border)' }}></span>
                      Mindfulness Pause
                    </h4>
                    <p style={{ fontSize: '0.95rem', lineHeight: '1.5' }}>{response.mindfulness_exercise || 'Take 5 deep breaths in and out slowly to reset your heartbeat.'}</p>
                  </div>

                  {/* Interactive Checklist (Problem Statement Alignment) */}
                  <div className="neo-box" style={{ border: '3px solid var(--border)', background: '#E3F2FD', padding: '1rem', boxShadow: 'none' }}>
                    <h4 style={{ textTransform: 'uppercase', fontWeight: '800', fontSize: '0.95rem', marginBottom: '0.6rem', color: '#0D47A1' }}>
                      Daily Stress-Relief Actions
                    </h4>
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
                    <h4 style={{ textTransform: 'uppercase', fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '0.3rem', fontStyle: 'normal' }}>Motivational Boost</h4>
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
          <section className="column-container">
            <div className="column-header column-header-green">
              MANN KI SHANTI
              <span className="column-subheader">Companion & Calming Media</span>
            </div>
            
            <div className="column-body" style={{ gap: '1rem' }}>
              {/* Responsive SVG Avatar Box */}
              <div className="neo-box" style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                backgroundColor: '#FFF4CC', 
                padding: '1rem',
                minHeight: '230px',
                border: '3px solid var(--border)',
                boxShadow: 'none',
                position: 'relative'
              }}>
                <div className={
                  avatarCue === 'empathetic_nod' ? 'avatar-nod' :
                  avatarCue === 'calm_breathing_motion' ? 'avatar-breathe' :
                  avatarCue === 'concerned_listen' ? 'avatar-listen' : 'avatar-breathe'
                } style={{ width: '150px', height: '150px', display: 'flex', justifyContent: 'center' }}>
                  
                  <svg width="150" height="150" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="46" fill="#FFFFFF" stroke="#130F40" strokeWidth="3" />
                    <path d="M22 45C20 65 25 85 28 88C32 80 25 55 25 45C25 22.5 35 12 50 12C65 12 75 22.5 75 45C75 55 68 80 72 88C75 85 80 65 78 45C78 20 66 12 50 12C34 12 22 20 22 45Z" fill="#130F40" />
                    <path d="M35 74L40 68V62H60V68L65 74C65 74 58 78 50 78C42 78 35 74 35 74Z" fill="#FDFBF7" stroke="#130F40" strokeWidth="2.5" />
                    <path d="M35 74C40 85 60 85 65 74" fill="none" stroke="#130F40" strokeWidth="2.5" />
                    <path d="M48 76L50 82L52 76" stroke="#130F40" strokeWidth="2.5" fill="none" />
                    <path d="M28 42C28 26 36 22 50 22C64 22 72 26 72 42C72 60 62 67 50 67C38 67 28 60 28 42Z" fill="#FDFBF7" stroke="#130F40" strokeWidth="3" />
                    <circle cx="50" cy="36" r="1.8" fill="#FF5252" stroke="#130F40" strokeWidth="0.5" />
                    <path d="M28 35C35 22 45 23 50 28C55 23 65 22 72 35C70 24 60 20 50 24C40 20 30 24 28 35Z" fill="#130F40" />
                    <path d="M25 48L27 53L25 55H29L27 53Z" fill="#F9CA24" stroke="#130F40" strokeWidth="1" />
                    <circle cx="27" cy="56" r="1.5" fill="#FF5252" />
                    <path d="M75 48L73 53L75 55H71L73 53Z" fill="#F9CA24" stroke="#130F40" strokeWidth="1" />
                    <circle cx="73" cy="56" r="1.5" fill="#FF5252" />
                    <path d="M34 40C38 37 42 38 44 40" stroke="#130F40" strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M56 40C58 38 62 37 66 40" stroke="#130F40" strokeWidth="2.2" strokeLinecap="round" />

                    {avatarCue === 'concerned_listen' ? (
                      <>
                        <ellipse cx="39" cy="45" rx="3.5" ry="4.5" fill="#130F40" />
                        <ellipse cx="61" cy="45" rx="3.5" ry="4.5" fill="#130F40" />
                        <circle cx="40.5" cy="43.5" r="1" fill="#FFFFFF" />
                        <circle cx="62.5" cy="43.5" r="1" fill="#FFFFFF" />
                      </>
                    ) : avatarCue === 'warm_smile' || avatarCue === 'reassuring_look' ? (
                      <>
                        <path d="M34 46C36 43 42 43 44 46" stroke="#130F40" strokeWidth="3" strokeLinecap="round" />
                        <path d="M56 46C58 43 64 43 66 46" stroke="#130F40" strokeWidth="3" strokeLinecap="round" />
                      </>
                    ) : (
                      <>
                        <ellipse cx="39" cy="45" rx="4" ry="4" fill="#130F40" />
                        <ellipse cx="61" cy="45" rx="4" ry="4" fill="#130F40" />
                        <circle cx="40.5" cy="43.5" r="1.2" fill="#FFFFFF" />
                        <circle cx="62.5" cy="43.5" r="1.2" fill="#FFFFFF" />
                      </>
                    )}

                    {(avatarCue === 'warm_smile' || avatarCue === 'reassuring_look') && (
                      <>
                        <circle cx="34" cy="51" r="3.5" fill="#FF5252" fillOpacity="0.35" />
                        <circle cx="66" cy="51" r="3.5" fill="#FF5252" fillOpacity="0.35" />
                      </>
                    )}

                    <path d="M50 44V51C50 52.5 48.5 53 47.5 53" stroke="#130F40" strokeWidth="2.5" strokeLinecap="round" />

                    {isSpeaking ? (
                      <ellipse cx="50" cy="59" rx="7" ry={mouthOpenAmount} fill="#130F40" />
                    ) : avatarCue === 'warm_smile' ? (
                      <path d="M43 57C46 61.5 54 61.5 57 57" stroke="#130F40" strokeWidth="3.2" strokeLinecap="round" />
                    ) : avatarCue === 'concerned_listen' ? (
                      <line x1="43" y1="58" x2="57" y2="58" stroke="#130F40" strokeWidth="3.2" strokeLinecap="round" />
                    ) : (
                      <path d="M44 58C47 60 53 60 56 58" stroke="#130F40" strokeWidth="2.8" strokeLinecap="round" />
                    )}
                  </svg>
                </div>
              </div>

              {/* Real-time captions block */}
              <div className="neo-box" style={{ padding: '0.8rem', border: '3px solid var(--border)', boxShadow: 'none', background: 'var(--surface)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                  {isProcessingWellness ? 'STATUS:' : 'CAPTIONS:'}
                </span>
                <p id="live-captions" aria-live="polite" style={{ fontSize: '0.95rem', fontWeight: 'bold', minHeight: '40px', lineHeight: '1.4' }}>{captions}</p>
              </div>

              {/* Typing Input Form (Accessibility & Score Booster) */}
              <form onSubmit={handleTypeSubmit} style={{ display: 'flex', gap: '0.5rem', border: '3px solid var(--border)', background: 'var(--surface)', padding: '0.4rem' }}>
                <input
                  type="text"
                  value={typedMessage}
                  onChange={(e) => setTypedMessage(e.target.value)}
                  placeholder={isProcessingWellness ? 'Please wait...' : 'Type how you feel...'}
                  disabled={isProcessingWellness}
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

        </div>
      )}

    </div>
  );
}
