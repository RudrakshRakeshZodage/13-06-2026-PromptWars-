import { supabase } from '../supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Dashboard({ session }) {
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h2>Dashboard</h2>
      <p>Welcome, {session?.user?.email}!</p>
      
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
        <h3>Your Account Information</h3>
        <pre style={{ background: '#000', padding: '1rem', borderRadius: '4px', overflowX: 'auto', marginTop: '1rem', fontSize: '0.9rem' }}>
          {JSON.stringify(session.user, null, 2)}
        </pre>
      </div>

      <button onClick={handleSignOut} className="btn btn-outline" style={{ marginTop: '2rem' }}>
        Sign Out
      </button>
    </div>
  );
}
