/**
 * The studio's browser — one CloakBrowser profile, reached over CDP.
 *
 * There is no Chromium in the studio image (Dockerfile.base sets
 * PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 and installs only Playwright's ffmpeg),
 * so `chromium.launch()` fails there and the agent's next move used to be
 * `npx playwright install chromium` — a 150MB download inside a job. Every
 * browser the motion scripts need comes from the CloakBrowser Manager
 * instead: it is the anti-detect browser that gets recon past bot walls, and
 * it is already running next to the studio.
 *
 * Two things follow from the browser being somewhere else:
 *
 *   • It cannot see the workspace. `file://` is meaningless to it, so the
 *     local page is served INTO it by request interception: `localPageUrl()`
 *     maps an absolute path onto http://studio.local<abs-path>, and
 *     `serveLocalFiles()` fulfils every request under that origin from disk.
 *     Because the URL path IS the filesystem path, `../../engine/js/x.js`
 *     inside index.html resolves exactly as it does on disk.
 *
 *   • Browser launch flags are not ours to pass. A 2x capture is a
 *     `deviceScaleFactor` on the context plus `clip.scale` on
 *     Page.captureScreenshot (see capture.mjs), not
 *     --force-device-scale-factor.
 *
 * Env:
 *   CLOAK_MANAGER_URL         manager base URL (default http://127.0.0.1:8080)
 *   CLOAK_MANAGER_AUTH_TOKEN  bearer token, when the manager has auth on
 *   STUDIO_CDP_URL            a CDP endpoint to use verbatim, skipping the manager
 *   STUDIO_CDP_PROFILE        manager profile name to reuse (default studio-motion)
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

/** Synthetic origin the workspace is served under. Never resolved by DNS. */
export const LOCAL_ORIGIN = "http://studio.local";

const DEFAULT_PROFILE = "studio-motion";

export function managerBaseUrl() {
  return (process.env.CLOAK_MANAGER_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
}

export function managerHeaders(extra = {}) {
  const h = { ...extra };
  const token = process.env.CLOAK_MANAGER_AUTH_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function studioProfileName() {
  return process.env.STUDIO_CDP_PROFILE || DEFAULT_PROFILE;
}

/** HTTP CDP endpoint for a manager profile — what connectOverCDP takes. */
export function cdpHttpUrl(profileId, base = managerBaseUrl()) {
  return `${base}/api/profiles/${profileId}/cdp`;
}

async function managerFetch(path, init) {
  const res = await fetch(managerBaseUrl() + path, {
    ...init,
    headers: managerHeaders(init?.headers ?? {}),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Manager ${init?.method ?? "GET"} ${path} → ${res.status} ${body}`);
  return body ? JSON.parse(body) : null;
}

/**
 * Ensure the studio's shared CloakBrowser profile exists and is running, and
 * return its CDP URL. The profile is deliberately left running afterwards:
 * motion_check runs after every batch of shots and a warm browser turns a
 * 4-second launch into a reconnect.
 */
export async function ensureStudioProfile({ name = studioProfileName(), timeoutMs = 60_000, log = () => {} } = {}) {
  const profiles = await managerFetch("/api/profiles");
  let profile = profiles.find((p) => p.name === name);
  if (!profile) {
    log(`creating CloakBrowser profile ${name}`);
    profile = await managerFetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Name only: the manager rejects fields it does not know, and newer
      // images have no `platform`; its 1920x1080 default is the render size.
      body: JSON.stringify({ name }),
    });
  }
  if (profile.status !== "running") {
    log(`launching CloakBrowser profile ${name}`);
    await managerFetch(`/api/profiles/${profile.id}/launch`, { method: "POST" });
  }

  const url = cdpHttpUrl(profile.id);
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/json/version`, { headers: managerHeaders() });
      if (res.ok) return url;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err?.message ?? String(err);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`CloakBrowser profile ${name} never exposed CDP within ${timeoutMs}ms (${lastError})`);
}

/** An explicit endpoint (--cdp, then STUDIO_CDP_URL) or null to go through the manager. */
export function explicitCdpUrl(flag) {
  const v = flag ?? process.env.STUDIO_CDP_URL;
  return v && v !== true ? String(v) : null;
}

/** True when a Chromium is actually installed locally — we never install one. */
export function localChromiumAvailable() {
  try {
    const p = chromium.executablePath();
    return Boolean(p) && existsSync(p);
  } catch {
    return false;
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".txt": "text/plain; charset=utf-8",
};

export function contentTypeFor(path) {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * URL for a local page or asset. The path component IS the absolute
 * filesystem path, so relative references inside the page resolve to the
 * right files without any base-href rewriting.
 */
export function localPageUrl(filePath, query = "") {
  const abs = resolve(filePath);
  const suffix = query ? (query.startsWith("?") ? query : `?${query}`) : "";
  return `${LOCAL_ORIGIN}${abs.split("/").map(encodeURIComponent).join("/")}${suffix}`;
}

/** The filesystem path a studio.local URL points at, or null if it is not ours. */
export function localPathFromUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (`${u.protocol}//${u.host}` !== LOCAL_ORIGIN) return null;
  const path = decodeURIComponent(u.pathname);
  return path.startsWith("/") ? path : null;
}

/**
 * Serve http://studio.local/<abs-path> out of the local filesystem for every
 * page in `target` (a BrowserContext or a Page).
 *
 * The route pattern is scoped to the synthetic origin on purpose: a recon run
 * pulls hundreds of requests off a real site, and none of them should go
 * anywhere near Playwright's interception path.
 */
export async function serveLocalFiles(target) {
  await target.route(`${LOCAL_ORIGIN}/**`, async (route) => {
    const path = localPathFromUrl(route.request().url());
    if (path === null) return route.continue();
    try {
      const body = await readFile(path);
      return route.fulfill({ status: 200, contentType: contentTypeFor(path), body });
    } catch (err) {
      return route.fulfill({
        status: err?.code === "ENOENT" ? 404 : 500,
        contentType: "text/plain; charset=utf-8",
        body: `${err?.code ?? "ERROR"} ${path}`,
      });
    }
  });
}

/**
 * Open a browser for a motion script.
 *
 * Resolution order: `cdp` (the --cdp flag) → STUDIO_CDP_URL → the CloakBrowser
 * Manager. A local Chromium is used only when the manager cannot be reached
 * AND one is already installed; we never install one, and never tell the agent
 * to. `serveLocal` (default true) wires the studio.local file route.
 */
export async function openStudioBrowser({
  cdp = null,
  viewport = { width: 1920, height: 1080 },
  deviceScaleFactor = 1,
  serveLocal = true,
  log = console.log,
} = {}) {
  let endpoint = explicitCdpUrl(cdp);
  let managerError = null;
  if (!endpoint) {
    try {
      endpoint = await ensureStudioProfile({ log: (m) => log(`   ${m}`) });
    } catch (err) {
      managerError = err;
    }
  }

  let browser;
  let context;
  let mode;
  if (endpoint) {
    browser = await chromium.connectOverCDP(endpoint);
    context = await browser.newContext({ viewport, deviceScaleFactor });
    mode = "cdp";
  } else if (localChromiumAvailable()) {
    log(`   CloakBrowser unavailable (${managerError?.message ?? "no endpoint"}); using the local Chromium`);
    browser = await chromium.launch();
    context = await browser.newContext({ viewport, deviceScaleFactor });
    mode = "local";
  } else {
    throw new Error(
      `No browser available.\n` +
        `   The CloakBrowser Manager at ${managerBaseUrl()} could not be reached: ${managerError?.message ?? "unknown error"}\n` +
        `   This image ships no Chromium on purpose — do NOT run "playwright install".\n` +
        `   Point CLOAK_MANAGER_URL at a running manager, or pass --cdp=<endpoint>.`,
    );
  }

  if (serveLocal) await serveLocalFiles(context);

  return {
    mode,
    endpoint,
    browser,
    context,
    async newPage() {
      return context.newPage();
    },
    async close() {
      await context.close().catch(() => {});
      // For a CDP connection this only disconnects — the CloakBrowser stays
      // warm for the next motion_* call.
      await browser.close().catch(() => {});
    },
  };
}
