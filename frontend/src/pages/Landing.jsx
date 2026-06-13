import { Link } from 'react-router-dom';
import './Landing.css';

export default function Landing({ session }) {
  return (
    <div className="landing-container">
      <header className="landing-header neo-box" style={{ padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: 'none', borderWidth: '0 0 4px 0' }}>
        <div className="logo" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text)' }}>
          स्वास्थ्य <span style={{ fontSize: '1rem', fontStyle: 'italic', color: 'var(--text-muted)' }}>Swasthya</span>
        </div>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          {session ? (
            <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
          ) : (
            <Link to="/auth" className="btn btn-primary">Sign In</Link>
          )}
        </nav>
      </header>

      <main className="hero">
        <div className="hero-content">
          <h1 className="hero-title" style={{ fontSize: '3.5rem', lineHeight: '1.1', fontWeight: 'bold', marginBottom: '1.5rem' }}>
            Your Voice for <span style={{ background: 'var(--accent)', padding: '0.2rem 0.5rem', border: '3px solid var(--border)' }}>Mental Wellness</span>
          </h1>
          <p className="hero-subtitle" style={{ fontSize: '1.3rem', color: 'var(--text-muted)', marginBottom: '2.5rem' }}>
            Swasthya is an empathetic, real-time face-to-face wellness companion designed specifically for Indian competitive exam (JEE, NEET, UPSC, CA) students.
          </p>
          <div className="hero-actions">
            {session ? (
              <Link to="/dashboard" className="btn btn-primary btn-large">
                Open Dashboard
              </Link>
            ) : (
              <Link to="/auth" className="btn btn-primary btn-large">
                Get Started Now
              </Link>
            )}
            <a href="#features" className="btn btn-secondary btn-large">
              Learn More
            </a>
          </div>
        </div>
        
        <div className="hero-visual" style={{ display: 'block' }}>
          <div className="neo-box" style={{ background: 'var(--accent-light)', position: 'relative' }}>
            <div className="mockup-header" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <span className="dot dot-red" style={{ border: '2px solid var(--border)' }}></span>
              <span className="dot dot-yellow" style={{ border: '2px solid var(--border)' }}></span>
              <span className="dot dot-green" style={{ border: '2px solid var(--border)' }}></span>
            </div>
            <div className="mockup-body" style={{ padding: '1rem', textAlign: 'center' }}>
              <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem', textTransform: 'uppercase', fontWeight: 'bold' }}>Bidirectional Audio & Visuals</h3>
              <p style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>
                Speak naturally. Swasthya reads between the lines of your voice to recognize stress, talk back with warm TTS, and show a dynamic, responsive 2D avatar.
              </p>
            </div>
          </div>
        </div>
      </main>

      <section id="features" className="features">
        <div className="feature-card neo-box neo-box-interactive">
          <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>1. Real-Time Empathy</h3>
          <p>We understand the pressure of JEE, NEET, and UPSC. Swasthya listens to you with absolute empathy, validating your struggles without judgment.</p>
        </div>
        <div className="feature-card neo-box neo-box-interactive" style={{ background: 'var(--accent-light)' }}>
          <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>2. Voice-to-Voice Companion</h3>
          <p>No typing required. Just tap the microphone to talk. Receive ultra-low-latency voice answers synchronized with responsive avatar expressions.</p>
        </div>
        <div className="feature-card neo-box neo-box-interactive">
          <h3 style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>3. Grounding suggestion UI</h3>
          <p>Instantly suggests specific visual grounding exercises, calming breathing techniques, or grounding GIFs based on your stress level.</p>
        </div>
      </section>
    </div>
  );
}
