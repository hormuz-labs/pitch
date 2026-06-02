#!/usr/bin/env bun
/**
 * cloak-launch.mjs — long-running CloakBrowser host for a single user profile.
 *
 * Spawned by apps/api/src/services/browser-host.ts on "Authenticate" and again
 * by the worker before running a job. Stays alive until SIGTERM/SIGINT, then
 * snapshots storage_state.json and exits cleanly so the persistent profile dir
 * has both the raw Chromium user-data-dir AND a portable storage_state file
 * (used by Phase-3 S3 sync).
 *
 * Args:
 *   --profile-dir <abs path>  required, persistent user-data dir
 *   --port <int>              CDP debugging port (default 9242)
 *   --start-url <url>         optional initial navigation
 *   --headless                run without UI (default: false for auth flow)
 *
 * Logs progress as JSON-per-line on stdout so the parent can parse readiness.
 */
import { launchPersistentContext } from 'cloakbrowser';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function log(event, data = {}) {
  process.stdout.write(JSON.stringify({ event, ts: Date.now(), ...data }) + '\n');
}

const args = parseArgs(process.argv.slice(2));
const profileDir = args['profile-dir'];
const port = Number(args.port || 9242);
const startUrl = args['start-url'];
const headless = args.headless === true || args.headless === 'true';

if (!profileDir) {
  log('error', { message: '--profile-dir is required' });
  process.exit(2);
}

await mkdir(profileDir, { recursive: true });

let ctx;
try {
  ctx = await launchPersistentContext({
    userDataDir: profileDir,
    headless,
    humanize: true,
    args: [`--remote-debugging-port=${port}`],
  });
} catch (err) {
  log('error', { message: err?.message ?? String(err) });
  process.exit(3);
}

const pages = ctx.pages();
const page = pages[0] ?? (await ctx.newPage());

if (startUrl && startUrl !== 'about:blank') {
  try {
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  } catch (err) {
    log('warn', { message: `initial navigation failed: ${err?.message ?? err}` });
  }
}

log('ready', { profileDir, port, pid: process.pid, headless });

let shuttingDown = false;
async function shutdown(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log('shutdown', { reason });
  try {
    const stateFile = join(profileDir, 'storage_state.json');
    await ctx.storageState({ path: stateFile });
    log('storage-state-saved', { path: stateFile });
  } catch (err) {
    log('warn', { message: `storage_state save failed: ${err?.message ?? err}` });
  }
  try {
    await ctx.close();
  } catch {
    // ignore — context may already be tearing down
  }
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('disconnect', () => shutdown('parent-disconnect'));

await new Promise(() => {});
