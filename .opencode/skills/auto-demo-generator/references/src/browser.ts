import { type Browser, type BrowserContext } from 'playwright-core';
import { launch as cloakLaunch } from 'cloakbrowser';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type BrowserSession =
  | { kind: 'ephemeral'; browser: Browser; context: BrowserContext; close: () => Promise<void> };

export interface OpenBrowserOptions {
  /** Override the CDP attach URL. Defaults to `CLOAK_CDP_URL` env var. */
  cdpUrl?: string | null;
  /**
   * Persistent user-data dir for a stealth browser. Defaults to
   * `CLOAK_PROFILE_DIR` env var. When set, loads saved cookies and
   * storage state from the profile dir into the context.
   */
  profileDir?: string | null;
  /** Used by the ephemeral path (no CDP, no profile). */
  headless?: boolean;
  launchArgs?: string[];
  contextOptions?: Parameters<Browser['newContext']>[0];
}

/**
 * Open a CloakBrowser, transparently choosing between:
 *
 *  1. **Load cookies from profile dir** (when `CLOAK_PROFILE_DIR` is
 *     set). Uses `cloakbrowser.launch()` and loads `storage_state.json`
 *     from the profile dir to restore saved cookies/localStorage.
 *  2. **Launch an ephemeral headless browser** (the default fallback).
 *     Uses `cloakbrowser.launch()`.
 *
 * Note: The CDP attach path (`CLOAK_CDP_URL`) has been removed because
 * `playwright-core`'s `connectOverCDP` has WebSocket version-skew issues
 * with CloakBrowser Chrome 145+. The `launch()` path is the only reliable
 * approach for standalone/dev runs. For production, use `CLOAK_PROFILE_DIR`.
 *
 * Also note: `cloakbrowser.launchPersistentContext` does NOT support
 * `recordVideo`, so we always use `launch()` + `newContext()` and
 * optionally restore cookies from the profile dir.
 */
export async function openBrowser(opts: OpenBrowserOptions = {}): Promise<BrowserSession> {
  const envProfile = process.env.CLOAK_PROFILE_DIR;
  const profileDir = opts.profileDir === null ? null : (opts.profileDir ?? envProfile ?? null);

  console.log('[browser] Launching CloakBrowser stealth browser');
  const browser = await cloakLaunch({
    headless: opts.headless ?? true,
    args: opts.launchArgs,
  });
  const context = await browser.newContext(opts.contextOptions);

  // If a profile dir is specified, restore saved cookies/storage from storage_state.json
  if (profileDir) {
    const storageFile = join(profileDir, 'storage_state.json');
    if (existsSync(storageFile)) {
      try {
        const state = JSON.parse(readFileSync(storageFile, 'utf8'));
        if (state.cookies?.length) {
          await context.addCookies(state.cookies);
          console.log(`[browser] Restored ${state.cookies.length} cookies from ${storageFile}`);
        }
      } catch (e) {
        console.warn(`[browser] Failed to load storage state from ${storageFile}:`, e);
      }
    } else {
      console.log(`[browser] No storage_state.json found at ${storageFile} — starting fresh`);
    }
  }

  return {
    kind: 'ephemeral',
    browser,
    context,
    close: async () => {
      try { await context.close(); } catch { /* already closed */ }
      await browser.close();
    },
  };
}
