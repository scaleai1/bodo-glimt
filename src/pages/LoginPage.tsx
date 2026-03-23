// ─── Login Page ───────────────────────────────────────────────────────────────
// Email + password auth. Toggles between Sign In and Sign Up.
// Styled to match the app's dark aesthetic.

import { useState } from 'react';
import { Loader2, Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function LoginPage() {
  const { signIn, signUp } = useAuth();

  const [mode,     setMode]     = useState<'signin' | 'signup'>('signin');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');   // sign-up confirmation

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    setError(''); setSuccess(''); setLoading(true);

    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
        // App.tsx will detect the new session and redirect automatically
      } else {
        await signUp(email.trim(), password);
        setSuccess('Account created! Check your email to confirm, then sign in.');
        setMode('signin');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#06060a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#0d0e14',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 20,
        padding: '40px 36px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontFamily: "'Barlow Condensed', Impact, 'Arial Black', sans-serif",
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1,
            color: '#fff',
            marginBottom: 6,
          }}>
            Scale<span style={{ color: '#F0B429' }}>.ai</span>
          </div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Email */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Email
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={14} style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.2)', pointerEvents: 'none',
              }} />
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                style={{
                  width: '100%', paddingLeft: 36, paddingRight: 14,
                  height: 44, borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: '#fff', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(240,180,41,0.4)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; }}
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={14} style={{
                position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                color: 'rgba(255,255,255,0.2)', pointerEvents: 'none',
              }} />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min. 8 characters' : '••••••••'}
                required
                minLength={mode === 'signup' ? 8 : undefined}
                style={{
                  width: '100%', paddingLeft: 36, paddingRight: 14,
                  height: 44, borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: '#fff', fontSize: 14, outline: 'none',
                  fontFamily: 'inherit',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(240,180,41,0.4)'; }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#f87171',
            }}>
              <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div style={{
              background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
              borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#6ee7b7',
            }}>
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            style={{
              height: 46, borderRadius: 12, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? 'rgba(240,180,41,0.5)' : '#F0B429',
              color: '#000', fontWeight: 800, fontSize: 14, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              marginTop: 4,
              transition: 'opacity 0.15s',
              opacity: !email.trim() || !password.trim() ? 0.45 : 1,
            }}
          >
            {loading ? (
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
            ) : (
              <>
                {mode === 'signin' ? 'Sign In' : 'Create Account'}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Toggle mode */}
        <p style={{
          textAlign: 'center', marginTop: 20, fontSize: 13,
          color: 'rgba(255,255,255,0.3)',
        }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setSuccess(''); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#F0B429', fontWeight: 700, fontSize: 13, padding: 0,
              fontFamily: 'inherit',
            }}
          >
            {mode === 'signin' ? 'Sign Up' : 'Sign In'}
          </button>
        </p>
      </div>

      {/* Spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
