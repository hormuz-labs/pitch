import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { DemoConfig, DemoStep, TrackingEvent, TrackingData } from './types';

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
      
      // Perform smooth scroll to bring it into view
      await loc.evaluate((node) => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(() => loc.scrollIntoViewIfNeeded());

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

  for (let i = 0; i < trackingEvents.length; i++) {
    const ev = trackingEvents[i];
    const tTime = ev.actionTime; 
    const moveDuration = 1.0; 
    const moveStart = Math.max(0, tTime - moveDuration);
    
    const targetZoom = ev.action === 'wait' ? 1.0 : 1.2;
    
    // Interpolation macros
    const interpT = (prev: number, target: number) => `${prev}+(${target}-${prev})*(t-${moveStart})/${moveDuration}`;
    const interpTime = (prev: number, target: number) => `${prev}+(${target}-${prev})*(time-${moveStart})/${moveDuration}`;

    // Cursor overlay expressions (evaluates 't')
    overlayXExpr = `if(between(t,${moveStart},${tTime}),${interpT(prevCx, ev.cx)},if(gt(t,${tTime}),${ev.cx},${overlayXExpr}))`;
    overlayYExpr = `if(between(t,${moveStart},${tTime}),${interpT(prevCy, ev.cy)},if(gt(t,${tTime}),${ev.cy},${overlayYExpr}))`;

    // Zoompan expressions (evaluates 'time')
    zoomZExpr = `if(between(time,${moveStart},${tTime}),${interpTime(prevZoom, targetZoom)},if(gt(time,${tTime}),${targetZoom},${zoomZExpr}))`;
    
    const targetPanX = Math.min(Math.max(0, ev.cx - 1920/(2*targetZoom)), 1920 - 1920/targetZoom);
    const targetPanY = Math.min(Math.max(0, ev.cy - 1080/(2*targetZoom)), 1080 - 1080/targetZoom);
    const prevPanX = Math.min(Math.max(0, prevCx - 1920/(2*prevZoom)), 1920 - 1920/prevZoom);
    const prevPanY = Math.min(Math.max(0, prevCy - 1080/(2*prevZoom)), 1080 - 1080/prevZoom);

    panXExpr = `if(between(time,${moveStart},${tTime}),${interpTime(prevPanX, targetPanX)},if(gt(time,${tTime}),${targetPanX},${panXExpr}))`;
    panYExpr = `if(between(time,${moveStart},${tTime}),${interpTime(prevPanY, targetPanY)},if(gt(time,${tTime}),${targetPanY},${panYExpr}))`;

    prevCx = ev.cx;
    prevCy = ev.cy;
    prevZoom = targetZoom;
  }

  // Ensure zoom doesn't break if no events exist
  if (trackingEvents.length === 0) {
    zoomZExpr = "1";
    panXExpr = "0";
    panYExpr = "0";
  }

  // Construct Filtergraph
  let filterString = `[0:v]trim=start=${trimSeconds},setpts=PTS-STARTPTS,fps=30[vfps];`;
  
  // Add cursor overlay if PNG was created
  if (fs.existsSync(cursorPng)) {
    filterString += `[vfps][1:v]overlay=x='${overlayXExpr}':y='${overlayYExpr}':eval=frame:shortest=1[withcursor];`;
    filterString += `[withcursor]zoompan=z='${zoomZExpr}':x='${panXExpr}':y='${panYExpr}':d=1:s=1920x1080:fps=30[vout];`;
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
