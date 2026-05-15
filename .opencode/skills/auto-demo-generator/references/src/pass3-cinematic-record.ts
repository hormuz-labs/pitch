import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { DemoConfig, DemoStep, TrackingEvent, TrackingData } from './types';
import {
  getChromiumGpuFlags,
  getFFmpegHwAccelOptions,
  buildCursorAnimationExprs,
  buildCursorAlphaExpr,
  buildRippleChain,
  buildFilterString,
} from './utils';

export async function pass3(config: DemoConfig, startUrl: string, demoSteps: DemoStep[], demoDir: string) {
  console.log("== Pass 3: Raw Video Recording & JIT Tracking ==");
  const timeline = JSON.parse(fs.readFileSync(path.join(demoDir, 'timeline.json'), 'utf8'));
  
  const VIDEO_WIDTH = config.width || 1920;
  const VIDEO_HEIGHT = config.height || 1080;
  const CENTER_X = VIDEO_WIDTH / 2;
  const CENTER_Y = VIDEO_HEIGHT / 2;

  const browser = await chromium.launch({ 
    headless: true,
    args: getChromiumGpuFlags()
  });
  
  // Rasterize cursor to PNG for FFmpeg
  const cursorStyle = config.cursorStyle || 'black';
  const cursorFile = path.join(demoDir, 'assets', 'icons', `cursor-${cursorStyle}.svg`);
  const cursorPng = path.join(demoDir, 'cursor.png');
  if (!fs.existsSync(cursorFile)) {
    console.error(`Error: Cursor SVG not found at: ${cursorFile}`);
    console.error(`Make sure cursor-${cursorStyle}.svg exists in assets/icons/ before running the pipeline.`);
    process.exit(1);
  }
  try {
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
    console.log(`✅ Cursor PNG rasterized: ${cursorPng}`);
  } catch (e) {
    console.error(`Error: Cursor rasterization failed: ${e}`);
    process.exit(1);
  }

  const context = await browser.newContext({
    recordVideo: { dir: demoDir, size: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT } },
    viewport: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT }
  });
  const page = await context.newPage();
  
  // Force an immediate frame to start the video recording timestamp at ~0
  await page.setContent('<html><body style="background:white;"></body></html>');
  await page.waitForTimeout(100);

  const videoStartTime = Date.now();
  await page.goto(startUrl, { waitUntil: 'networkidle' });

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
  let prevCursorX = CENTER_X;
  let prevCursorY = CENTER_Y;

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
      let cx = box ? box.x + box.width / 2 : CENTER_X;
      let cy = box ? box.y + box.height / 2 : CENTER_Y;

      // Exact action time: Wait until the true action timestamp
      await waitForTime(actionTime);

      // Re-calculate exactly where it is NOW right before we click
      const finalBox = await loc.boundingBox();
      const finalCx = finalBox ? finalBox.x + finalBox.width / 2 : cx;
      const finalCy = finalBox ? finalBox.y + finalBox.height / 2 : cy;

      // The problem: `loc.click()` and `pressSequentially()` have internal Playwright overhead
      // (checking actionability, hit testing, etc). By the time the browser actually processes the click,
      // it's slightly later than `actionTime`. We capture the EXACT time the action finished
      // so we can sync the audio and visual cursor to the *actual* action.
      const timeBeforeAction = (Date.now() - startTime) / 1000;
      const syncedActionTime = timeBeforeAction + 0.05;

      // Log the tracking event
      // We log the tracking event with the syncedActionTime so the cursor arrives exactly on time.
      trackingEvents.push({
        id: step.id,
        actionTime: syncedActionTime,
        cx: finalCx,
        cy: finalCy,
        action: step.action
      });
      // Keep running cursor position so synthetic scroll events know where the cursor is
      prevCursorX = finalCx;
      prevCursorY = finalCy;

      // Perform the native action
      if (step.action === 'click') {
        // We use force: true to bypass some checks but Playwright still has overhead
        await loc.click({ force: true });
      } else if (step.action === 'type') {
        await loc.pressSequentially(step.value!, { delay: 80 });
      }

      const timeAfterAction = (Date.now() - startTime) / 1000;
      
      // Update the timeline to reflect when the action actually happened so audio syncs perfectly
      if (step.action === 'click' || step.action === 'type') {
          timeline[step.id] = syncedActionTime;
      }

    } else {
      // Steps without selectors (like Wait/Outro)
      await waitForTime(actionTime);
      trackingEvents.push({
        id: step.id,
        actionTime,
        cx: CENTER_X,
        cy: CENTER_Y,
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

  // Capture the video path NOW — before any keepAlive loop or context.close().
  // page.video()?.path() returns the path as soon as recording is started; it
  // stays valid even if the page crashes or the context is forcibly closed later.
  const videoPathCapture = await page.video()?.path();
  
  const elapsedFinal = Date.now() - startTime;
  if (elapsedFinal < totalAudioTimeMs) {
    const timeToWait = totalAudioTimeMs - elapsedFinal + 2000;
    
    // Force invisible DOM updates so Playwright continues writing video frames.
    // The DOM poke is fire-and-forget; if the page disappears mid-wait we just
    // swallow the error and let the recording tail finish on its own.
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

  // Safe close — the page may already be gone if it crashed during the tail wait
  await context.close().catch(() => {});
  await browser.close().catch(() => {});

  const videoPath = videoPathCapture;
  if (!videoPath || !fs.existsSync(videoPath)) throw new Error("Video not found!");

  const trackingData: TrackingData = { initDurationMs, events: trackingEvents };
  fs.writeFileSync(path.join(demoDir, 'tracking.json'), JSON.stringify(trackingData, null, 2));

  // --- FFmpeg POST-PROCESSING ---
  const { hasVaapi, hwFilterSuffix, hwOutputOpts } = getFFmpegHwAccelOptions();

  const trimSeconds = (initDurationMs / 1000).toFixed(3);
  console.log(`⏱️ Syncing Audio... Trimming page load dead time: ${trimSeconds}s`);
  console.log(`🎬 Encoding Final Video with FFmpeg Effects...`);
  
  const finalOutput = config.outputPath ? path.resolve(demoDir, config.outputPath) : path.join(demoDir, 'demo-final.mp4');
  const tempRawOut = finalOutput.replace('.mp4', '-raw.mp4');
  
  // Build cursor and zoom animations using FFmpeg math expressions
  // Sort events by time so synthetic scroll events are ordered correctly
  trackingEvents.sort((a, b) => a.actionTime - b.actionTime);

  const { overlayXExpr, overlayYExpr, zoomZExpr, panXExpr, panYExpr } =
    buildCursorAnimationExprs(trackingEvents, VIDEO_WIDTH, VIDEO_HEIGHT);

  const cursorAlphaExpr = buildCursorAlphaExpr(trackingEvents);

  const rippleChain = buildRippleChain(trackingEvents, timeline);

  const { filterString } = buildFilterString({
    trimSeconds,
    rippleChain,
    cursorPngExists: fs.existsSync(cursorPng),
    cursorAlphaExpr,
    overlayXExpr,
    overlayYExpr,
    zoomZExpr,
    panXExpr,
    panYExpr,
    hwFilterSuffix,
    videoWidth: VIDEO_WIDTH,
    videoHeight: VIDEO_HEIGHT,
    demoSteps,
    timeline,
  });

  // Playwright WebM is variable-rate. We MUST NOT use -vsync cfr on the input
  // because it will ignore WebM timestamps and count frames, causing the video
  // to shrink (lose idle time) and video events to happen *before* the audio/overlay.
  // Instead, we let the `fps=30` filter inside the filter_complex handle the VFR->CFR
  // conversion correctly based on the PTS (Presentation Time Stamp).
  const command = ffmpeg().input(videoPath);
  const cursorPngExists = fs.existsSync(cursorPng);
  if (cursorPngExists) {
    command.input(cursorPng).inputOptions(['-loop 1']);
  }
  command.input(path.join(demoDir, 'voiceover.wav'));

  // Attach SFX inputs in the same order that buildFilterString indexed them
  for (const step of demoSteps) {
    if (step.action === 'click') {
      command.input(path.join(demoDir, 'assets', 'sounds', 'click.mp3'));
    } else if (step.action === 'type') {
      // Loop the 8-second keyboard.mp3 infinitely so we never run out of audio for long text
      command.input(path.join(demoDir, 'assets', 'sounds', 'keyboard.mp3')).inputOptions(['-stream_loop -1']);
    }
  }

  // Write the filter graph to a script file to avoid shell argument length limits
  // (the geq ripple expressions alone can be several kilobytes for many clicks)
  const filterScriptPath = path.join(demoDir, 'filters.txt');
  fs.writeFileSync(filterScriptPath, filterString);

  await new Promise((resolve, reject) => {
    if (hasVaapi) command.addOption('-vaapi_device', '/dev/dri/renderD128');
    command
      .outputOptions([
        '-filter_complex_script', filterScriptPath,
        // BUG FIX: each flag must be a separate array element.
        // fluent-ffmpeg splits strings on spaces internally, so '-map [vout]' as a
        // single string becomes ['-map', '[vout]'] correctly, BUT values like
        // 'comment=Generated by auto-demo-generator at <ISO date>' get split at the
        // spaces, turning 'auto-demo-generator' into a spurious output filename.
        // ffmpeg then hangs trying to open it. Always split flag/value pairs and
        // never use space-containing values in a single outputOptions string.
        '-map', '[vout]',
        '-map', '[aout]',
        ...hwOutputOpts,
        '-profile:v', 'high',
        '-level:v', '4.2',
        '-c:a', 'aac',
        '-r', '30',
        '-movflags', '+faststart',
        '-metadata', `title=${config.outputPath ? path.basename(config.outputPath, '.mp4') : 'demo'}`,
      ])
      .save(tempRawOut)
      .on('end', resolve)
      .on('error', reject);
  });

  // ── Concatenate intro + main demo ───────────────────────────────────────
  const introPathFile = path.join(demoDir, 'intro-path.txt');
  let hasStitched = false;
  const metadataTitle = config.outputPath ? path.basename(config.outputPath, '.mp4') : 'demo';
  const metadataComment = `Generated by auto-demo-generator at ${new Date().toISOString()}`;
  if (fs.existsSync(introPathFile)) {
    const introVideo = fs.readFileSync(introPathFile, 'utf8').trim();
    if (fs.existsSync(introVideo)) {
      console.log('🎬 Stitching intro cinematic...');
      
      await new Promise((resolve, reject) => {
        // IMPORTANT: The intro .webm recorded by Playwright has NO audio stream.
        // Using [0:a] or aresample on a missing stream causes FFmpeg to hang forever.
        // Instead generate a silent track via anullsrc for exactly the intro duration.
        const stitchFilter =
          '[0:v]fps=30,format=yuv420p[iv];' +
          'anullsrc=channel_layout=stereo:sample_rate=48000:duration=3.5[ia];' +
          '[1:v]fps=30,format=yuv420p[mv];' +
          '[1:a]aresample=48000[ma];' +
          `[iv][ia][mv][ma]concat=n=2:v=1:a=1${hasVaapi ? '[v_concat][aout];[v_concat]format=nv12,hwupload[vout]' : '[vout][aout]'}`;

        // Safety timeout: reject if FFmpeg stalls for >3 min
        const hangGuard = setTimeout(
          () => reject(new Error('stitchIntro: FFmpeg timed out after 3 minutes')),
          3 * 60 * 1000
        );
        
        const stitchCmd = ffmpeg().input(introVideo).input(tempRawOut);
        if (hasVaapi) stitchCmd.addOption('-vaapi_device', '/dev/dri/renderD128');
        
        stitchCmd
          .outputOptions([
            '-filter_complex', stitchFilter,
            '-map', '[vout]',
            '-map', '[aout]',
            ...hwOutputOpts,
            '-profile:v', 'high',
            '-level:v', '4.2',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-metadata', `title=${metadataTitle}`,
          ])
          .save(finalOutput)
          .on('stderr', () => process.stdout.write('.'))
          .on('end', () => { clearTimeout(hangGuard); resolve(null); })
          .on('error', (e: Error) => { clearTimeout(hangGuard); reject(e); });
      });

      console.log(`✨ Intro stitched successfully!`);
      hasStitched = true;
      // Clean up the raw file
      if (fs.existsSync(tempRawOut)) fs.unlinkSync(tempRawOut);
    }
  }

  // If no intro was stitched, just rename the raw output to final
  if (!hasStitched) {
    fs.renameSync(tempRawOut, finalOutput);
  }

  console.log(`✨ Done! Final video saved to:`, finalOutput);
}
