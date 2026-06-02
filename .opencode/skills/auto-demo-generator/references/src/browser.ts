import { chromium as pwChromium, type Browser, type BrowserContext } from 'playwright-core';
import { launchPersistentContext as cloakLaunchPersistentContext } from 'cloakbrowser';

export type BrowserSession =
  | { kind: 'ephemeral'; browser: Browser; context: BrowserContext; close: () => Promise<void> }
  | { kind: 'attached';   browser: Browser; context: BrowserContext; close: () => Promise<void> }
  | { kind: 'persistent'; context: BrowserContext; close: () => Promise<void> };

export interface OpenBrowserOptions {
  /** Override the CDP attach URL. Defaults to `CLOAK_CDP_URL` env var. */
  cdpUrl?: string | null;
  /**
   * Persistent user-data dir for a stealth browser. Defaults to
   * `CLOAK_PROFILE_DIR` env var. When set, launches CloakBrowser with the
   * user's saved cookies / local storage.
   */
  profileDir?: string | null;
  /** Used by the ephemeral path (no CDP, no profile). */
  headless?: boolean;
  launchArgs?: string[];
  contextOptions?: Parameters<Browser['newContext']>[0];
}

/**
 * Open a Chromium browser, transparently choosing between:
 *
 *  1. **Attach to a running stealth browser** (when `CLOAK_CDP_URL` is set).
 *     The worker injects this env var whenever a per-user CloakBrowser
 *     context is alive, so all passes in the auto-demo pipeline share the
 *     same authenticated Chromium — no re-launches, no cookie drift.
 *  2. **Launch a stealth persistent context** (when `CLOAK_PROFILE_DIR` is
 *     set but no CDP is available). Uses `cloakbrowser.launchPersistentContext`
 *     so the engine still picks up the user's saved session without needing
 *     a long-running parent process.
 *  3. **Launch an ephemeral headless browser** (the legacy fallback when
 *     neither env var is set). Identical to the old `chromium.launch()`
 *     behaviour — used for standalone / dev runs.
 *
 * The returned `BrowserSession.kind` discriminates the lifecycle: callers
 * MUST call `session.close()` to release the context and (for `attached` /
 * `persistent`) detach cleanly.
 */
export async function openBrowser(opts: OpenBrowserOptions = {}): Promise<BrowserSession> {
  const envCdp = process.env.CLOAK_CDP_URL;
  const cdpUrl = opts.cdpUrl === null ? null : (opts.cdpUrl ?? envCdp ?? null);
  const envProfile = process.env.CLOAK_PROFILE_DIR;
  const profileDir = opts.profileDir === null ? null : (opts.profileDir ?? envProfile ?? null);

  if (cdpUrl) {
    console.log(`[browser] Attaching to stealth CDP at ${cdpUrl}`);
    const browser = await pwChromium.connectOverCDP(cdpUrl);
    // connectOverCDP returns a Browser that exposes already-open contexts.
    // Reuse the first one (matches the worker's per-user profile) or open
    // a new one if none exists yet.
    const context = browser.contexts()[0] ?? await browser.newContext(opts.contextOptions);
    return {
      kind: 'attached',
      browser,
      context,
      close: async () => {
        try { await context.close(); } catch { /* already closed */ }
        try { await browser.close(); } catch { /* detach only */ }
      },
    };
  }

  if (profileDir) {
    console.log(`[browser] Launching persistent CloakBrowser context at ${profileDir}`);
    const context = await cloakLaunchPersistentContext({
      userDataDir: profileDir,
      headless: opts.headless ?? true,
      ...(opts.contextOptions as any),
    });
    return {
      kind: 'persistent',
      context,
      close: async () => {
        try { await context.close(); } catch { /* already closed */ }
      },
    };
  }

  console.log('[browser] No CLOAK_CDP_URL or CLOAK_PROFILE_DIR set — launching ephemeral headless browser');
  const browser = await pwChromium.launch({
    headless: opts.headless ?? true,
    args: opts.launchArgs,
  });
  const context = await browser.newContext(opts.contextOptions);
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
