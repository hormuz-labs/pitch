/**
 * The studio's render browser. This is ordinary local Playwright Chromium;
 * CloakBrowser is reserved for interactive authentication and demo sessions.
 *
 * Local pages are still served through request interception so this works in
 * the same constrained runtime as network pages:
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
 * Env: BROWSER_START_TIMEOUT_MS bounds process startup.
 */
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

/** Synthetic origin the workspace is served under. Never resolved by DNS. */
export const LOCAL_ORIGIN = "http://studio.local";

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
 * Each caller owns its browser process. `serveLocal` (default true) wires the
 * studio.local file route, and close always terminates the process.
 */
export async function openStudioBrowser({
  viewport = { width: 1920, height: 1080 },
  deviceScaleFactor = 1,
  serveLocal = true,
  log = console.log,
} = {}) {
  const timeout = Number(process.env.BROWSER_START_TIMEOUT_MS || 60_000);
  const browser = await chromium.launch({ headless: true, timeout });
  const context = await browser.newContext({ viewport, deviceScaleFactor });

  if (serveLocal) await serveLocalFiles(context);

  return {
    mode: "local",
    endpoint: null,
    browser,
    context,
    async newPage() {
      return context.newPage();
    },
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    },
  };
}
