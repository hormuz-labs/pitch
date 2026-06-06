export const API_URL = import.meta.env.VITE_API_URL || '/api';

// CloakBrowser Manager base URL (already includes the manager's `/api` prefix).
// In dev this stays empty so requests use the relative `/manager-api` and
// `/api/profiles` paths that vite.config.ts proxies to http://127.0.0.1:8080.
// In production (Vercel) the SPA can't proxy, so point this at the manager's
// public origin, e.g. VITE_MANAGER_URL="https://cloakbrowser-manager.trypitch.co".
export const MANAGER_URL = import.meta.env.VITE_MANAGER_URL || '';
