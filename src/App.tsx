import { useState, useEffect } from 'react';
import Dashboard from './pages/Dashboard';
import OnboardingPage from './pages/OnboardingPage';
import { getUserConfig, saveUserConfig, clearUserConfig } from './lib/userConfig';
import { supabase } from './lib/supabase';
import './index.css';

function App() {
  const [view, setView] = useState<'onboarding' | 'dashboard'>(() => {
    if (window.location.hash === '#onboarding') return 'onboarding';
    if (getUserConfig().completed) return 'dashboard';
    return 'onboarding';
  });

  useEffect(() => {
    // Handle return from Facebook OAuth — Supabase fires SIGNED_IN on redirect
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // Save Meta access token from Facebook provider
        if (session.provider_token) {
          saveUserConfig({ metaAccessToken: session.provider_token });
        }
        saveUserConfig({ completed: true });
        setView('dashboard');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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

  return <Dashboard onLogout={() => { clearUserConfig(); setView('onboarding'); }} />;
}

export default App;
