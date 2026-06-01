import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { DemoConfig, DemoStep, TrackingEvent, TrackingData } from './types';
import { getChromiumGpuFlags } from './utils';

function preflight(demoDir: string, config: DemoConfig): void {
  const timelinePath = path.join(demoDir, 'timeline.json');
  if (!fs.existsSync(timelinePath)) throw new Error(`[pass3-record] timeline.json not found — run pass2-timeline first. Expected: ${timelinePath}`);

  const timestampsPath = path.join(demoDir, 'timestamps.json');
  if (!fs.existsSync(timestampsPath)) throw new Error(`[pass3-record] timestamps.json not found — run pass2-tts first. Expected: ${timestampsPath}`);

  const cursorStyle = config.cursorStyle || 'black';
  const cursorFile = path.join(demoDir, 'assets', 'icons', `cursor-${cursorStyle}.png`);
  if (!fs.existsSync(cursorFile)) throw new Error(`[pass3-record] cursor-${cursorStyle}.png not found. Expected: ${cursorFile}`);
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

  const browser = await chromium.launch({ headless: true, args: getChromiumGpuFlags() });

  const cursorStyle = config.cursorStyle || 'black';
  const cursorSrc = path.join(demoDir, 'assets', 'icons', `cursor-${cursorStyle}.png`);
  const cursorPng = path.join(demoDir, 'cursor.png');
  fs.copyFileSync(cursorSrc, cursorPng);
  console.log(`✅ Cursor PNG ready: ${cursorPng}`);

  const context = await browser.newContext({
    recordVideo: { dir: demoDir, size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } },
    viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
    extraHTTPHeaders: config.extraHTTPHeaders
  });
  const page = await context.newPage();

  await page.setContent('<html><body style="background:white;"></body></html>');
  await page.waitForTimeout(100);

  const videoStartTime = Date.now();
  await page.goto(startUrl, { waitUntil: 'load', timeout: 30000 });
  await page.waitForTimeout(2000);

  const startTime = Date.now();
  const initDurationMs = startTime - videoStartTime;

  const trackingEvents: TrackingEvent[] = [];
  let prevCursorX = CENTER_X;
  let prevCursorY = CENTER_Y;

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
      await loc.waitFor({ state: 'visible', timeout: 15000 });

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

      const syncedActionTime = (Date.now() - startTime) / 1000 + 0.05;

      // Dynamic zoom: frame the element to fill ~35% of the viewport (with surrounding context)
      let elemZoom: number | undefined;
      if (finalBox) {
        const targetFillRatio = 0.35;
        const zoomByWidth = (VIDEO_WIDTH * targetFillRatio) / finalBox.width;
        const zoomByHeight = (VIDEO_HEIGHT * targetFillRatio) / finalBox.height;
        elemZoom = Math.max(1.0, Math.min(2.5, Math.min(zoomByWidth, zoomByHeight)));
      }
      trackingEvents.push({ id: step.id, actionTime: syncedActionTime, cx: finalCx, cy: finalCy, action: step.action, zoom: elemZoom });
      prevCursorX = finalCx;
      prevCursorY = finalCy;

      if (step.action === 'click') {
        await loc.click({ force: true });
      } else if (step.action === 'type') {
        await loc.focus();
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(200);
        await loc.pressSequentially(step.value!, { delay: 80 });
      }

      if (step.action === 'click' || step.action === 'type') {
        timeline[step.id] = syncedActionTime;
      }
    } else {
      await waitForTime(actionTime);
      trackingEvents.push({ id: step.id, actionTime, cx: CENTER_X, cy: CENTER_Y, action: 'wait', zoom: step.zoom });
      if (step.id === 'tOutro') await page.waitForTimeout(2000);
    }
  }

  const timestampsData = JSON.parse(fs.readFileSync(path.join(demoDir, 'timestamps.json'), 'utf8'));
  const totalAudioTimeMs = timestampsData[timestampsData.length - 1].endMs;
  const videoPathCapture = await page.video()?.path();

  const elapsedFinal = Date.now() - startTime;
  if (elapsedFinal < totalAudioTimeMs) {
    const timeToWait = totalAudioTimeMs - elapsedFinal + 2000;
    const frameInterval = setInterval(() => {
    }, 500);
    await page.waitForTimeout(timeToWait);
    clearInterval(frameInterval);
  }

  await context.close();
  await browser.close();

  if (!videoPathCapture || !fs.existsSync(videoPathCapture)) throw new Error('[pass3-record] Raw video not found after recording!');

  const trackingData: TrackingData = { initDurationMs, events: trackingEvents, originalTimeline };
  fs.writeFileSync(trackingPath, JSON.stringify(trackingData, null, 2));
  fs.writeFileSync(rawVideoPointer, videoPathCapture);
  fs.writeFileSync(path.join(demoDir, 'timeline.json'), JSON.stringify(timeline, null, 2));

  console.log(`✅ Raw recording saved: ${videoPathCapture}`);
  console.log(`✅ tracking.json saved.`);
}
