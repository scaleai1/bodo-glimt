import { useEffect, useState } from 'react';
import Dashboard from './pages/Dashboard';
import OnboardingPage from './pages/OnboardingPage';
import LoginPage from './pages/LoginPage';
import { useAuth } from './lib/AuthContext';
import { getUserConfig, clearUserConfig } from './lib/userConfig';
import './index.css';

function App() {
  const { session, loading, signOut } = useAuth();
  const [view, setView] = useState<'onboarding' | 'dashboard'>('onboarding');

  // Re-evaluate which screen to show whenever the session changes (login / logout)
  useEffect(() => {
    if (!session) return;
    if (window.location.hash === '#onboarding') {
      setView('onboarding');
    } else if (getUserConfig().completed) {
      setView('dashboard');
    } else {
      setView('onboarding');
    }
  }, [session]);

  // ── Loading splash ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: '#06060a',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: "'Barlow Condensed', Impact, 'Arial Black', sans-serif",
          fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', color: '#fff',
        }}>
          Scale<span style={{ color: '#F0B429' }}>.ai</span>
        </div>
      </div>
    );
  }

  // ── Not authenticated → Login ─────────────────────────────────────────────
  if (!session) return <LoginPage />;

  // ── Authenticated → Onboarding or Dashboard ───────────────────────────────
  if (view === 'onboarding') {
    return (
      <OnboardingPage
        onComplete={() => {
          window.location.hash = '';
          setView('dashboard');
        }}
      />
    );
  }

  return (
    <Dashboard
      onLogout={async () => {
        clearUserConfig();
        await signOut();
        // session becomes null → LoginPage renders automatically
      }}
    />
  );
}

export default App;
