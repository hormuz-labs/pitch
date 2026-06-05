# CloakBrowser

Stealth Chromium for sites that block vanilla headless browsers. CloakBrowser is a
drop-in replacement for `playwright-core`'s chromium with C++-level fingerprint
patches (canvas, WebGL, audio, plugins, permissions, etc.). The npm package bundles
its own Chromium build, so you do **not** need to run `playwright install`.

This repo uses CloakBrowser to give every user a persistent, anti-detect browser
profile that survives across authentication sessions and automation jobs.

## 1. Install

### 1.1 Add the npm package

`cloakbrowser` and a matching `playwright-core` must live in the same `node_modules`
tree. Pin both — they must agree on the major version.

```bash
# from repo root
bun add cloakbrowser@0.3.31
bun add -d playwright-core@1.60.0
```

> The numbers above are the versions this repo is pinned to. Newer minor versions
> of `playwright-core` will fail to resolve the bundled Chromium, so do **not**
> float them.

Both `apps/api/package.json` and `apps/worker/package.json` already list these
dependencies.

### 1.2 First-run Chromium download

The first time `cloakbrowser` is imported, it downloads its patched Chromium
build (~150 MB) to `~/.cloakbrowser/`. Subsequent runs reuse that cache.

```bash
# Force the download so failures surface early, instead of mid-job
bun -e "import('cloakbrowser').then(() => console.log('ok'))"
```

Expected: prints `ok`. On a fresh machine, expect a one-time download to
`~/.cloakbrowser/chromium-<version>/`.

### 1.3 Verify the binary

```bash
ls -la ~/.cloakbrowser/
# should show chromium-<version>/Chromium.app/Contents/MacOS/Chromium  (macOS)
# or chromium-<version>/chrome-linux/chrome                       (linux)
```

You can also launch it directly to confirm it runs:

```bash
~/.cloakbrowser/chromium-145.0.7632.109.2/Chromium.app/Contents/MacOS/Chromium \
  --version
```

## 2. Use with agent-browser

`agent-browser` can attach to any CDP endpoint via `connect <port>`. The pattern
is: launch CloakBrowser with a persistent user-data dir, expose CDP on a port,
then point agent-browser at it.

### 2.1 Launch a profile

This repo ships a launcher that handles boot + ready signalling. From the repo
root:

```bash
# Create a profile dir, then launch
mkdir -p ~/.cloak-profiles/my-test
bun apps/api/scripts/cloak-launch.mjs \
  --profile-dir ~/.cloak-profiles/my-test \
  --port 9242 \
  --start-url https://chat.deepseek.com
```

Expected log (JSON-per-line on stdout):

```json
{"type":"launching","port":9242,"profileDir":"...","headless":false}
{"type":"ready","url":"http://127.0.0.1:9242","pid":12345}
```

The launcher stays in the foreground. Kill it with `Ctrl-C` (or `SIGTERM`); it
saves `storage_state.json` into the profile dir before exiting.

### 2.2 Connect agent-browser

In a second terminal:

```bash
agent-browser --session my-test connect 9242
agent-browser --session my-test open https://chat.deepseek.com
agent-browser --session my-test snapshot
```

Cookies, local storage, and service workers persist in `~/.cloak-profiles/my-test/`.
Relaunching the launcher and reconnecting picks them up unchanged.

### 2.3 Tear down

```bash
# In the launcher's terminal
Ctrl-C
# Or, from elsewhere:
kill -TERM <pid>
```

The launcher writes `<profileDir>/storage_state.json` on shutdown, ready for
S3 sync in a later phase.

## 3. Use with Playwright (in scripts)

If you're writing a one-off Playwright script and want stealth, swap
`playwright-core` for `cloakbrowser`:

```ts
// Instead of:
// import { chromium } from 'playwright-core';
// const browser = await chromium.launch({ headless: true });

import { chromium } from 'cloakbrowser'; // same API surface
import { join } from 'node:path';

const userDataDir = join(process.env.HOME!, '.cloak-profiles', 'my-test');

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  // standard playwright launch options
  viewport: { width: 1280, height: 720 },
});

const page = await context.newPage();
await page.goto('https://bot.sannysoft.com'); // fingerprint test
await page.screenshot({ path: 'fp.png', fullPage: true });
await context.close();
```

Two important details:

- **Use `launchPersistentContext`, not `launch`.** Stealth patches and the
  user's saved cookies live in the user-data dir, so the context **must** be
  persistent. `launch` throws when the same profile dir is reused.
- **One process per profile dir.** Chromium locks the user-data dir at runtime;
  two concurrent `launchPersistentContext` calls on the same dir will fail with
  a "Browser is already running" error. The API and worker in this repo enforce
  this by allocating exclusive ports (9300–9399 for the API, 9400–9499 for the
  worker).

## 4. Project workflow

This repo integrates CloakBrowser in three places:

| Component | Role | Port range |
| --- | --- | --- |
| `apps/api` (`/sessions` page) | User opens a headed browser locally, logs in, state is snapshotted | 9300–9399 |
| `apps/worker` (per-job) | Headless CloakBrowser with the user's profile, agent connects via CDP | 9400–9499 |
| `apps/api/scripts/cloak-launch.mjs` | Shared launcher (boots Chromium, signals ready over stdout, snapshots on exit) | — |

### End-to-end flow

1. User signs in on `/sessions`, picks a site, clicks **Authenticate with URL**.
2. API spawns `cloak-launch.mjs` (headed) with `~/.cloak-profiles/user-<id>/`.
3. User logs in manually, clicks **I'm done**. API sends `SIGTERM`; launcher
   saves `storage_state.json` and exits.
4. User queues a job on `/new`.
5. Worker calls `startBrowserContext(userId)`, which spawns the same launcher
   in `--headless` mode against the same profile dir. CDP URL is injected into
   the OpenCode prompt as `--cdp-url http://127.0.0.1:94xx`.
6. The OpenCode agent calls `agent-browser --cdp-url http://127.0.0.1:94xx open <URL>`
   to drive the stealth browser, reusing the user's cookies.
7. After 5 minutes of idleness, the worker GC reaper closes the headless
   browser. Profile dir is preserved for next time.

## 5. Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `CLOAK_PROFILE_ROOT` | `~/.cloak-profiles` | Root dir for per-user profile dirs |
| `CLOAK_BROWSER_API_PORT_MIN` / `_MAX` | `9300` / `9399` | API port pool |
| `WORKER_BROWSER_CONTEXT_TTL_MS` | `300000` (5 min) | Idle TTL for worker browser contexts |
| `WORKER_BROWSER_CONTEXT_READY_TIMEOUT_MS` | `60000` | Time to wait for launcher to signal ready |

## 6. Troubleshooting

### "Cached value already set" / zod error on import

Pre-existing dependency issue between `zod@4.4.3` and `@zenstackhq/runtime`.
Reproducible with all branch changes stashed. Workarounds:

- Pin `zod` to `3.23.x` in the root `package.json`, or
- Upgrade `@zenstackhq/runtime` to a release that targets zod 4 properly.

### `Could not find Chromium`

CloakBrowser downloads to `~/.cloakbrowser/` on first import. If the cache is
wiped or the version doesn't match, re-import once to trigger a re-download:

```bash
rm -rf ~/.cloakbrowser
bun -e "import('cloakbrowser').then(() => {})"
```

### "Browser is already running for <profile dir>"

Chromium locks the user-data dir. Find and kill the other process:

```bash
lsof | grep "<profile dir>" | head
# or
ps aux | grep "Chromium.*--user-data-dir=<profile dir>" | grep -v grep
```

### `agent-browser` reports "Could not connect to CDP"

The launcher must print `{"type":"ready",...}` before `agent-browser connect`
runs. If the launcher exited early, the API/worker will have logged the cause.
Common causes:

- The profile dir does not exist (run `mkdir -p` first).
- The port is already in use.
- The Chromium binary path differs from the host's default; on Linux without
  a desktop, install `libnss3`, `libatk1.0-0`, `libgbm1`, `libxkbcommon0`.

### Detached: profile does not survive restarts

The launcher writes `<profileDir>/storage_state.json` only on `SIGTERM/SIGINT`.
If you `kill -9` it, the snapshot is lost. Use `kill -TERM <pid>` (or just
`Ctrl-C` in the foreground) to ensure a clean shutdown.
