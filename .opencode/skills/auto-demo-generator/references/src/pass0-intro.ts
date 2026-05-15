import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { DemoConfig } from './types';

// Supported logo formats and their MIME types
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
    console.log(`No assets/icons/ folder found. Agent-browser must download the logo there first.`);
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

  // Prefer SVG (infinite resolution) → PNG → WebP → others
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

// ── Preflight ────────────────────────────────────────────────────────────────
function preflight(demoDir: string): void {
  if (!fs.existsSync(demoDir)) throw new Error(`[pass0-intro] demoDir does not exist: ${demoDir}`);
  const iconsDir = path.join(demoDir, 'assets', 'icons');
  if (!fs.existsSync(iconsDir)) throw new Error(`[pass0-intro] assets/icons/ not found. Agent-browser must download logo.svg there first. Expected: ${iconsDir}`);
}

export async function pass0(config: DemoConfig, startUrl: string, demoDir: string) {
  preflight(demoDir);

  // Skip if intro + thumbnail already recorded
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

  // --- 1. Resolve Company Name ---
  let companyName = config.companyName;
  if (!companyName) {
    // Derive from URL (no browser needed — no network cost)
    const urlObj = new URL(startUrl.startsWith('http') ? startUrl : `https://${startUrl}`);
    const parts = urlObj.hostname.replace('www.', '').split('.');
    companyName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  }

  // --- 2. Find Logo from assets/icons/ (placed there by agent-browser) ---
  const logo = findLogoInIconsDir(demoDir);
  if (!logo) {
    console.log("Skipping cinematic intro — no logo in assets/icons/.");
    return;
  }

  // --- 3. Analyze Brightness (using Node.js Canvas via Playwright evaluate) ---
  let bg = '#FFFFFF';
  let textColor = '#111111';
  let dividerColor = '#E0E0E0';

  if (config.introBg && config.introBg !== 'auto') {
    const isDark = config.introBg === 'black';
    bg = isDark ? '#0A0A0A' : '#FFFFFF';
    textColor = isDark ? '#F5F5F5' : '#111111';
    dividerColor = isDark ? '#2A2A2A' : '#E0E0E0';
  } else {
    // Spin up a tiny browser just to run the pixel analysis — no page load needed
    const analysisBrowser = await chromium.launch({ headless: true });
    const analysisCtx = await analysisBrowser.newContext();
    const analysisPage = await analysisCtx.newPage();

    const avgBrightness = await analysisPage.evaluate(async (dataUrl) => {
      const img = new Image();
      img.src = dataUrl;
      await new Promise(r => img.onload = r);
      const canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;
      let total = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 10) { // non-transparent pixels only
          total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          count++;
        }
      }
      return count > 0 ? total / count : 128;
    }, logo.dataUrl);

    await analysisBrowser.close();

    if (avgBrightness > 140) { // Logo is light → use dark background
      bg = '#0A0A0A';
      textColor = '#F5F5F5';
      dividerColor = '#2A2A2A';
    }
    console.log(`Logo brightness: ${avgBrightness.toFixed(1)} → background: ${bg}`);
  }

  // --- 4. Record Cinematic Intro via Playwright ---
  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;
  const introBrowser = await chromium.launch({ headless: true });
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
  /* SVGs and PNGs both render perfectly as <img> with data URLs */
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

  /* Fade out the whole frame at the end */
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

  // Prime the recorder with a first frame before the real content
  await introPage.setContent('<html><body style="background:white;"></body></html>');
  await introPage.waitForTimeout(100);

  await introPage.setContent(html);
  await introPage.waitForFunction(() => (window as any).__fontsLoaded === true, { timeout: 5000 }).catch(() => {});

  // Wait until animations are fully settled (~1.5s) then capture thumbnail
  await introPage.waitForTimeout(1500);
  const thumbnailPath = path.join(demoDir, 'thumbnail.jpg');
  await introPage.screenshot({ path: thumbnailPath, type: 'jpeg', quality: 90 });
  fs.writeFileSync(path.join(demoDir, 'thumbnail-path.txt'), thumbnailPath);
  console.log(`✅ Thumbnail captured: ${thumbnailPath}`);

  await introPage.waitForFunction(() => (window as any).__introDone === true, { timeout: 6000 }).catch(() => {});

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
