// ─── Deep Link Utilities ───────────────────────────────────────────────────────
// Handles Supabase OAuth redirects for web browsers and mobile webviews.
//
// Web:    redirectTo = window.location.origin + /auth/callback
// Mobile: redirectTo = scaleai://auth/callback  (custom URL scheme)
//
// To register the scheme in Capacitor, add to capacitor.config.ts:
//   server: { iosScheme: 'scaleai', androidScheme: 'scaleai' }
// And in Info.plist / AndroidManifest.xml add the scaleai:// URL type.

const MOBILE_SCHEME   = 'scaleai://auth/callback';
const WEB_CALLBACK    = '/auth/callback';

// ─── Environment detection ─────────────────────────────────────────────────────

/**
 * Returns true when the app is running inside a mobile webview.
 * Detects: Capacitor, Cordova, Android WebView, and iOS WKWebView.
 */
export function isMobileWebView(): boolean {
  if (typeof window === 'undefined') return false;

  const win = window as unknown as Record<string, unknown>;
  // Capacitor runtime injects window.Capacitor
  if (win['Capacitor'] !== undefined) return true;
  // Cordova runtime
  if (win['cordova']   !== undefined) return true;

  const ua = navigator.userAgent;

  // Android WebView marker
  if (/wv\b/i.test(ua) || /WebView/i.test(ua)) return true;

  // iOS WKWebView: has AppleWebKit but no "Safari" in UA
  if (/iPhone|iPad|iPod/.test(ua) && /AppleWebKit/.test(ua) && !/Safari/.test(ua)) return true;

  return false;
}

// ─── OAuth redirect URL ────────────────────────────────────────────────────────

/**
 * Returns the correct `redirectTo` URL to pass to supabase.auth.signInWithOAuth().
 * - Mobile webview → custom scheme (scaleai://auth/callback)
 * - Web browser    → current origin + /auth/callback
 */
export function getOAuthRedirectUrl(): string {
  if (isMobileWebView()) return MOBILE_SCHEME;
  return `${window.location.origin}${WEB_CALLBACK}`;
}

// ─── Callback parser ───────────────────────────────────────────────────────────

/**
 * Parses the tokens Supabase injects into the URL after a successful OAuth redirect.
 * Call this in your /auth/callback route, or in the Capacitor App URL listener.
 *
 * @param url - The full URL string to parse (defaults to window.location.href)
 */
export function parseOAuthCallback(url?: string): {
  accessToken:  string | null;
  refreshToken: string | null;
  type:         string | null;
} {
  const raw = url ?? (typeof window !== 'undefined' ? window.location.href : '');
  const hashIdx = raw.indexOf('#');
  const fragment = hashIdx >= 0 ? raw.slice(hashIdx + 1) : '';
  const queryIdx = raw.indexOf('?');
  const query    = queryIdx >= 0 ? raw.slice(queryIdx + 1, hashIdx >= 0 ? hashIdx : undefined) : '';

  const hash   = new URLSearchParams(fragment);
  const params = new URLSearchParams(query);

  const get = (key: string) => hash.get(key) ?? params.get(key);

  return {
    accessToken:  get('access_token'),
    refreshToken: get('refresh_token'),
    type:         get('type'),           // e.g. 'recovery', 'signup', 'magiclink'
  };
}
