import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Dashboard({ session }) {
  const navigate = useNavigate();
  
  // State for application tabs
  const [activeTab, setActiveTab] = useState('companion'); // 'companion' or 'journal'
  
  // Companion Tab States
  const [isListening, setIsListening] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [response, setResponse] = useState(null);
  const [captions, setCaptions] = useState('Hello! Tap the microphone below and tell me how you are feeling today.');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [socket, setSocket] = useState(null);
  const [avatarCue, setAvatarCue] = useState('concerned_listen');
  const [mouthOpenAmount, setMouthOpenAmount] = useState(2);
  const [errorText, setErrorText] = useState('');

  // Journaling Tab States
  const [journalText, setJournalText] = useState('');
  const [journalLogs, setJournalLogs] = useState([]);
  const [isAnalyzingJournal, setIsAnalyzingJournal] = useState(false);
  const [journalAnalysisResult, setJournalAnalysisResult] = useState(null);

  const speechRecognitionRef = useRef(null);
  const audioIntervalRef = useRef(null);

  // Initialize WebSocket connection to backend
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const backendUrl = import.meta.env.VITE_BACKEND_URL || 'localhost:5000';
    const wsUrl = `${protocol}//${backendUrl.replace(/^https?:\/\//, '')}/socket`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    let ws;
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
            handleWellnessResponse(payload.data);
          }
        } catch (err) {
          console.error('Failed parsing WebSocket message:', err);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
      };

      setSocket(ws);
    } catch (err) {
      console.error('WebSocket init failed:', err);
    }

    return () => {
      if (ws) ws.close();
    };
  }, []);

  // Set up Speech Recognition for voice dictation
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.lang = 'en-IN';
      recognition.interimResults = false;

      recognition.onstart = () => {
        setIsListening(true);
        if (activeTab === 'companion') {
          setTranscription('Listening...');
          setCaptions('Listening to your voice...');
          stopSpeaking();
        }
      };

      recognition.onresult = async (event) => {
        const text = event.results[0][0].transcript;
        if (activeTab === 'companion') {
          setTranscription(text);
          setCaptions(`You said: "${text}"`);
          await sendTranscriptionToBackend(text);
        } else {
          // If in journaling tab, append transcription to the text field
          setJournalText(prev => prev ? `${prev} ${text}` : text);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (activeTab === 'companion') {
          setCaptions('Sorry, I couldn\'t catch that. Please try tapping the mic and speaking again.');
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      speechRecognitionRef.current = recognition;
    }
  }, [socket, activeTab]);

  // Sync lip movement with speech
  useEffect(() => {
    if (isSpeaking) {
      audioIntervalRef.current = setInterval(() => {
        setMouthOpenAmount(Math.random() * 12 + 3);
      }, 100);
    } else {
      if (audioIntervalRef.current) {
        clearInterval(audioIntervalRef.current);
      }
      setMouthOpenAmount(2);
    }

    return () => {
      if (audioIntervalRef.current) clearInterval(audioIntervalRef.current);
    };
  }, [isSpeaking]);

  // Load mood logs on mount and tab switch
  useEffect(() => {
    if (session) {
      loadJournalLogs();
    }
  }, [session]);

  const loadJournalLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('mood_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setJournalLogs(data || []);
    } catch (err) {
      console.warn('Supabase mood_logs select failed, reading from localStorage:', err);
      const local = localStorage.getItem('swasthya_journal_logs');
      if (local) {
        setJournalLogs(JSON.parse(local));
      }
    }
  };

  // Handle server responses (LLM schema)
  const handleWellnessResponse = (data) => {
    setResponse(data);
    setAvatarCue(data.avatar_motor_cue || 'empathetic_nod');
    setCaptions(data.spoken_script);
    
    if (data.audio_base64) {
      playBase64Audio(data.audio_base64, data.spoken_script);
    } else {
      speakText(data.spoken_script);
    }
  };

  const playBase64Audio = (base64String, fallbackText) => {
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
      window.currentAudioElement = audio;
    } catch (err) {
      console.error('Failed to create/play Audio object:', err);
      speakText(fallbackText);
    }
  };

  const speakText = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      const voices = window.speechSynthesis.getVoices();
      const indianVoice = voices.find(voice => voice.lang.includes('IN') || voice.name.toLowerCase().includes('india') || voice.name.toLowerCase().includes('google'));
      if (indianVoice) utterance.voice = indianVoice;

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
  };

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (window.currentAudioElement) {
      window.currentAudioElement.pause();
      window.currentAudioElement = null;
    }
    setIsSpeaking(false);
  };

  const sendTranscriptionToBackend = async (text) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'user_speech',
        text: text
      }));
    } else {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
        const res = await fetch(`${backendUrl}/api/wellness`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        handleWellnessResponse(data);
      } catch (err) {
        console.error('Error fetching REST wellness:', err);
        setErrorText('Failed to reach backend server.');
        setCaptions('I am having trouble reaching my server right now, but please take a deep breath.');
      }
    }
  };

  // Journal submission analysis and DB persistence
  const handleJournalSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!journalText.trim()) return;

    setIsAnalyzingJournal(true);
    setJournalAnalysisResult(null);

    try {
      const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
      const res = await fetch(`${backendUrl}/api/journal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: journalText })
      });
      
      const analysis = await res.json();
      if (analysis.error) throw new Error(analysis.error);

      setJournalAnalysisResult(analysis);

      // Create new log object
      const newLog = {
        user_id: session?.user?.id,
        content: journalText,
        mood: analysis.mood,
        stress_triggers: analysis.stress_triggers,
        encouragement: analysis.encouragement,
        created_at: new Date().toISOString()
      };

      // Persist to Supabase
      try {
        const { data, error } = await supabase
          .from('mood_logs')
          .insert([newLog])
          .select();

        if (error) throw error;
        setJournalLogs(prev => [data[0], ...prev]);
      } catch (dbErr) {
        console.warn('Supabase insert failed, falling back to localStorage:', dbErr.message);
        const updatedLogs = [newLog, ...journalLogs];
        setJournalLogs(updatedLogs);
        localStorage.setItem('swasthya_journal_logs', JSON.stringify(updatedLogs));
      }

      setJournalText('');
    } catch (err) {
      console.error('Failed to submit journal:', err);
      alert('Failed to analyze journal entry. Please verify your backend server is active.');
    } finally {
      setIsAnalyzingJournal(false);
    }
  };

  const toggleListening = () => {
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
  };

  const handleSignOut = async () => {
    stopSpeaking();
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div className="dashboard-root" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--background)' }}>
      {/* Header */}
      <header className="neo-box" style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '1rem 2rem', 
        borderRadius: '0px', 
        borderWidth: '0 0 4px 0',
        backgroundColor: 'var(--surface)',
        boxShadow: 'none',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 'bold', textTransform: 'uppercase' }}>स्वास्थ्य Swasthya</h1>
          <span style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem', border: '2px solid var(--border)', background: 'var(--accent)', fontWeight: 'bold' }}>EXAM COMPANION</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <span style={{ fontWeight: '500', display: 'none', md: 'inline' }}>
            {session?.user?.email}
          </span>
          <button onClick={handleSignOut} className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem', minHeight: '40px' }}>
            SIGN OUT
          </button>
        </div>
      </header>

      {/* Tab Selector */}
      <div style={{ display: 'flex', borderBottom: '4px solid var(--border)', backgroundColor: 'var(--surface)' }}>
        <button
          onClick={() => { stopSpeaking(); setActiveTab('companion'); }}
          className="btn"
          style={{
            flex: 1,
            border: 'none',
            borderRight: '4px solid var(--border)',
            borderRadius: '0',
            boxShadow: 'none',
            backgroundColor: activeTab === 'companion' ? 'var(--accent)' : 'transparent',
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}
        >
          Voice Companion
        </button>
        <button
          onClick={() => { stopSpeaking(); setActiveTab('journal'); }}
          className="btn"
          style={{
            flex: 1,
            border: 'none',
            borderRadius: '0',
            boxShadow: 'none',
            backgroundColor: activeTab === 'journal' ? 'var(--accent)' : 'transparent',
            fontWeight: 'bold',
            textTransform: 'uppercase'
          }}
        >
          Daily Journal & Mood Logs
        </button>
      </div>

      {/* Main Grid */}
      <main style={{ 
        flex: 1, 
        display: 'grid', 
        gridTemplateColumns: '1fr',
        gap: '2rem',
        padding: '2rem',
        maxWidth: '1200px',
        width: '100%',
        margin: '0 auto',
        boxSizing: 'border-box'
      }} className="dashboard-grid">
        
        <style>{`
          @media (min-width: 900px) {
            .dashboard-grid {
              grid-template-columns: ${activeTab === 'companion' ? '1.6fr 1fr' : '1.2fr 1fr'} !important;
            }
          }
          @keyframes pulsate {
            0% { box-shadow: 0 0 0 0px rgba(19, 15, 64, 0.4); }
            100% { box-shadow: 0 0 0 25px rgba(19, 15, 64, 0); }
          }
          .mic-pulsate {
            animation: pulsate 1.5s infinite ease-out;
          }
          .avatar-nod {
            animation: nod 2s infinite ease-in-out;
            transform-origin: center bottom;
          }
          .avatar-breathe {
            animation: breathe 3s infinite ease-in-out;
            transform-origin: center bottom;
          }
          .avatar-listen {
            animation: tilt 4s infinite ease-in-out;
            transform-origin: center bottom;
          }
          @keyframes nod {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(6px); }
          }
          @keyframes breathe {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.02, 1.03) translateY(-2px); }
          }
          @keyframes tilt {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(1.5deg) translateX(2px); }
          }
        `}</style>

        {activeTab === 'companion' ? (
          <>
            {/* COMPANION VIEW */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Focus Container - Responsive 2D Vector Avatar */}
              <div className="neo-box" style={{ 
                flex: 1, 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                position: 'relative', 
                backgroundColor: '#FFF4CC', 
                padding: '2rem',
                minHeight: '350px',
                overflow: 'hidden'
              }} aria-label="Interactive 2D Swasthya Wellness Avatar">
                
                <div style={{ position: 'absolute', top: '1rem', left: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span style={{ 
                    width: '12px', 
                    height: '12px', 
                    borderRadius: '50%', 
                    background: isSpeaking ? '#1DD1A1' : '#130F40',
                    border: '2px solid var(--border)'
                  }}></span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {isSpeaking ? 'SPEAKING' : 'LISTENING'}
                  </span>
                </div>

                <div className={
                  avatarCue === 'empathetic_nod' ? 'avatar-nod' :
                  avatarCue === 'calm_breathing_motion' ? 'avatar-breathe' :
                  avatarCue === 'concerned_listen' ? 'avatar-listen' : 'avatar-breathe'
                } style={{ width: '220px', height: '220px', display: 'flex', justifyContent: 'center' }}>
                  
                  <svg width="220" height="220" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="45" fill="#FFFFFF" stroke="#130F40" strokeWidth="3" />
                    <path d="M15 45C15 22.5 32.5 15 50 15C67.5 15 85 22.5 85 45V55H15V45Z" fill="#130F40" />
                    <rect x="25" y="32" width="50" height="42" rx="25" fill="#FDFBF7" stroke="#130F40" strokeWidth="3.5" />
                    <path d="M25 35C35 28 45 32 50 35C55 32 65 28 75 35C75 35 70 25 50 25C30 25 25 35 25 35Z" fill="#130F40" />
                    <path d="M32 44C35 41 39 42 41 44" stroke="#130F40" strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M59 44C61 42 65 41 68 44" stroke="#130F40" strokeWidth="2.5" strokeLinecap="round" />

                    {avatarCue === 'concerned_listen' ? (
                      <>
                        <ellipse cx="37" cy="48" rx="3" ry="4.5" fill="#130F40" />
                        <ellipse cx="63" cy="48" rx="3" ry="4.5" fill="#130F40" />
                      </>
                    ) : avatarCue === 'warm_smile' || avatarCue === 'reassuring_look' ? (
                      <>
                        <path d="M33 49C35 46 39 46 41 49" stroke="#130F40" strokeWidth="3" strokeLinecap="round" />
                        <path d="M59 49C61 46 65 46 67 49" stroke="#130F40" strokeWidth="3" strokeLinecap="round" />
                      </>
                    ) : (
                      <>
                        <ellipse cx="37" cy="48" rx="3.5" ry="3.5" fill="#130F40" />
                        <ellipse cx="63" cy="48" rx="3.5" ry="3.5" fill="#130F40" />
                      </>
                    )}

                    {(avatarCue === 'warm_smile' || avatarCue === 'reassuring_look') && (
                      <>
                        <circle cx="31" cy="54" r="3" fill="#FF5252" fillOpacity="0.4" />
                        <circle cx="69" cy="54" r="3" fill="#FF5252" fillOpacity="0.4" />
                      </>
                    )}

                    <path d="M50 48V53C50 54 49 55 47 55" stroke="#130F40" strokeWidth="2.5" strokeLinecap="round" />

                    {isSpeaking ? (
                      <ellipse cx="50" cy="61" rx="6" ry={mouthOpenAmount} fill="#130F40" />
                    ) : avatarCue === 'warm_smile' ? (
                      <path d="M44 59C46 62 54 62 56 59" stroke="#130F40" strokeWidth="3" strokeLinecap="round" />
                    ) : avatarCue === 'concerned_listen' ? (
                      <line x1="44" y1="60" x2="56" y2="60" stroke="#130F40" strokeWidth="3" strokeLinecap="round" />
                    ) : (
                      <path d="M45 60C47 61.5 53 61.5 55 60" stroke="#130F40" strokeWidth="2.5" strokeLinecap="round" />
                    )}
                  </svg>
                </div>

                <div style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: '#FFFFFF', border: '3px solid var(--border)', padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: 'bold' }}>
                  {avatarCue.replace(/_/g, ' ').toUpperCase()}
                </div>
              </div>

              {/* Captions */}
              <div className="neo-box" style={{ backgroundColor: 'var(--surface)', padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <h4 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 'bold' }}>Captions</h4>
                <div 
                  id="live-captions" 
                  aria-live="polite" 
                  aria-atomic="true"
                  style={{ fontSize: '1.2rem', fontWeight: 'bold', minHeight: '60px', lineHeight: '1.6', color: 'var(--text)' }}
                >
                  {captions}
                </div>
              </div>

              {/* Mic Controls */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button
                  onClick={toggleListening}
                  className={`mic-btn ${isListening ? 'mic-pulsate' : ''}`}
                  aria-label={isListening ? "Stop listening to speech" : "Start speaking, microphone button"}
                  style={{
                    width: '90px',
                    height: '90px',
                    borderRadius: '50%',
                    backgroundColor: isListening ? 'var(--error)' : 'var(--accent)',
                    border: '4px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    boxShadow: isListening ? 'none' : '4px 6px 0px var(--border)',
                    transition: 'all 0.1s ease'
                  }}
                >
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
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
                <span style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.9rem' }}>
                  {isListening ? 'TAP TO COMPLETE SPEECH' : 'TAP MIC & SPEAK'}
                </span>
              </div>

              {errorText && (
                <div className="neo-box" style={{ backgroundColor: 'var(--error)', color: '#FFFFFF', fontWeight: 'bold', padding: '0.8rem', textAlign: 'center' }}>
                  {errorText}
                </div>
              )}
            </section>

            {/* Sidebar */}
            <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="neo-box" style={{ backgroundColor: 'var(--surface)', height: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', borderLeft: '4px solid var(--border)' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.2rem' }}>Grounding Tools</h2>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Real-time suggestions helper</p>
                </div>
                <hr style={{ border: 'none', borderTop: '4px solid var(--border)' }} />

                {response && response.multimedia_suggestion ? (
                  <div style={{ backgroundColor: 'var(--accent)', border: '4px solid var(--border)', padding: '1.2rem', boxShadow: '4px 4px 0px var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.1rem 0.5rem', border: '2px solid var(--border)', background: '#FFFFFF' }}>
                        {response.multimedia_suggestion.type.toUpperCase().replace(/_/g, ' ')}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 'bold', textTransform: 'uppercase', lineHeight: '1.2' }}>{response.multimedia_suggestion.title}</h3>

                    <div style={{ border: '4px solid var(--border)', background: '#000000', overflow: 'hidden', position: 'relative' }}>
                      {response.multimedia_suggestion.type === 'youtube_embed_id' && (
                        <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
                          <iframe
                            src={`https://www.youtube.com/embed/${response.multimedia_suggestion.value}?autoplay=0&rel=0`}
                            title={response.multimedia_suggestion.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                            aria-label={`Calming video suggestion: ${response.multimedia_suggestion.title}`}
                          />
                        </div>
                      )}

                      {response.multimedia_suggestion.type === 'calming_image_query' && (
                        <img
                          src={`https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=600&q=80`}
                          alt={response.multimedia_suggestion.accessible_rationale}
                          style={{ width: '100%', display: 'block', height: '200px', objectFit: 'cover' }}
                        />
                      )}

                      {response.multimedia_suggestion.type === 'grounding_gif_url' && (
                        <img
                          src={response.multimedia_suggestion.value}
                          alt={response.multimedia_suggestion.accessible_rationale}
                          style={{ width: '100%', display: 'block', minHeight: '180px', maxHeight: '250px', objectFit: 'contain', background: '#FFFFFF' }}
                        />
                      )}
                    </div>

                    <div style={{ fontSize: '0.95rem', color: 'var(--text)', background: 'var(--background)', padding: '0.8rem', border: '2px solid var(--border)', fontWeight: '500' }}>
                      <strong>Why this helps:</strong> {response.multimedia_suggestion.accessible_rationale}
                    </div>
                  </div>
                ) : (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '2rem', border: '4px dashed var(--border)', backgroundColor: 'var(--background)', textAlign: 'center' }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }}>
                      <circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="12" y1="8" x2="12" y2="16" />
                    </svg>
                    <h4 style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>Suggestions Waiting</h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Once you speak your thoughts, relaxing visuals and advice will display here.</p>
                  </div>
                )}

                {response && response.emotional_analysis && (
                  <div className="neo-box" style={{ background: 'var(--background)', border: '3px solid var(--border)', padding: '0.8rem 1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: 'none' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>EMOTIONAL STATE:</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 'bold', color: 'var(--text)' }}>{response.emotional_analysis.toUpperCase()}</span>
                  </div>
                )}
              </div>
            </aside>
          </>
        ) : (
          <>
            {/* DAILY JOURNALING VIEW */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="neo-box" style={{ backgroundColor: 'var(--surface)' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '1rem' }}>Write Today's Journal</h2>
                <form onSubmit={handleJournalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.9rem' }}>How was your study session? Any stress triggers?</label>
                    <textarea
                      value={journalText}
                      onChange={(e) => setJournalText(e.target.value)}
                      placeholder="Describe your prep, mock test results, study target, parental pressures or burnout... Example: I studied for 8 hours but I failed my physics mock test. I am feeling extremely stressed about the results..."
                      style={{
                        width: '100%',
                        height: '150px',
                        padding: '1rem',
                        fontSize: '1.1rem',
                        fontFamily: 'var(--font-family)',
                        border: '4px solid var(--border)',
                        background: 'var(--background)',
                        color: 'var(--text)',
                        resize: 'vertical'
                      }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      type="button"
                      onClick={toggleListening}
                      className="btn btn-secondary"
                      style={{ flex: 0.4 }}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                        <line x1="12" y1="19" x2="12" y2="22" />
                      </svg>
                      {isListening ? 'LISTENING...' : 'DICTATE'}
                    </button>
                    <button
                      type="submit"
                      disabled={isAnalyzingJournal || !journalText.trim()}
                      className="btn btn-primary"
                      style={{ flex: 0.6 }}
                    >
                      {isAnalyzingJournal ? 'ANALYZING JOURNAL...' : 'SAVE & ANALYZE ENTRY'}
                    </button>
                  </div>
                </form>
              </div>

              {/* Display analysis results instantly */}
              {journalAnalysisResult && (
                <div className="neo-box" style={{ backgroundColor: 'var(--accent-light)', border: '4px solid var(--border)' }}>
                  <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '0.8rem' }}>Journal Insights</h3>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    <div style={{ padding: '0.4rem 0.8rem', background: 'var(--surface)', border: '2px solid var(--border)', fontWeight: 'bold' }}>
                      MOOD: {journalAnalysisResult.mood.toUpperCase()}
                    </div>
                    {journalAnalysisResult.stress_triggers.map((trigger, idx) => (
                      <div key={idx} style={{ padding: '0.4rem 0.8rem', background: 'var(--accent)', border: '2px solid var(--border)', fontWeight: 'bold' }}>
                        TRIGGER: {trigger.toUpperCase()}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: '1.1rem', fontWeight: '500', padding: '0.8rem', background: '#FFFFFF', border: '2px solid var(--border)' }}>
                    <strong>Wellness Tip:</strong> {journalAnalysisResult.encouragement}
                  </p>
                </div>
              )}
            </section>

            {/* History logs timeline */}
            <aside style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="neo-box" style={{ backgroundColor: 'var(--surface)', maxHeight: '70vh', overflowY: 'auto' }}>
                <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '1rem' }}>Journal History</h3>
                
                {journalLogs.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', border: '4px dashed var(--border)' }}>
                    <p style={{ color: 'var(--text-muted)' }}>No journal logs found. Save your first entry to track emotional trends.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
                    {journalLogs.map((log, index) => (
                      <div key={index} className="neo-box" style={{ padding: '1rem', background: 'var(--background)', border: '2px solid var(--border)', boxShadow: 'none' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--text-muted)' }}>
                            {new Date(log.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span style={{ 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold', 
                            padding: '0.1rem 0.5rem', 
                            border: '2px solid var(--border)', 
                            background: log.mood === 'Anxious' ? 'var(--error)' : log.mood === 'Burnt Out' ? 'var(--accent)' : 'var(--success)',
                            color: log.mood === 'Anxious' ? '#FFFFFF' : 'var(--text)'
                          }}>
                            {log.mood.toUpperCase()}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.95rem', marginBottom: '0.8rem', fontStyle: 'italic' }}>"{log.content}"</p>
                        
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.5rem' }}>
                          {log.stress_triggers && log.stress_triggers.map((trigger, idx) => (
                            <span key={idx} style={{ fontSize: '0.75rem', fontWeight: 'bold', padding: '0.1rem 0.4rem', border: '1px solid var(--border)', background: 'var(--accent-light)' }}>
                              {trigger}
                            </span>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.85rem', padding: '0.5rem', background: '#FFFFFF', border: '1px solid var(--border)' }}>
                          {log.encouragement}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </>
        )}

      </main>
    </div>
  );
}
