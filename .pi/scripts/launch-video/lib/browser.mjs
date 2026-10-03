/**
 * The studio's browsers. Two engines, and the order matters:
 *
 *   • Chromium (plain headless Playwright) is the default for everything
 *     here: our own pages (capture, check, review, audit) through
 *     `openStudioBrowser`, and a product's live site through `openLivePage`.
 *   • CloakBrowser, a stealth Chromium build, is the second try for a live
 *     site that walls Chromium off (Cloudflare turns plain headless Chromium
 *     away: replit.com answers 403 "Attention Required"). It has its own
 *     quirks (Playwright's networkidle timeout never fires on it) and, under
 *     a licence, a seat count, so it is used only when needed. Logged-in
 *     sessions are the exception: they start in CloakBrowser
 *     (apps/api/src/render/utils/cloak-browser.ts), not here.
 *
 * Local pages are served through request interception:
 *
 *   • The browser cannot see the workspace. `file://` is meaningless to it,
 *     so the local page is served INTO it by request interception:
 *     `localPageUrl()` maps an absolute path onto http://studio.local<abs-path>,
 *     and `serveLocalFiles()` fulfils every request under that origin from
 *     disk. Because the URL path IS the filesystem path, `../../engine/js/x.js`
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
import { launch as launchCloak } from "cloakbrowser";
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

const startTimeout = () => Number(process.env.BROWSER_START_TIMEOUT_MS || 60_000);
const launchChromium = () => chromium.launch({ headless: true, timeout: startTimeout() });

async function openWith(browser, { viewport, deviceScaleFactor, serveLocal }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  if (serveLocal) await serveLocalFiles(context);
  return {
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

/**
 * A browser for our own pages. Each caller owns its browser process.
 * `serveLocal` (default true) wires the studio.local file route, and close
 * always terminates the process.
 */
export async function openStudioBrowser({
  viewport = { width: 1920, height: 1080 },
  deviceScaleFactor = 1,
  serveLocal = true,
} = {}) {
  return openWith(await launchChromium(), { viewport, deviceScaleFactor, serveLocal });
}

/**
 * Wait for a live page's network to go quiet, at most `ms`. Many product
 * sites never go quiet (analytics, long-polls), and Playwright's own timeout
 * on networkidle does not fire under CloakBrowser: a 10s cap waited 812s on
 * replit.com. Our own timer bounds it.
 */
export async function settle(page, ms) {
  let timer;
  await Promise.race([
    page.waitForLoadState("networkidle").catch(() => {}),
    new Promise((done) => { timer = setTimeout(done, ms); }),
  ]);
  clearTimeout(timer);
}

/** What a site shows a browser it refuses: Cloudflare, Akamai and the like. */
const WALL = /sorry, you have been blocked|you are unable to access|attention required|checking your browser|verify you are (a )?human|access denied|request blocked|just a moment/i;

/** Whether a loaded page is a bot wall rather than the site. */
export async function isWalled(page, response) {
  if (response && [403, 429, 503].includes(response.status())) return true;
  const title = await page.title().catch(() => "");
  const text = await page.evaluate(() => (document.body?.innerText || "").slice(0, 600)).catch(() => "");
  return WALL.test(`${title}\n${text}`);
}

async function launchCloakBrowser() {
  // A script never downloads a browser mid-run or nags about wrapper updates,
  // and the image lacks the Windows fonts the fingerprint claims by design.
  process.env.CLOAKBROWSER_AUTO_UPDATE ??= "false";
  process.env.CLOAKBROWSER_SUPPRESS_FONT_WARNING ??= "1";
  return launchCloak({ headless: true, launchOptions: { timeout: startTimeout() } });
}

/**
 * Open a product's live page: Chromium first, and only if the site walls it
 * off, the same URL once more in CloakBrowser. Returns the browser handle
 * with the loaded `page`, its `response`, the `engine` that loaded it, and
 * `walled: true` when both were refused (the page is then the wall). A URL
 * that does not load at all throws; the other engine would not fare better.
 * `prepare(page)` runs before navigation (recon listens for font files).
 */
export async function openLivePage(url, {
  viewport = { width: 1440, height: 900 },
  deviceScaleFactor = 1,
  waitUntil = "domcontentloaded",
  timeout = 45_000,
  prepare,
} = {}) {
  const engines = [
    ["Chromium", launchChromium],
    ["CloakBrowser", launchCloakBrowser],
  ];
  for (const [i, [engine, launch]] of engines.entries()) {
    const live = await openWith(await launch(), { viewport, deviceScaleFactor, serveLocal: false });
    const page = await live.newPage();
    let response;
    try {
      await prepare?.(page);
      response = await page.goto(String(url), { waitUntil, timeout });
    } catch (err) {
      await live.close();
      throw err;
    }
    const walled = await isWalled(page, response);
    if (!walled || i === engines.length - 1) return { ...live, page, response, engine, walled };
    await live.close();
  }
}

/**
 * The film's stage as the loaded page reports it (`window.__STAGE`, set by
 * the engine from `SHOTS.format`): 1920×1080 for 16:9, 1080×1920 for 9:16.
 * A page without the engine is treated as the classic 1920×1080 stage.
 */
export async function stageOf(page) {
  const s = await page.evaluate(() => window.__STAGE || null).catch(() => null);
  return s && s.w > 0 && s.h > 0
    ? { w: Number(s.w), h: Number(s.h), format: String(s.format || "16:9") }
    : { w: 1920, h: 1080, format: "16:9" };
}

/** Resize a loaded tab to its film's stage; returns the stage. */
export async function fitStage(page) {
  const stage = await stageOf(page);
  const vp = page.viewportSize();
  if (!vp || vp.width !== stage.w || vp.height !== stage.h) {
    await page.setViewportSize({ width: stage.w, height: stage.h });
  }
  return stage;
}

/**
 * Seek the film and wait until it is ready to be photographed. The engine's
 * `__SEEK` returns a promise while footage decodes the requested frames;
 * page.evaluate awaits it, so a screenshot never shows the previous frame.
 */
export function seekFilm(page, t) {
  return page.evaluate((tt) => window.__SEEK(tt), t);
}
