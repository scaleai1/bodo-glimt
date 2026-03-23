// ─── Delete Account Button ────────────────────────────────────────────────────
// Apple App Store requirement: users must be able to delete their account
// from within the app (App Store Review Guidelines §5.1.1).
//
// On confirm → calls the delete-account Edge Function → CASCADE deletes:
//   auth.users → profiles → campaigns → chat_history
//
// Usage: drop anywhere in a settings/account screen:
//   import { DeleteAccountButton } from '../components/DeleteAccountButton';
//   <DeleteAccountButton />

import { useState } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export function DeleteAccountButton() {
  const { deleteAccount } = useAuth();
  const [step,     setStep]     = useState<'idle' | 'confirm' | 'deleting' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleDelete() {
    setStep('deleting');
    setErrorMsg('');
    try {
      await deleteAccount();
      // Session becomes null → App.tsx redirects to LoginPage automatically
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Deletion failed. Please try again.');
      setStep('error');
    }
  }

  // ── idle ──────────────────────────────────────────────────────────────────
  if (step === 'idle') {
    return (
      <button
        onClick={() => setStep('confirm')}
        className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
        style={{
          background:   'rgba(239,68,68,0.06)',
          border:       '1px solid rgba(239,68,68,0.18)',
          color:        '#f87171',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLElement).style.background   = 'rgba(239,68,68,0.12)';
          (e.currentTarget as HTMLElement).style.borderColor  = 'rgba(239,68,68,0.35)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background   = 'rgba(239,68,68,0.06)';
          (e.currentTarget as HTMLElement).style.borderColor  = 'rgba(239,68,68,0.18)';
        }}
      >
        <Trash2 size={14} />
        Delete Account
      </button>
    );
  }

  // ── confirm / error ───────────────────────────────────────────────────────
  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.18)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} style={{ color: '#f87171', flexShrink: 0 }} />
        <span className="text-sm font-bold" style={{ color: '#f87171' }}>
          Permanently delete your account?
        </span>
      </div>

      {/* Warning copy */}
      <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>
        This will permanently erase your brand settings, campaign history, chat history,
        and all Meta connections. This action <strong style={{ color: 'rgba(255,255,255,0.55)' }}>
        cannot be undone</strong> and complies with GDPR Right to be Forgotten.
      </p>

      {/* Error */}
      {step === 'error' && (
        <p className="text-xs font-mono" style={{ color: '#f87171' }}>{errorMsg}</p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleDelete}
          disabled={step === 'deleting'}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-50"
          style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.4)', color: '#f87171' }}
        >
          {step === 'deleting'
            ? <><Loader2 size={13} className="animate-spin" /> Deleting…</>
            : 'Yes, delete everything'}
        </button>

        <button
          onClick={() => { setStep('idle'); setErrorMsg(''); }}
          disabled={step === 'deleting'}
          className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.45)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default DeleteAccountButton;
