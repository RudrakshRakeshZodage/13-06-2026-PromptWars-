import { Link } from 'react-router-dom';
import './Landing.css';

export default function Landing({ session }) {
  return (
    <div className="landing-container">
      <header className="landing-header">
        <div className="logo">AcmeCorp</div>
        <nav>
          {session ? (
            <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
          ) : (
            <Link to="/auth" className="btn btn-primary">Sign In</Link>
          )}
        </nav>
      </header>

      <main className="hero">
        <div className="hero-content">
          <h1 className="hero-title">Build Something Amazing</h1>
          <p className="hero-subtitle">
            The fastest way to launch your next big idea with Supabase, React, and Express.
          </p>
          <div className="hero-actions">
            {!session && (
              <Link to="/auth" className="btn btn-primary btn-large">
                Get Started
              </Link>
            )}
            <a href="#features" className="btn btn-secondary btn-large">
              Learn More
            </a>
          </div>
        </div>
        
        <div className="hero-visual">
          <div className="glass-card">
            <div className="mockup-header">
              <span className="dot dot-red"></span>
              <span className="dot dot-yellow"></span>
              <span className="dot dot-green"></span>
            </div>
            <div className="mockup-body">
              <div className="mockup-line w-3/4"></div>
              <div className="mockup-line w-1/2"></div>
              <div className="mockup-line w-5/6"></div>
            </div>
          </div>
        </div>
      </main>

      <section id="features" className="features">
        <div className="feature-card">
          <h3>Authentication</h3>
          <p>Secure login with Email/Password and Google OAuth powered by Supabase.</p>
        </div>
        <div className="feature-card">
          <h3>Modern Stack</h3>
          <p>Built with React, Vite, and Express for blazing fast performance.</p>
        </div>
        <div className="feature-card">
          <h3>Ready to Deploy</h3>
          <p>Structured for easy deployment to Vercel (Frontend) and Render (Backend).</p>
        </div>
      </section>
    </div>
  );
}
