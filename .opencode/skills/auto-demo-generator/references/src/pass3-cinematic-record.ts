import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import { DemoConfig, DemoStep } from './types';
import { getSetupCinematic } from './utils';

export async function pass3(config: DemoConfig, startUrl: string, demoSteps: DemoStep[], demoDir: string) {
  console.log("== Pass 3: Generic Cinematic Recording (with JIT Coordinates) ==");
  const timeline = JSON.parse(fs.readFileSync(path.join(demoDir, 'timeline.json'), 'utf8'));
  
  const cursorStyle = config.cursorStyle || 'black';
  const fillColor = cursorStyle === 'black' ? '#000000' : '#FFFFFF';
  const strokeColor = cursorStyle === 'black' ? '#FFFFFF' : '#000000';
  const cursorSvg = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g filter="url(#drop-shadow)">
    <path d="M 2 2 L 2 34 L 10 26 L 16 40 L 22 38 L 16 24 L 26 24 Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round"/>
  </g>
  <defs>
    <filter id="drop-shadow" x="-4" y="-4" width="56" height="56" filterUnits="userSpaceOnUse">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.4"/>
    </filter>
  </defs>
</svg>`;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    recordVideo: { dir: demoDir, size: { width: 1920, height: 1080 } },
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();
  
  // Force an immediate frame to start the video recording timestamp at ~0
  await page.setContent('<html><body style="background:white;"></body></html>');
  await page.waitForTimeout(100);

  const videoStartTime = Date.now();

  await context.addInitScript(`
    ${getSetupCinematic(cursorSvg)}
    const initCine = () => { if (!document.getElementById('cinematic-cursor')) window.setupCinematic(); };
    if (document.readyState === 'interactive' || document.readyState === 'complete') { initCine(); }
    else { document.addEventListener('DOMContentLoaded', initCine); }
  `);
  
  await page.goto(startUrl);

  // Wait for layout to settle
  await page.waitForTimeout(2000);

  const startTime = Date.now();
  const initDurationMs = startTime - videoStartTime;

  const waitForTime = async (targetSeconds: number) => {
    const targetMs = targetSeconds * 1000;
    const elapsed = Date.now() - startTime;
    if (elapsed < targetMs) {
      await page.waitForTimeout(targetMs - elapsed);
    }
  };

  // Execute generic engine
  for (const step of demoSteps) {
    const actionTime = timeline[step.id];

    if (step.selector) {
      const loc = page.locator(step.selector).first();

      // 1. Give time for a cinematic smooth scroll BEFORE zooming
      // We start the scroll 2.0 seconds before the action to ensure it fully settles
      await waitForTime(actionTime - 2.0); 

      // Ensure the element is visible
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      
      // Perform smooth scroll to bring it into view cinematically
      await loc.evaluate((node) => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(() => loc.scrollIntoViewIfNeeded());

      // 2. Wait until 0.5s before the action to zoom and move cursor
      // This gives 1.5 full seconds for the scroll to settle so the bounding box is accurate
      await waitForTime(actionTime - 0.5);
      
      const box = await loc.boundingBox();
      
      // Fallback to center screen if for some reason boundingBox fails
      const cx = box ? box.x + box.width / 2 : 960;
      const cy = box ? box.y + box.height / 2 : 540;

      // Start the CSS camera zoom and cursor movement (faster travel now)
      await page.evaluate(({x,y}) => {
        (window as any).moveCursor(x, y, 0.5);
        (window as any).zoomCamera(1.2, x, y, 0.5);
      }, { x: cx, y: cy });

      // 3. Exact action time: Wait until the true action timestamp
      await waitForTime(actionTime);

      // Re-calculate exactly where it is NOW right before we click
      // This fixes the "cursor slightly up/down" bug if layout shifted or scroll was still easing
      const finalBox = await loc.boundingBox();
      const finalCx = finalBox ? finalBox.x + finalBox.width / 2 : cx;
      const finalCy = finalBox ? finalBox.y + finalBox.height / 2 : cy;

      // Perform the cinematic ripple and native action
      if (step.action === 'click') {
        await page.evaluate(({x,y}) => { 
          // Snap to perfect final coordinates instantly if it drifted
          (window as any).moveCursor(x, y, 0); 
          (window as any).clickCursor(); 
          (window as any).spawnRipple(x,y); 
        }, { x: finalCx, y: finalCy });
        await loc.click({ force: true });
      } else if (step.action === 'type') {
        await page.evaluate(({x,y}) => { 
          (window as any).moveCursor(x, y, 0); 
        }, { x: finalCx, y: finalCy });
        await loc.pressSequentially(step.value!, { delay: 80 });
      }
    } else {
      // Steps without selectors (like Wait/Outro)
      await waitForTime(actionTime);
      if (step.id === 'tOutro') {
        await page.evaluate(() =>         (window as any).zoomCamera(1.0, 960, 540, 1.2));
        await page.waitForTimeout(2000); // Give zoom time to finish
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
    
    // Force invisible DOM updates so Playwright continues writing video frames!
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

  // --- AUDIO / VIDEO SYNC FIX ---
  const trimSeconds = (initDurationMs / 1000).toFixed(3);
  console.log(`⏱️ Syncing Audio... Trimming page load dead time: ${trimSeconds}s`);

  console.log(`🎬 Encoding Final Video...`);
  const finalOutput = config.outputPath ? path.resolve(demoDir, config.outputPath) : path.join(demoDir, 'demo-final.mp4');
  
  // Dynamically build filters
  let filterString = `[0:v]trim=start=${trimSeconds},setpts=PTS-STARTPTS[vout];[1:a]apad=pad_dur=2[voicepad]`;
  let mixInputs = '[voicepad]';
  let inputCount = 1;
  const command = ffmpeg().input(videoPath).input(path.join(demoDir, 'voiceover.wav'));

  let sfxIndex = 2;
  for (const step of demoSteps) {
    if (step.action === 'click') {
       command.input(path.join(demoDir, 'assets', 'sounds', 'click.mp3'));
       const delayMs = Math.floor(timeline[step.id] * 1000);
       filterString += `;[${sfxIndex}:a]adelay=${delayMs}|${delayMs}[sfx${sfxIndex}]`;
       mixInputs += `[sfx${sfxIndex}]`;
       sfxIndex++;
       inputCount++;
    } else if (step.action === 'type') {
       command.input(path.join(demoDir, 'assets', 'sounds', 'keyboard.mp3'));
       const delayMs = Math.floor(timeline[step.id] * 1000);
       filterString += `;[${sfxIndex}:a]atrim=0:0.8,asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[sfx${sfxIndex}]`;
       mixInputs += `[sfx${sfxIndex}]`;
       sfxIndex++;
       inputCount++;
    }
  }
  
  filterString += `;${mixInputs}amix=inputs=${inputCount}:duration=first:normalize=0[aout]`;

  await new Promise((resolve, reject) => {
    command
      .complexFilter([filterString])
      .outputOptions(['-map [vout]', '-map [aout]', '-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-r 30', '-crf 18', '-preset ultrafast'])
      .save(finalOutput)
      .on('end', resolve)
      .on('error', reject);
  });
  
  console.log(`✨ Done! Final video saved to:`, finalOutput);
}