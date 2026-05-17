// Cloudflare Turnstile throws TrustedScript errors in some environments
// This is a minimal polyfill to allow it to execute gracefully
if (typeof window !== 'undefined' && window.trustedTypes && window.trustedTypes.createPolicy) {
  try {
    window.trustedTypes.createPolicy('default', {
      createHTML: (string, sink) => string,
      createScript: (string, sink) => string,
      createScriptURL: (string, sink) => string,
    });
  } catch (e) {
    // Policy may already exist
  }
}
