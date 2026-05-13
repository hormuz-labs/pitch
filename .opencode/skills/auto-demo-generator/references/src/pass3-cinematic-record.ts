import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { DemoConfig, DemoStep, TrackingEvent, TrackingData } from './types';
import { smoothstepExpr, springOvershootExpr, getChromiumGpuFlags, getFFmpegHwAccelOptions } from './utils';

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
  let overlayXExpr = `${CENTER_X}`;
  let overlayYExpr = `${CENTER_Y}`;
  let zoomZExpr = "1";
  let panXExpr = "0";
  let panYExpr = "0";
  
  let prevCx = CENTER_X;
  let prevCy = CENTER_Y;
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
      if (prevZoom <= 1.0) continue; // Skip scroll pan when not zoomed

      const scrolledY = ev.scrollY ?? 0;
      const targetScrollPanY = Math.min(Math.max(0, scrolledY - CENTER_Y / prevZoom), VIDEO_HEIGHT - VIDEO_HEIGHT / prevZoom);
      panYExpr = `if(between(time,${moveStart},${tTime}),${smoothstepExpr('time', runningPanY, targetScrollPanY, moveStart, moveDuration)},if(gt(time,${tTime}),${targetScrollPanY},${panYExpr}))`;
      runningPanY = targetScrollPanY;
      continue; // skip cursor and zoom update for scroll-only events
    }

    const targetZoom = ev.action === 'wait' ? 1.0 : 1.2;

    // ── Cursor overlay (smoothstep easing, evaluates 't') ────────────────────
    overlayXExpr = `if(between(t,${moveStart},${tTime}),${smoothstepExpr('t', prevCx, ev.cx, moveStart, moveDuration)},if(gt(t,${tTime}),${ev.cx},${overlayXExpr}))`;
    overlayYExpr = `if(between(t,${moveStart},${tTime}),${smoothstepExpr('t', prevCy, ev.cy, moveStart, moveDuration)},if(gt(t,${tTime}),${ev.cy},${overlayYExpr}))`;

    // ── Zoom (spring overshoot on zoom-in, plain smoothstep on zoom-out) ─────
    const OVERSHOOT_FRACTION = 0.1; // 10% of the zoom delta
    const overshootAmt = targetZoom > prevZoom 
      ? (targetZoom - prevZoom) * OVERSHOOT_FRACTION 
      : 0;
    const zoomInterp = (targetZoom !== prevZoom)
      ? springOvershootExpr('time', prevZoom, targetZoom, overshootAmt, moveStart, moveDuration)
      : `${targetZoom}`;
    zoomZExpr = `if(between(time,${moveStart},${tTime}),${zoomInterp},if(gt(time,${tTime}),${targetZoom},${zoomZExpr}))`;

    // ── Pan (smoothstep easing, evaluates 'time') ────────────────────────────
    const targetPanX = Math.min(Math.max(0, ev.cx - VIDEO_WIDTH / (2 * targetZoom)), VIDEO_WIDTH - VIDEO_WIDTH / targetZoom);
    const targetPanY = Math.min(Math.max(0, ev.cy - VIDEO_HEIGHT / (2 * targetZoom)), VIDEO_HEIGHT - VIDEO_HEIGHT / targetZoom);

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
  // When no interaction is happening for >4s, the cursor fades out in place,
  // and fades back in 1s before the next interaction begins.
  const FADE_OUT_DUR = 0.4;
  const FADE_IN_DUR  = 1.0;
  const PARK_GAP_MIN = 4.0; 

  let cursorAlphaExpr = "1";

  const activeEvents = trackingEvents.filter(e => e.action !== 'scroll');
  for (let i = 0; i < activeEvents.length; i++) {
    const ev   = activeEvents[i];
    const next = activeEvents[i + 1];

    const fadeOutStart = ev.actionTime + PARK_GAP_MIN;
    const fadeOutEnd   = fadeOutStart + FADE_OUT_DUR;
    // Fade in ends 1s before next move starts
    // BUG FIX: when there is no next event (last action), the old code set
    // fadeInEnd = fadeOutEnd + 100 — a timestamp 100s beyond the video end.
    // zoompan/geq would then try to process frames up to that phantom time,
    // hanging FFmpeg indefinitely. For the last event we only fade out; no fade-in.
    if (!next) {
      const fadeOut = smoothstepExpr('T', 1, 0, fadeOutStart, FADE_OUT_DUR);
      cursorAlphaExpr = `if(between(T,${fadeOutStart},${fadeOutEnd}),${fadeOut},if(gt(T,${fadeOutEnd}),0,${cursorAlphaExpr}))`;
      continue;
    }

    const fadeInEnd   = next.actionTime - 1.0;
    const fadeInStart = fadeInEnd - FADE_IN_DUR;

    // Only apply if the gap between fade out and fade in is large enough
    if (fadeInStart - fadeOutEnd < 0.5) continue;

    const fadeOut = smoothstepExpr('T', 1, 0, fadeOutStart, FADE_OUT_DUR);
    const fadeIn  = smoothstepExpr('T', 0, 1, fadeInStart, FADE_IN_DUR);

    cursorAlphaExpr = `if(between(T,${fadeOutStart},${fadeOutEnd}),${fadeOut},if(between(T,${fadeOutEnd},${fadeInStart}),0,if(between(T,${fadeInStart},${fadeInEnd}),${fadeIn},${cursorAlphaExpr})))`;
  }

  // ── Click Ripple Builder (drawbox — fast, no per-pixel math) ─────────────
  // Replaces the old geq-based circular ring which evaluated sqrt/pow per pixel
  // at 1920×1080 × 30fps — roughly 60M pixel ops/sec per click, making FFmpeg
  // encode a 60s video in 10+ minutes. drawbox with enable= is ~30× faster.
  const clickEventsForRipple = trackingEvents.filter(e => e.action === 'click');
  const rippleDrawboxParts: string[] = [];
  for (const ev of clickEventsForRipple) {
    const cx = Math.round(ev.cx);
    const cy = Math.round(ev.cy);
    const T0 = +ev.actionTime.toFixed(4);
    // 4 expanding rings, each active for a 0.1s window within 0.4s total
    const rings = [
      { r: 8,  tStart: T0,        dur: 0.10, alpha: 0.55 },
      { r: 16, tStart: T0 + 0.10, dur: 0.10, alpha: 0.38 },
      { r: 26, tStart: T0 + 0.20, dur: 0.10, alpha: 0.22 },
      { r: 36, tStart: T0 + 0.30, dur: 0.10, alpha: 0.10 },
    ];
    for (const ring of rings) {
      const x = cx - ring.r;
      const y = cy - ring.r;
      const w = ring.r * 2;
      const tEnd = +(ring.tStart + ring.dur).toFixed(4);
      rippleDrawboxParts.push(
        `drawbox=x=${x}:y=${y}:w=${w}:h=${w}:color=white@${ring.alpha}:t=2:enable='between(t,${ring.tStart},${tEnd})'`
      );
    }
  }
  const rippleChain = rippleDrawboxParts.join(',');

  // ── Construct Filtergraph ──────────────────────────────────────────────────
  // Z-order: raw_video → [drawbox ripples inline] → [cursor overlay] → [zoompan] → [vout]
  // drawbox filters are chained inline on the stream (no intermediate label needed).
  // Cursor geq only operates on the tiny 48×48 cursor PNG — NOT the full 1920×1080 frame.
  let filterString = `[0:v]trim=start=${trimSeconds},setpts=PTS-STARTPTS,fps=30`;

  if (rippleChain) {
    filterString += `,${rippleChain}`;
  }
  filterString += `[vfps];`;

  if (fs.existsSync(cursorPng)) {
    filterString += `[1:v]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*(${cursorAlphaExpr})'[cur];`;
    filterString += `[vfps][cur]overlay=x='${overlayXExpr}':y='${overlayYExpr}':eval=frame:shortest=1[withcursor];`;
    filterString += `[withcursor]zoompan=z='${zoomZExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=30${hwFilterSuffix}[vout];`;
  } else {
    filterString += `[vfps]zoompan=z='${zoomZExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:fps=30${hwFilterSuffix}[vout];`;
  }

  // Audio Mix
  let mixInputs = '';
  let inputCount = 0;

  // Voiceover track
  const voInputIdx = fs.existsSync(cursorPng) ? 2 : 1;
  filterString += `[${voInputIdx}:a]apad=pad_dur=2[voicepad];`;
  mixInputs += `[voicepad]`;
  inputCount++;

  // Force constant frame rate on the Playwright WebM source (which is variable-rate)
  // This prevents frame duplication artefacts and audio drift on long recordings.
  const command = ffmpeg().input(videoPath).inputOptions(['-vsync cfr']);
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
       // Loop the 8-second keyboard.mp3 infinitely so we never run out of audio for long text
       command.input(path.join(demoDir, 'assets', 'sounds', 'keyboard.mp3')).inputOptions(['-stream_loop -1']);
       const delayMs = Math.floor(tTime * 1000);
       // Calculate exact typing duration: 80ms per character
       const typeDuration = ((step.value?.length || 10) * 0.08).toFixed(2);
       filterString += `[${sfxIndex}:a]atrim=0:${typeDuration},asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[sfx${sfxIndex}];`;
       mixInputs += `[sfx${sfxIndex}]`;
       sfxIndex++;
       inputCount++;
    }
  }
  
  filterString += `${mixInputs}amix=inputs=${inputCount}:duration=first:normalize=0[aout]`;

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
