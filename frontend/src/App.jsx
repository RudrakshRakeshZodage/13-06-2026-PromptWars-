import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import './App.css'

function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })

    // Listen for changes on auth state (logged in, signed out, etc.)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return <div className="loading-screen">Loading...</div>
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing session={session} />} />
        <Route path="/auth" element={session ? <Navigate to="/dashboard" /> : <Auth />} />
        <Route path="/dashboard" element={session ? <Dashboard session={session} /> : <Navigate to="/auth" />} />
      </Routes>
    </Router>
  )
}

export default App
