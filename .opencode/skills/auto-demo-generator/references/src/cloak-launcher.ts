import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Platform = 'macos' | 'linux' | 'windows';

function detectPlatform(): Platform {
  const p = process.platform;
  if (p === 'darwin') return 'macos';
  if (p === 'win32') return 'windows';
  return 'linux';
}

const PLATFORM = detectPlatform();

function findExecutableIn(dir: string, names: string[]): string | null {
  if (!fs.existsSync(dir)) return null;
  for (const name of names) {
    const direct = path.join(dir, name);
    if (fs.existsSync(direct)) return direct;
  }
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && names.includes(e.name)) return full;
    }
  }
  return null;
}

export function findCloakBrowserPath(): string {
  if (process.env.CLOAK_BROWSER_PATH && fs.existsSync(process.env.CLOAK_BROWSER_PATH)) {
    return process.env.CLOAK_BROWSER_PATH;
  }

  try {
    const output = execSync('cloakbrowser info', { encoding: 'utf8', timeout: 5000 });
    const match = output.match(/Binary:\s+(.+)/);
    if (match) {
      const candidate = match[1].trim();
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch {}

  const cloakDir = path.join(os.homedir(), '.cloakbrowser');
  if (fs.existsSync(cloakDir)) {
    const versions = fs.readdirSync(cloakDir)
      .filter(e => e.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const v of versions) {
      const base = path.join(cloakDir, v);

      if (PLATFORM === 'macos') {
        const mac = path.join(base, 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
        if (fs.existsSync(mac)) return mac;
      }

      const candidates = PLATFORM === 'windows'
        ? ['chrome.exe', 'Chromium.exe', 'cloak.exe']
        : ['chrome', 'chromium', 'Chromium', 'cloak'];

      const found = findExecutableIn(base, candidates);
      if (found) return found;
    }
  }

  throw new Error(
    `CloakBrowser binary not found for ${PLATFORM}. Install with: bun add -g cloakbrowser\n` +
    'Or set CLOAK_BROWSER_PATH to the Chromium executable.'
  );
}

export function getCloakLaunchArgs(): string[] {
  const envArgs = (process.env.AGENT_BROWSER_ARGS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!envArgs.includes('--fingerprint')) {
    envArgs.unshift('--fingerprint');
  }
  const platformFlag = `--fingerprint-platform=${PLATFORM}`;
  if (!envArgs.some(a => a.startsWith('--fingerprint-platform'))) {
    envArgs.push(platformFlag);
  }

  return envArgs;
}

export function cloakLaunchOptions(extraArgs: string[] = []) {
  const args = [...getCloakLaunchArgs(), ...extraArgs];
  const unique = Array.from(new Set(args));
  const headed = process.env.CLOAK_HEADED === '1' || process.env.CLOAK_HEADED === 'true';
  return {
    executablePath: findCloakBrowserPath(),
    headless: !headed,
    args: unique,
  };
}
