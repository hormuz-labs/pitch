import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { DemoConfig, DemoStep, TrackingEvent, TrackingData } from './types';
import { smoothstepExpr, springOvershootExpr } from './utils';

export async function pass3(config: DemoConfig, startUrl: string, demoSteps: DemoStep[], demoDir: string) {
  console.log("== Pass 3: Raw Video Recording & JIT Tracking ==");
  const timeline = JSON.parse(fs.readFileSync(path.join(demoDir, 'timeline.json'), 'utf8'));
  
  const browser = await chromium.launch({ headless: true });
  
  // Rasterize cursor to PNG for FFmpeg
  const cursorStyle = config.cursorStyle || 'black';
  const cursorFile = path.join(demoDir, 'assets', 'icons', `cursor-${cursorStyle}.svg`);
  const cursorPng = path.join(demoDir, 'cursor.png');
  if (fs.existsSync(cursorFile)) {
    const cursorContext = await browser.newContext();
    const cursorPage = await cursorContext.newPage();
    let svgContent = fs.readFileSync(cursorFile, 'utf8');
    // Ensure the SVG scales correctly to 48x48
    svgContent = svgContent.replace(/width="\d+"/i, 'width="48"').replace(/height="\d+"/i, 'height="48"');
    await cursorPage.setContent(`
      <style>body { margin: 0; background: transparent; } svg { width: 48px; height: 48px; display: block; }</style>
      ${svgContent}
    `);
    const svgEl = await cursorPage.locator('svg');
    await svgEl.screenshot({ path: cursorPng, omitBackground: true });
    await cursorContext.close();
  }

  const context = await browser.newContext({
    recordVideo: { dir: demoDir, size: { width: 1920, height: 1080 } },
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  // Force an immediate frame to start the video recording timestamp at ~0
  await page.setContent('<html><body style="background:white;"></body></html>');
  await page.waitForTimeout(100);

  const videoStartTime = Date.now();
  await page.goto(startUrl);

  // Wait for layout to settle
  await page.waitForTimeout(2000);

  const startTime = Date.now();
  const initDurationMs = startTime - videoStartTime;

  const trackingEvents: TrackingEvent[] = [];

  const waitForTime = async (targetSeconds: number) => {
    const targetMs = targetSeconds * 1000;
    const elapsed = Date.now() - startTime;
    if (elapsed < targetMs) {
      await page.waitForTimeout(targetMs - elapsed);
    }
  };

  // Execute generic engine
  // Tracks the last-known cursor position for synthetic scroll events
  let prevCursorX = 960;
  let prevCursorY = 540;

  for (const step of demoSteps) {
    let actionTime = timeline[step.id];
    // Safeguard: if actionTime is > 1000, it's likely in milliseconds, convert to seconds
    if (actionTime > 1000) {
      actionTime = actionTime / 1000;
    }

    if (step.selector) {
      const loc = page.locator(step.selector).first();

      await waitForTime(actionTime - 2.0); 

      // Ensure the element is visible
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      
      // Capture scroll position BEFORE scroll to detect camera drift
      const scrollYBefore = await page.evaluate(() => window.scrollY);

      // Perform smooth scroll to bring it into view
      await loc.evaluate((node) => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(() => loc.scrollIntoViewIfNeeded());

      // Wait for smooth scroll physics to settle, then read final position
      await page.waitForTimeout(300);
      const scrollYAfter = await page.evaluate(() => window.scrollY);

      // If the page scrolled significantly, log a synthetic scroll tracking event
      // so Phase 4 can pan the camera smoothly with the scroll
      if (Math.abs(scrollYAfter - scrollYBefore) > 20) {
        trackingEvents.push({
          id: `${step.id}__scroll`,
          actionTime: actionTime - 1.5, // arrive 1.5s before the actual action
          cx: prevCursorX,              // cursor X unchanged during page scroll
          cy: prevCursorY,
          action: 'scroll',
          scrollY: scrollYAfter
        });
      }

      // Wait until 0.5s before the action to calculate JIT coordinates
      await waitForTime(actionTime - 0.5);
      
      let box = await loc.boundingBox();
      
      // Fallback to center screen if for some reason boundingBox fails
      let cx = box ? box.x + box.width / 2 : 960;
      let cy = box ? box.y + box.height / 2 : 540;

      // Exact action time: Wait until the true action timestamp
      await waitForTime(actionTime);

      // Re-calculate exactly where it is NOW right before we click
      const finalBox = await loc.boundingBox();
      const finalCx = finalBox ? finalBox.x + finalBox.width / 2 : cx;
      const finalCy = finalBox ? finalBox.y + finalBox.height / 2 : cy;

      // Log the tracking event
      trackingEvents.push({
        id: step.id,
        actionTime,
        cx: finalCx,
        cy: finalCy,
        action: step.action
      });
      // Keep running cursor position so synthetic scroll events know where the cursor is
      prevCursorX = finalCx;
      prevCursorY = finalCy;

      // Perform the native action
      if (step.action === 'click') {
        await loc.click({ force: true });
      } else if (step.action === 'type') {
        await loc.pressSequentially(step.value!, { delay: 80 });
      }
    } else {
      // Steps without selectors (like Wait/Outro)
      await waitForTime(actionTime);
      trackingEvents.push({
        id: step.id,
        actionTime,
        cx: 960,
        cy: 540,
        action: 'wait'
      });
      if (step.id === 'tOutro') {
        await page.waitForTimeout(2000); 
      }
    }
  }
  
  // Make sure we wait long enough for the entire voiceover to finish!
  const timestampsData = JSON.parse(fs.readFileSync(path.join(demoDir, 'timestamps.json'), 'utf8'));
  const lastWord = timestampsData[timestampsData.length - 1];
  const totalAudioTimeMs = lastWord.endMs;
  
  const elapsedFinal = Date.now() - startTime;
  if (elapsedFinal < totalAudioTimeMs) {
    const timeToWait = totalAudioTimeMs - elapsedFinal + 2000;
    
    // Force invisible DOM updates so Playwright continues writing video frames
    const frameInterval = setInterval(() => {
      page.evaluate(() => {
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;background:rgba(0,0,0,0.01);z-index:9999999;';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 50);
      }).catch(() => {});
    }, 500);

    await page.waitForTimeout(timeToWait);
    clearInterval(frameInterval);
  }

  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  if (!videoPath || !fs.existsSync(videoPath)) throw new Error("Video not found!");

  const trackingData: TrackingData = { initDurationMs, events: trackingEvents };
  fs.writeFileSync(path.join(demoDir, 'tracking.json'), JSON.stringify(trackingData, null, 2));

  // --- FFmpeg POST-PROCESSING ---
  const trimSeconds = (initDurationMs / 1000).toFixed(3);
  console.log(`⏱️ Syncing Audio... Trimming page load dead time: ${trimSeconds}s`);
  console.log(`🎬 Encoding Final Video with FFmpeg Effects...`);
  
  const finalOutput = config.outputPath ? path.resolve(demoDir, config.outputPath) : path.join(demoDir, 'demo-final.mp4');
  
  // Build cursor and zoom animations using FFmpeg math expressions
  let overlayXExpr = "960";
  let overlayYExpr = "540";
  let zoomZExpr = "1";
  let panXExpr = "0";
  let panYExpr = "0";
  
  let prevCx = 960;
  let prevCy = 540;
  let prevZoom = 1;
  // Running pan state persists across loop iterations (needed for park/fade post-process)
  let runningPanX = 0;
  let runningPanY = 0;

  // Sort events by time so synthetic scroll events are ordered correctly
  trackingEvents.sort((a, b) => a.actionTime - b.actionTime);

  for (let i = 0; i < trackingEvents.length; i++) {
    const ev = trackingEvents[i];
    const tTime = ev.actionTime;
    const moveDuration = 1.0;
    const moveStart = Math.max(0, tTime - moveDuration);

    // ── Scroll events: only update camera pan, no cursor/zoom change ──────────
    if (ev.action === 'scroll') {
      const scrolledY = ev.scrollY ?? 0;
      const targetScrollPanY = Math.min(Math.max(0, scrolledY - 540 / prevZoom), 1080 - 1080 / prevZoom);
      panYExpr = `if(between(time,${moveStart},${tTime}),${smoothstepExpr('time', runningPanY, targetScrollPanY, moveStart, moveDuration)},if(gt(time,${tTime}),${targetScrollPanY},${panYExpr}))`;
      runningPanY = targetScrollPanY;
      continue; // skip cursor and zoom update for scroll-only events
    }

    const targetZoom = ev.action === 'wait' ? 1.0 : 1.2;

    // ── Cursor overlay (smoothstep easing, evaluates 't') ────────────────────
    overlayXExpr = `if(between(t,${moveStart},${tTime}),${smoothstepExpr('t', prevCx, ev.cx, moveStart, moveDuration)},if(gt(t,${tTime}),${ev.cx},${overlayXExpr}))`;
    overlayYExpr = `if(between(t,${moveStart},${tTime}),${smoothstepExpr('t', prevCy, ev.cy, moveStart, moveDuration)},if(gt(t,${tTime}),${ev.cy},${overlayYExpr}))`;

    // ── Zoom (spring overshoot on zoom-in, plain smoothstep on zoom-out) ─────
    const overshootAmt = targetZoom > prevZoom ? 0.02 : 0;
    const zoomInterp = (targetZoom !== prevZoom)
      ? springOvershootExpr('time', prevZoom, targetZoom, overshootAmt, moveStart, moveDuration)
      : `${targetZoom}`;
    zoomZExpr = `if(between(time,${moveStart},${tTime}),${zoomInterp},if(gt(time,${tTime}),${targetZoom},${zoomZExpr}))`;

    // ── Pan (smoothstep easing, evaluates 'time') ────────────────────────────
    const targetPanX = Math.min(Math.max(0, ev.cx - 1920 / (2 * targetZoom)), 1920 - 1920 / targetZoom);
    const targetPanY = Math.min(Math.max(0, ev.cy - 1080 / (2 * targetZoom)), 1080 - 1080 / targetZoom);

    panXExpr = `if(between(time,${moveStart},${tTime}),${smoothstepExpr('time', runningPanX, targetPanX, moveStart, moveDuration)},if(gt(time,${tTime}),${targetPanX},${panXExpr}))`;
    panYExpr = `if(between(time,${moveStart},${tTime}),${smoothstepExpr('time', runningPanY, targetPanY, moveStart, moveDuration)},if(gt(time,${tTime}),${targetPanY},${panYExpr}))`;

    prevCx = ev.cx;
    prevCy = ev.cy;
    prevZoom = targetZoom;
    runningPanX = targetPanX;
    runningPanY = targetPanY;
  }

  // Ensure zoom doesn't break if no events exist
  if (trackingEvents.length === 0) {
    zoomZExpr = "1";
    panXExpr = "0";
    panYExpr = "0";
  }

  // ── Cursor Park / Fade ─────────────────────────────────────────────────────
  // When no interaction is happening for >2s, the cursor slides off-screen to
  // the right (x=1940) and fades back in 1s before the next interaction begins.
  // This post-process wraps the existing expressions with higher-priority branches.
  const PARK_X = 1940; // safely past the 1920 right edge
  const SLIDE_OUT_DUR = 0.4;
  const SLIDE_IN_DUR  = 1.0;
  const PARK_GAP_MIN  = 2.0; // only park if idle gap is longer than this

  const activeEvents = trackingEvents.filter(e => e.action !== 'scroll');
  for (let i = 0; i < activeEvents.length; i++) {
    const ev   = activeEvents[i];
    const next = activeEvents[i + 1];

    const slideOutStart = ev.actionTime + 0.3;
    const slideOutEnd   = slideOutStart + SLIDE_OUT_DUR;
    // Park ends 1s before next move starts (so slide-in has room)
    const parkEnd = next ? next.actionTime - 1.0 - SLIDE_IN_DUR : ev.actionTime + 3.0;

    if (parkEnd - slideOutEnd < PARK_GAP_MIN) continue; // gap too short — skip

    // Slide cursor OUT to PARK_X over SLIDE_OUT_DUR seconds
    const slideOutX = smoothstepExpr('t', ev.cx, PARK_X, slideOutStart, SLIDE_OUT_DUR);
    const slideOutY = smoothstepExpr('t', ev.cy, ev.cy, slideOutStart, SLIDE_OUT_DUR); // Y holds

    overlayXExpr = `if(between(t,${slideOutStart},${slideOutEnd}),${slideOutX},if(between(t,${slideOutEnd},${parkEnd}),${PARK_X},${overlayXExpr}))`;
    overlayYExpr = `if(between(t,${slideOutStart},${slideOutEnd}),${slideOutY},if(between(t,${slideOutEnd},${parkEnd}),${ev.cy},${overlayYExpr}))`;

    if (next) {
      // Slide cursor IN from PARK_X to the next event's position
      const slideInStart = parkEnd;
      const slideInEnd   = slideInStart + SLIDE_IN_DUR;
      const slideInX = smoothstepExpr('t', PARK_X, next.cx, slideInStart, SLIDE_IN_DUR);
      const slideInY = smoothstepExpr('t', ev.cy, next.cy, slideInStart, SLIDE_IN_DUR);
      overlayXExpr = `if(between(t,${slideInStart},${slideInEnd}),${slideInX},${overlayXExpr})`;
      overlayYExpr = `if(between(t,${slideInStart},${slideInEnd}),${slideInY},${overlayYExpr})`;
    }
  }

  // ── Click Ripple Builder ───────────────────────────────────────────────────
  // 4-step decaying opacity drawbox chain per click: fast, tight (36×36 px),
  // realistic — mimics macOS/iOS tap feedback at normal viewing distance.
  const clickEventsForRipple = trackingEvents.filter(e => e.action === 'click');
  let rippleChain = '';
  if (clickEventsForRipple.length > 0) {
    const parts: string[] = [];
    for (const ev of clickEventsForRipple) {
      const cx = Math.round(ev.cx);
      const cy = Math.round(ev.cy);
      const T  = +ev.actionTime.toFixed(4);
      const steps = [
        { t0: T,        t1: T + 0.06, alpha: 0.55 },
        { t0: T + 0.06, t1: T + 0.12, alpha: 0.38 },
        { t0: T + 0.12, t1: T + 0.18, alpha: 0.22 },
        { t0: T + 0.18, t1: T + 0.25, alpha: 0.10 },
      ];
      for (const s of steps) {
        parts.push(
          `drawbox=x=${cx - 18}:y=${cy - 18}:w=36:h=36` +
          `:color=white@${s.alpha}:t=fill` +
          `:enable='between(t\\,${s.t0}\\,${s.t1})'`
        );
      }
    }
    rippleChain = parts.join(',');
  }

  // ── Construct Filtergraph ──────────────────────────────────────────────────
  let filterString = `[0:v]trim=start=${trimSeconds},setpts=PTS-STARTPTS,fps=30[vfps];`;

  if (fs.existsSync(cursorPng)) {
    filterString += `[vfps][1:v]overlay=x='${overlayXExpr}':y='${overlayYExpr}':eval=frame:shortest=1[withcursor];`;
    if (rippleChain) {
      // Ripple chain sits between cursor overlay and zoompan
      filterString += `[withcursor]${rippleChain}[withripple];`;
      filterString += `[withripple]zoompan=z='${zoomZExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=1920x1080:fps=30[vout];`;
    } else {
      filterString += `[withcursor]zoompan=z='${zoomZExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=1920x1080:fps=30[vout];`;
    }
  } else {
    filterString += `[vfps]zoompan=z='${zoomZExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=1920x1080:fps=30[vout];`;
  }

  // Audio Mix
  let mixInputs = '';
  let inputCount = 0;

  // Voiceover track
  const voInputIdx = fs.existsSync(cursorPng) ? 2 : 1;
  filterString += `[${voInputIdx}:a]apad=pad_dur=2[voicepad];`;
  mixInputs += `[voicepad]`;
  inputCount++;

  const command = ffmpeg().input(videoPath);
  if (fs.existsSync(cursorPng)) {
    command.input(cursorPng).inputOptions(['-loop 1']);
  }
  command.input(path.join(demoDir, 'voiceover.wav'));

  let sfxIndex = voInputIdx + 1;
  for (const step of demoSteps) {
    let tTime = timeline[step.id];
    if (tTime > 1000) tTime = tTime / 1000; // normalize to seconds

    if (step.action === 'click') {
       command.input(path.join(demoDir, 'assets', 'sounds', 'click.mp3'));
       const delayMs = Math.floor(tTime * 1000);
       filterString += `[${sfxIndex}:a]adelay=${delayMs}|${delayMs}[sfx${sfxIndex}];`;
       mixInputs += `[sfx${sfxIndex}]`;
       sfxIndex++;
       inputCount++;
    } else if (step.action === 'type') {
       command.input(path.join(demoDir, 'assets', 'sounds', 'keyboard.mp3'));
       const delayMs = Math.floor(tTime * 1000);
       filterString += `[${sfxIndex}:a]atrim=0:0.8,asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[sfx${sfxIndex}];`;
       mixInputs += `[sfx${sfxIndex}]`;
       sfxIndex++;
       inputCount++;
    }
  }
  
  filterString += `${mixInputs}amix=inputs=${inputCount}:duration=first:normalize=0[aout]`;

  await new Promise((resolve, reject) => {
    command
      .complexFilter([filterString])
      .outputOptions([
        '-map [vout]', 
        '-map [aout]', 
        '-c:v libx264', 
        '-pix_fmt yuv420p', 
        '-c:a aac', 
        '-r 30', 
        '-crf 18', 
        '-preset ultrafast'
      ])
      .save(finalOutput)
      .on('end', resolve)
      .on('error', reject);
  });
  
  console.log(`✨ Done! Final video saved to:`, finalOutput);
}
