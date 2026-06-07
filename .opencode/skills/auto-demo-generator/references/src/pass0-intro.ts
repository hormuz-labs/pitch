import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { DemoConfig } from './types';
import { cloakLaunchOptions } from './cloak-launcher';

const MIME_MAP: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
  '.avif': 'image/avif',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
};

function findLogoInIconsDir(demoDir: string): { filePath: string; mimeType: string; dataUrl: string } | null {
  const iconsDir = path.join(demoDir, 'assets', 'icons');
  if (!fs.existsSync(iconsDir)) {
    console.log(`No assets/icons/ folder found. Playwright-cli must download the logo there first.`);
    return null;
  }

  const files = fs.readdirSync(iconsDir).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ext in MIME_MAP && f.startsWith('logo.');
  });

  if (files.length === 0) {
    console.log(`assets/icons/ folder is empty. No logo found.`);
    return null;
  }

  const preferenceOrder = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.avif', '.gif', '.ico'];
  files.sort((a, b) => {
    const ai = preferenceOrder.indexOf(path.extname(a).toLowerCase());
    const bi = preferenceOrder.indexOf(path.extname(b).toLowerCase());
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const best = files[0];
  const ext = path.extname(best).toLowerCase();
  const mimeType = MIME_MAP[ext];
  const filePath = path.join(iconsDir, best);
  const dataUrl = `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
  console.log(`✅ Logo found: ${best} (${mimeType})`);
  return { filePath, mimeType, dataUrl };
}

function preflight(demoDir: string): void {
  if (!fs.existsSync(demoDir)) throw new Error(`[pass0-intro] demoDir does not exist: ${demoDir}`);
  const iconsDir = path.join(demoDir, 'assets', 'icons');
  if (!fs.existsSync(iconsDir)) throw new Error(`[pass0-intro] assets/icons/ not found. Playwright-cli must download logo.svg there first. Expected: ${iconsDir}`);
}

export async function pass0(config: DemoConfig, startUrl: string, demoDir: string) {
  preflight(demoDir);

  const introPathFile = path.join(demoDir, 'intro-path.txt');
  const thumbnailPathFile = path.join(demoDir, 'thumbnail-path.txt');
  if (fs.existsSync(introPathFile) && fs.existsSync(thumbnailPathFile)) {
    const introVideo = fs.readFileSync(introPathFile, 'utf8').trim();
    if (fs.existsSync(introVideo)) {
      console.log('⏭️  [pass0-intro] Intro + thumbnail already exist — skipping.');
      return;
    }
  }

  console.log("== Pass 0: Cinematic Intro Generation ==");

  let companyName = config.companyName;
  if (!companyName) {
    const urlObj = new URL(startUrl.startsWith('http') ? startUrl : `https://${startUrl}`);
    const parts = urlObj.hostname.replace('www.', '').split('.');
    companyName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }

  const logo = findLogoInIconsDir(demoDir);
  if (!logo) {
    console.log("Skipping cinematic intro — no logo in assets/icons/.");
    return;
  }

  let bg = '#FFFFFF';
  let textColor = '#111111';
  let dividerColor = '#E0E0E0';

  if (config.introBg && config.introBg !== 'auto') {
    const isDark = config.introBg === 'black';
    bg = isDark ? '#0A0A0A' : '#FFFFFF';
    textColor = isDark ? '#F5F5F5' : '#111111';
    dividerColor = isDark ? '#2A2A2A' : '#E0E0E0';
  } else {
    // Default to a light background. CloakBrowser's fingerprinted Chromium
    // destroys the JS execution context when an async canvas+Image evaluate
    // runs on a fresh page, so we skip the previous in-browser brightness
    // analysis. To force a dark background, set "introBg": "black" in
    // demo-config.json.
    console.log('Logo background theme: light (default). Set "introBg": "black" in demo-config.json to force dark.');
  }

  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;
  const introBrowser = await chromium.launch(cloakLaunchOptions());
  const introContext = await introBrowser.newContext({
    recordVideo: { dir: demoDir, size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } },
    viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }
  });
  const introPage = await introContext.newPage();

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;400&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${VIDEO_WIDTH}px; height: ${VIDEO_HEIGHT}px; overflow: hidden;
    background: ${bg};
    display: flex; align-items: center; justify-content: center;
    font-family: 'Inter', sans-serif;
  }
  .container {
    display: flex; align-items: center; gap: 0;
    opacity: 0; animation: containerFade 0.3s ease 0.1s forwards;
  }
  @keyframes containerFade { to { opacity: 1; } }

  .logo-wrap {
    padding-right: 72px;
    opacity: 0; transform: scale(0.94) translateY(8px); filter: blur(4px);
    animation: logoIn 0.9s cubic-bezier(0.16,1,0.3,1) 0.15s forwards;
  }
  @keyframes logoIn {
    to { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
  }
  .logo-wrap img { height: 100px; width: auto; display: block; max-width: 500px; object-fit: contain; }

  .divider {
    width: 1px; height: 100px; background: ${dividerColor};
    transform-origin: top center; transform: scaleY(0);
    animation: dividerIn 0.4s cubic-bezier(0.16,1,0.3,1) 0.55s forwards;
  }
  @keyframes dividerIn { to { transform: scaleY(1); } }

  .text-wrap {
    padding-left: 72px;
    opacity: 0; transform: translateX(-16px);
    animation: textIn 0.7s cubic-bezier(0.16,1,0.3,1) 0.65s forwards;
  }
  @keyframes textIn { to { opacity: 1; transform: translateX(0); } }

  .company-name {
    font-family: 'Inter', sans-serif;
    font-weight: 700; font-size: 72px;
    letter-spacing: -0.03em; color: ${textColor};
    line-height: 1; white-space: nowrap;
  }

  body { animation: bodyFadeOut 0.7s ease 2.8s forwards; }
  @keyframes bodyFadeOut { to { opacity: 0; } }
</style>
</head>
<body>
  <div class="container">
    <div class="logo-wrap">
      <img src="${logo.dataUrl}" alt="logo"/>
    </div>
    <div class="divider"></div>
    <div class="text-wrap">
      <div class="company-name">${companyName}</div>
    </div>
  </div>
  <script>
    document.fonts.ready.then(() => { window.__fontsLoaded = true; });
    setTimeout(() => { window.__introDone = true; }, 3500);
  </script>
</body>
</html>`;

  // Use data: URLs instead of setContent — setContent hangs on a fresh
  // CloakBrowser page (its fingerprinted Chromium never resolves "load").
  await introPage.goto('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="background:white;"></body>'), { waitUntil: 'load' });
  await introPage.waitForTimeout(100);

  await introPage.goto('data:text/html;charset=utf-8,' + encodeURIComponent(html), { waitUntil: 'load' });
  await introPage.waitForFunction(() => (window as any).__fontsLoaded === true, { timeout: 5000 });

  await introPage.waitForTimeout(1500);
  const thumbnailPath = path.join(demoDir, 'thumbnail.jpg');
  await introPage.screenshot({ path: thumbnailPath, type: 'jpeg', quality: 90 });
  fs.writeFileSync(path.join(demoDir, 'thumbnail-path.txt'), thumbnailPath);
  console.log(`✅ Thumbnail captured: ${thumbnailPath}`);

  await introPage.waitForFunction(() => (window as any).__introDone === true, { timeout: 6000 });

  const introVideoPath = await introPage.video()?.path();
  await introContext.close();
  await introBrowser.close();

  if (introVideoPath) {
    fs.writeFileSync(path.join(demoDir, 'intro-path.txt'), introVideoPath);
    console.log(`✅ Intro cinematic recorded: ${introVideoPath}`);
  } else {
    console.log(`⚠️  Intro video path not found — stitching will be skipped.`);
  }
}
