// ─── Token Encryption Utility ─────────────────────────────────────────────────
// AES-GCM 256-bit encryption for sensitive Meta Access Tokens stored in Supabase.
//
// Key derivation: PBKDF2(VITE_ENCRYPTION_KEY, userId, 100k iterations, SHA-256)
// This means two keys are required to decrypt:
//   1. The deployed app's VITE_ENCRYPTION_KEY (env var, never committed)
//   2. The user's UUID (lives in auth.users, only visible to service role)
//
// Add to .env.local:
//   VITE_ENCRYPTION_KEY=<32+ random chars — generate with: openssl rand -base64 32>
//
// Wire-format: base64( iv[12] || ciphertext )

const ALGO    = 'AES-GCM';
const KEY_LEN = 256;
const ITERS   = 100_000;

// ─── Key derivation ────────────────────────────────────────────────────────────

async function deriveKey(userId: string): Promise<CryptoKey> {
  const masterSecret = (import.meta.env.VITE_ENCRYPTION_KEY as string | undefined) ?? 'dev-fallback-key-replace-in-prod';
  const keyMaterial  = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterSecret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       new TextEncoder().encode(userId),   // unique per user
      iterations: ITERS,
      hash:       'SHA-256',
    },
    keyMaterial,
    { name: ALGO, length: KEY_LEN },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ─── Encrypt ──────────────────────────────────────────────────────────────────

/**
 * Encrypts a plaintext token for a specific user.
 * Returns a base64-encoded string safe to store in the DB.
 */
export async function encryptToken(plaintext: string, userId: string): Promise<string> {
  if (!plaintext) return '';
  const key = await deriveKey(userId);
  const iv  = crypto.getRandomValues(new Uint8Array(12));       // 96-bit IV
  const enc = await crypto.subtle.encrypt({ name: ALGO, iv }, key, new TextEncoder().encode(plaintext));

  // Pack iv || ciphertext → base64
  const packed = new Uint8Array(iv.byteLength + enc.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(enc), iv.byteLength);
  return btoa(String.fromCharCode(...packed));
}

// ─── Decrypt ──────────────────────────────────────────────────────────────────

/**
 * Decrypts a token previously encrypted with encryptToken.
 * Falls back to returning the ciphertext as-is if it cannot be decrypted
 * (handles legacy plaintext rows and dev environments).
 */
export async function decryptToken(ciphertext: string, userId: string): Promise<string> {
  if (!ciphertext) return '';
  try {
    const packed = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
    const iv     = packed.slice(0, 12);
    const data   = packed.slice(12);
    const key    = await deriveKey(userId);
    const dec    = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
    return new TextDecoder().decode(dec);
  } catch {
    // Not encrypted (legacy plaintext) — return raw so agents still work
    return ciphertext;
  }
}
