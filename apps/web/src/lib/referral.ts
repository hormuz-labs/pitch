/**
 * Referral-code capture & persistence.
 *
 * Flow: a visitor arrives via `https://trypitch.co/r/<CODE>` → the API
 * records the click and 302-redirects to `https://trypitch.co?ref=<CODE>`.
 * On the first page load, we read `?ref=` from the URL, validate the code
 * shape, and persist it in localStorage so it survives Clerk's auth round-trip
 * and the SPA's client-side navigation. The API calls that need attribution
 * (`/users/sync`, `/checkout`) read the stored code and pass it in the body;
 * the API resolves the code back to an affiliate and records the lead /
 * conversion.
 *
 * We intentionally do NOT rely on the `aff` httpOnly cookie: in production
 * the web app (trypitch.co) and the API (api.trypitch.co) live on different
 * origins, and the cross-origin rewrite that serves `/r/<CODE>` strips the
 * Set-Cookie before the browser can store it — so the cookie never reaches
 * the API. Passing the code in the request body is robust against any
 * cookie/proxy shenanigans.
 */

const STORAGE_KEY = 'pitch_ref_code';
const STORED_AT_KEY = 'pitch_ref_stored_at';
// 30 days — matches the cookie max-age that /r/:code used to set.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Affiliate codes are generated as `PREFIX-XXXX` (uppercase letters/digits,
// a single hyphen, ≤ 11 chars). The regex tolerates up to 8 chars per side
// for forward-compat. Reject anything else so a malicious `?ref=<script>`
// can't land in our request bodies.
const CODE_RE = /^[A-Z0-9]{1,8}-[A-Z0-9]{1,8}$/;

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* private mode / quota */ }
}
function safeRemove(key: string): void {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** Returns the persisted referral code if it was stored within TTL_MS, else null. */
export function getRefCode(): string | null {
  const code = safeGet(STORAGE_KEY);
  const storedAtRaw = safeGet(STORED_AT_KEY);
  if (!code || !storedAtRaw) return null;
  const storedAt = Number(storedAtRaw);
  if (!Number.isFinite(storedAt) || Date.now() - storedAt > TTL_MS) {
    safeRemove(STORAGE_KEY);
    safeRemove(STORED_AT_KEY);
    return null;
  }
  return code;
}

/**
 * Read `?ref=` from the current URL. If present and well-formed, persist it
 * (overwriting any prior code — the most recent referrer wins) and strip the
 * query param from the address bar so it isn't leaked via Referer on
 * subsequent navigations.
 *
 * Safe to call on every mount: it only acts when `?ref=` is present.
 */
export function captureRefFromUrl(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('ref');
  if (!raw) return;
  const code = raw.toUpperCase();
  if (!CODE_RE.test(code)) return;

  safeSet(STORAGE_KEY, code);
  safeSet(STORED_AT_KEY, String(Date.now()));

  // Clean the URL so the code isn't visible / sent in future requests.
  params.delete('ref');
  const cleaned = params.toString();
  const next = window.location.pathname + (cleaned ? `?${cleaned}` : '') + window.location.hash;
  try {
    window.history.replaceState({}, '', next);
  } catch { /* ignore */ }
}
