/**
 * Helpers for reasoning about which sites a user has an authenticated browser
 * session for. `loggedInOrigins` come back from the API as https origins
 * derived from captured cookie domains (e.g. "https://supabase.com",
 * "https://app.supabase.com"). The /new flow needs to answer a softer
 * question — "is the site I'm about to demo already signed in?" — so we match
 * by registrable domain, not just exact origin.
 */

/** Extract a lowercase hostname from a possibly scheme-less URL, or null. */
export function hostOf(input: string | null | undefined): string | null {
  if (!input || !input.trim()) return null;
  let s = input.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    return new URL(s).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Naive registrable domain (last two labels). Good enough for a UX hint. */
function registrableDomain(host: string): string {
  const parts = host.split('.');
  return parts.length <= 2 ? host : parts.slice(-2).join('.');
}

/** Hostname without a leading "www." — for display. */
export function prettyHost(input: string | null | undefined): string {
  const h = hostOf(input);
  return h ? h.replace(/^www\./, '') : (input ?? '');
}

/**
 * True when the user already has a saved session that covers `url` — either the
 * exact host or any host under the same registrable domain.
 */
export function isAuthenticatedFor(url: string | null | undefined, origins: string[]): boolean {
  const host = hostOf(url);
  if (!host) return false;
  const reg = registrableDomain(host);
  return origins.some((o) => {
    const oh = hostOf(o);
    if (!oh) return false;
    return oh === host || registrableDomain(oh) === reg;
  });
}
