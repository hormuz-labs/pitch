import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DemoConfig, DemoStep, TrackingEvent, TrackingData } from './types';
import { getChromiumGpuFlags } from './utils';
import { cloakLaunchOptions, humanizedType } from './cloak-launcher';

function getCursorFilePath(demoDir: string, config: DemoConfig): string {
  const cursorStyle = config.cursorStyle || 'black';
  let cursorFile = path.join(demoDir, 'assets', 'icons', `cursor-${cursorStyle}.png`);
  if (!fs.existsSync(cursorFile)) {
    cursorFile = path.join(demoDir, 'assets', 'icons', `cursor-${cursorStyle}.svg`);
  }
  if (!fs.existsSync(cursorFile)) {
    cursorFile = path.join(demoDir, 'assets', 'icons', 'cursor.svg');
  }
  if (!fs.existsSync(cursorFile)) {
    cursorFile = path.join(demoDir, 'assets', 'icons', 'cursor.png');
  }
  return cursorFile;
}

async function renderSvgToPng(svgPath: string, pngPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    await page.setContent(`
      <html>
        <body style="margin: 0; padding: 0; background: transparent; overflow: hidden;">
          <div id="svg-container" style="display: inline-block; width: 31.2px; height: 31.2px;">
            ${svgContent}
          </div>
        </body>
      </html>
    `);
    const element = await page.$('#svg-container');
    if (!element) throw new Error('Failed to find SVG container element');
    await element.screenshot({ path: pngPath, omitBackground: true });
  } finally {
    await browser.close();
  }
}

function preflight(demoDir: string, config: DemoConfig): void {
  const timelinePath = path.join(demoDir, 'timeline.json');
  if (!fs.existsSync(timelinePath)) throw new Error(`[pass3-record] timeline.json not found — run pass2-timeline first. Expected: ${timelinePath}`);

  const timestampsPath = path.join(demoDir, 'timestamps.json');
  if (!fs.existsSync(timestampsPath)) throw new Error(`[pass3-record] timestamps.json not found — run pass2-tts first. Expected: ${timestampsPath}`);

  const cursorFile = getCursorFilePath(demoDir, config);
  if (!fs.existsSync(cursorFile)) throw new Error(`[pass3-record] cursor file (PNG or SVG) not found. Expected in assets/icons/`);
}

export async function pass3Record(
  config: DemoConfig,
  startUrl: string,
  demoSteps: DemoStep[],
  demoDir: string
): Promise<void> {
  preflight(demoDir, config);

  const trackingPath = path.join(demoDir, 'tracking.json');
  const rawVideoPointer = path.join(demoDir, 'raw-video-path.txt');

  if (fs.existsSync(trackingPath) && fs.existsSync(rawVideoPointer)) {
    const rawPath = fs.readFileSync(rawVideoPointer, 'utf8').trim();
    if (fs.existsSync(rawPath)) {
      console.log('⏭️  [pass3-record] tracking.json + raw recording already exist — skipping.');
      return;
    }
  }

  console.log('== Pass 5: Raw Video Recording & JIT Tracking ==');
  const timeline = JSON.parse(fs.readFileSync(path.join(demoDir, 'timeline.json'), 'utf8'));
  const originalTimeline: Record<string, number> = { ...timeline };

  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;
  const CENTER_X = VIDEO_WIDTH / 2;
  const CENTER_Y = VIDEO_HEIGHT / 2;

  const browser = await chromium.launch(cloakLaunchOptions(getChromiumGpuFlags()));

  const cursorSrc = getCursorFilePath(demoDir, config);
  const ext = path.extname(cursorSrc);
  const cursorPng = path.join(demoDir, 'cursor.png');
  
  if (ext === '.svg') {
    console.log(`🎨 Rendering SVG cursor ${cursorSrc} to PNG...`);
    await renderSvgToPng(cursorSrc, cursorPng);
  } else {
    fs.copyFileSync(cursorSrc, cursorPng);
  }
  console.log(`✅ Cursor PNG ready: ${cursorPng}`);

  const context = await browser.newContext({
    recordVideo: { dir: demoDir, size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } },
    viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
  });

  // If a CloakBrowser profile exists, load its storage_state.json to restore
  // cookies so the automation runs as an authenticated user.
  const PROFILE_ROOT = process.env.CLOAK_PROFILE_ROOT || path.join(os.homedir(), '.cloak-profiles');
  if (config.userId) {
    const safe = config.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const profileDir = path.join(PROFILE_ROOT, `user-${safe}`);
    if (fs.existsSync(profileDir)) {
      const storageFile = path.join(profileDir, 'storage_state.json');
      if (fs.existsSync(storageFile)) {
        try {
          const state = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
          if (state.cookies?.length) {
            await context.addCookies(state.cookies);
            console.log(`[pass3] Restored ${state.cookies.length} cookies from ${storageFile}`);
          }
        } catch (e) {
          console.warn(`[pass3] Failed to load storage state:`, e);
        }
      } else {
        console.log(`[pass3] No storage_state.json found at ${storageFile} — proceeding unauthenticated`);
      }
    }
  } else {
    console.log('[pass3] No userId set — proceeding unauthenticated');
  }

  const page = await context.newPage();

  // Prime the recorder with a blank white frame so Playwright's video encoder
  // starts its internal clock immediately. Using a data: URL (instead of
  // setContent) is more reliable with CloakBrowser's fingerprinted Chromium.
  // Capture videoStartTime BEFORE the first goto so initDurationMs accounts for
  // ALL dead video time (including the blank frame render + 100ms wait) that
  // the encoder recorded. Without this, ~150-250ms of dead frames at the start
  // of the raw video go untrimmed, shifting all overlay/audio events early.
  const pipelineStart = Date.now();
  await page.goto('data:text/html,<body style="background:white;"></body>', { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(100);
  await page.goto(startUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  const startTime = Date.now();
  const initDurationMs = startTime - pipelineStart;

  const trackingEvents: TrackingEvent[] = [];
  let prevCursorX = CENTER_X;
  let prevCursorY = CENTER_Y;
  let prevAction: 'click' | 'type' | 'wait' | undefined;
  let prevZoom = 1.0;

  const waitForTime = async (targetSeconds: number) => {
    const targetMs = targetSeconds * 1000;
    const elapsed = Date.now() - startTime;
    if (elapsed < targetMs) await page.waitForTimeout(targetMs - elapsed);
  };

  for (const step of demoSteps) {
    let actionTime = timeline[step.id];
    if (actionTime > 1000) actionTime = actionTime / 1000;

    if (step.selector) {
      const loc = page.locator(step.selector).first();

      await waitForTime(actionTime - 2.0);
      await loc.waitFor({ state: 'attached', timeout: 15000 });

      const scrollYBefore = await page.evaluate(() => window.scrollY);
      await loc.evaluate((node) => node.scrollIntoView({ behavior: 'smooth', block: 'center' }))
        .catch(() => loc.scrollIntoViewIfNeeded());
      await page.waitForTimeout(300);
      const scrollYAfter = await page.evaluate(() => window.scrollY);

      if (Math.abs(scrollYAfter - scrollYBefore) > 20) {
        trackingEvents.push({
          id: `${step.id}__scroll`,
          actionTime: actionTime - 1.5,
          cx: prevCursorX,
          cy: prevCursorY,
          action: 'scroll',
          scrollY: scrollYAfter,
        });
      }

      await waitForTime(actionTime - 0.5);
      const box = await loc.boundingBox();
      const cx = box ? box.x + box.width / 2 : CENTER_X;
      const cy = box ? box.y + box.height / 2 : CENTER_Y;

      await waitForTime(actionTime);
      const finalBox = await loc.boundingBox();
      const finalCx = finalBox ? finalBox.x + finalBox.width / 2 : cx;
      const finalCy = finalBox ? finalBox.y + finalBox.height / 2 : cy;

      // Dynamic auto-zoom: frame the element to fill ~50% of the viewport, capped at 1.8×.
      // Tuned conservatively so text inputs/buttons don't dominate the frame.
      let elemZoom: number | undefined;
      if (finalBox) {
        const targetFillRatio = 0.5;
        const zoomByWidth = (VIDEO_WIDTH * targetFillRatio) / finalBox.width;
        const zoomByHeight = (VIDEO_HEIGHT * targetFillRatio) / finalBox.height;
        elemZoom = Math.max(1.0, Math.min(1.8, Math.min(zoomByWidth, zoomByHeight)));
      }

      // Form chaining: when a `type` step follows another `type` step, carry the
      // previous zoom forward so the camera pans smoothly across form fields
      // instead of bouncing in/out for each input.
      if (step.action === 'type' && prevAction === 'type') {
        elemZoom = prevZoom;
      }

      // Execute the action. Capture the timestamp IMMEDIATELY BEFORE so the
      // cursor animation fires at the action's onset, aligned with both the
      // click SFX (which uses originalTimeline — the LLM-predicted time) and
      // the voiceover narration. The old code captured before the click with a
      // +0.05s guess, causing the overlay to fire 50-100ms early.
      const preActionTime = (Date.now() - startTime) / 1000;
      if (step.action === 'click') {
        await loc.click({ force: true });
      } else if (step.action === 'type') {
        await humanizedType(page, loc, step.value!);
      }

      // Pre-navigate transition: when a click will trigger navigation, inject a
      // zoom-in → zoom-out pair centered on the click target so the camera
      // settles to 1.0× *before* the new page paints, giving the viewer's eye
      // a structural resting point across the page change.
      let isPreNavigate = step.preNavigate === true;
      if (!isPreNavigate && step.action === 'click') {
        isPreNavigate = await loc
          .evaluate((node) => node.tagName === 'A' || !!node.closest('a') || !!node.getAttribute('href'))
          .catch(() => false);
      }
      if (isPreNavigate && step.action === 'click') {
        const zoomInLevel = Math.max(elemZoom ?? 1.4, 1.4);
        const ZOOM_IN_OFFSET = 1.5; // s before click — zoom peaks here
        if (preActionTime - ZOOM_IN_OFFSET > 0) {
          trackingEvents.push({
            id: `${step.id}__pre_nav_in`,
            actionTime: preActionTime - ZOOM_IN_OFFSET,
            cx: finalCx,
            cy: finalCy,
            action: 'move',
            zoom: zoomInLevel,
          });
        }
        elemZoom = zoomInLevel;
      }

      trackingEvents.push({ id: step.id, actionTime: preActionTime, cx: finalCx, cy: finalCy, action: step.action, zoom: elemZoom });
      prevCursorX = finalCx;
      prevCursorY = finalCy;
      prevAction = step.action;
      prevZoom = elemZoom ?? prevZoom;

      if (isPreNavigate && step.action === 'click') {
        const ZOOM_OUT_DELAY = 1.0; // s after click — zoom returns to 1.0
        trackingEvents.push({
          id: `${step.id}__post_nav_out`,
          actionTime: preActionTime + ZOOM_OUT_DELAY,
          cx: finalCx,
          cy: finalCy,
          action: 'move',
          zoom: 1.0,
        });
      }

      if (step.action === 'click' || step.action === 'type') {
        timeline[step.id] = preActionTime;
      }
    } else {
      await waitForTime(actionTime);
      trackingEvents.push({ id: step.id, actionTime, cx: prevCursorX, cy: prevCursorY, action: 'wait', zoom: step.zoom });
      if (step.id === 'tOutro') {
        try { await page.waitForTimeout(2000); } catch (e) { /* ignore */ }
      }
    }
  }

  const timestampsData = JSON.parse(fs.readFileSync(path.join(demoDir, 'timestamps.json'), 'utf8'));
  const totalAudioTimeMs = timestampsData[timestampsData.length - 1].endMs;
  const videoPathCapture = await page.video()?.path();

  const elapsedFinal = Date.now() - startTime;
  if (elapsedFinal < totalAudioTimeMs) {
    const timeToWait = totalAudioTimeMs - elapsedFinal + 2000;
    try { await page.waitForTimeout(timeToWait); } catch (e) { /* ignore */ }
  }

  // Close page first with timeout — Playwright's recordVideo encoder can hang on close
  await Promise.race([
    page.close(),
    new Promise(resolve => setTimeout(resolve, 10000))
  ]).catch(() => {});

  // Close context with timeout — same reason
  await Promise.race([
    context.close(),
    new Promise(resolve => setTimeout(resolve, 10000))
  ]).catch(() => {});

  await browser.close();

  if (!videoPathCapture || !fs.existsSync(videoPathCapture)) throw new Error('[pass3-record] Raw video not found after recording!');

  const trackingData: TrackingData = { initDurationMs, events: trackingEvents, originalTimeline };
  fs.writeFileSync(trackingPath, JSON.stringify(trackingData, null, 2));
  fs.writeFileSync(rawVideoPointer, videoPathCapture);
  fs.writeFileSync(path.join(demoDir, 'timeline.json'), JSON.stringify(timeline, null, 2));

  console.log(`✅ Raw recording saved: ${videoPathCapture}`);
  console.log(`✅ tracking.json saved.`);
}
