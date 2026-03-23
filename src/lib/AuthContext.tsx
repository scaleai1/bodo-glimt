// ─── Auth Context ─────────────────────────────────────────────────────────────
// Wraps the entire app. Exposes session, user, and auth actions.
// Keeps Supabase auth state in sync via onAuthStateChange.

import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getOAuthRedirectUrl } from './deepLink';

type OAuthProvider = 'google' | 'facebook';

interface AuthContextValue {
  session:         Session | null;
  user:            User    | null;
  loading:         boolean;
  signUp:          (email: string, password: string) => Promise<void>;
  signIn:          (email: string, password: string) => Promise<void>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signOut:         () => Promise<void>;
  deleteAccount:   () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore existing session on mount
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Keep in sync with any auth events (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  async function signUp(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async function signIn(email: string, password: string): Promise<void> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async function signInWithOAuth(provider: OAuthProvider): Promise<void> {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: getOAuthRedirectUrl() },
    });
    if (error) throw error;
  }

  async function signOut(): Promise<void> {
    await supabase.auth.signOut();
  }

  async function deleteAccount(): Promise<void> {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) throw error;
    // onAuthStateChange fires automatically — session becomes null, UI redirects to login
  }

  return (
    <AuthContext.Provider value={{
      session,
      user:    session?.user ?? null,
      loading,
      signUp,
      signIn,
      signInWithOAuth,
      signOut,
      deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
