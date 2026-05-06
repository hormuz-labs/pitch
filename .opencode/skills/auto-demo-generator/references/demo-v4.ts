import { chromium, Page } from 'playwright';
import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * V4.4 Cinematic Pipeline Reference (Generic Engine + JIT Layout)
 * Defines UI interactions via a JSON array. 
 * Grabs live bounding boxes Just-In-Time (JIT) during recording 
 * to perfectly handle dynamic layouts, ads, and responsive shifts.
 */

const ai = new GoogleGenAI({});

// --- 1. CONFIGURATION (Passed via JSON file as first CLI argument) ---
const configFile = process.argv[2];
if (!configFile || !fs.existsSync(configFile)) {
  throw new Error("Please provide a valid path to a configuration JSON file as the first argument.");
}

const DEMO_DIR = path.dirname(path.resolve(configFile));
if (!fs.existsSync(DEMO_DIR)) fs.mkdirSync(DEMO_DIR, { recursive: true });

interface DemoConfig {
  startUrl: string;
  userReq: string;
  outputPath?: string;
  cursorStyle?: 'black' | 'white';
  steps: DemoStep[];
}

interface DemoStep {
  id: string;
  description: string;
  action: 'click' | 'type' | 'wait';
  selector?: string;
  value?: string;
}

const config: DemoConfig = JSON.parse(fs.readFileSync(configFile, 'utf8'));

if (!config.startUrl) throw new Error("config.startUrl is required.");
if (!config.userReq) throw new Error("config.userReq is required.");
if (!config.steps || config.steps.length === 0) throw new Error("config.steps is required and cannot be empty.");

const START_URL = config.startUrl;
const USER_REQ = config.userReq;
const demoSteps = config.steps;
// -----------------------------------------------------------------


// --- AUDIO HELPERS ---
interface WavConversionOptions { numChannels: number, sampleRate: number, bitsPerSample: number }
function parseMimeType(mimeType: string): WavConversionOptions {
  const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
  const [_, format] = fileType.split('/');
  const options: Partial<WavConversionOptions> = { numChannels: 1, sampleRate: 24000, bitsPerSample: 16 };
  if (format && format.toLowerCase().startsWith('l')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) options.bitsPerSample = bits;
  }
  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') options.sampleRate = parseInt(value, 10);
  }
  return options as WavConversionOptions;
}
function createWavHeader(dataLength: number, options: WavConversionOptions) {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8); buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22); buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28); buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34); buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

// --- INJECTION SCRIPT ---
const getSetupCinematic = (svgContent: string) => `
window.setupCinematic = () => {
  const svg = \`${svgContent}\`;
  const cursor = document.createElement('img');
  cursor.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  cursor.id = 'cinematic-cursor';
  cursor.style.cssText = 'position:fixed; top:540px; left:960px; z-index:999999; pointer-events:none; transition: left 1.2s cubic-bezier(0.25, 1, 0.5, 1), top 1.2s cubic-bezier(0.25, 1, 0.5, 1), transform 0.2s; margin-top:-2px; margin-left:-2px; transform-origin: 2px 2px;';
  document.body.appendChild(cursor);

  const rippleContainer = document.createElement('div');
  rippleContainer.id = 'ripple-container';
  rippleContainer.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; z-index:999998; pointer-events:none;';
  document.body.appendChild(rippleContainer);

  document.documentElement.style.transition = 'transform 1.5s cubic-bezier(0.25, 1, 0.5, 1)';
  document.documentElement.style.transformOrigin = '0 0';
};

window.moveCursor = (x, y, duration = 1.2) => {
  const cursor = document.getElementById('cinematic-cursor');
  if(cursor) { 
    cursor.style.transition = \`left \${duration}s cubic-bezier(0.25, 1, 0.5, 1), top \${duration}s cubic-bezier(0.25, 1, 0.5, 1), transform 0.2s\`;
    cursor.style.left = x + 'px'; 
    cursor.style.top = y + 'px'; 
  }
};

window.clickCursor = () => {
  const cursor = document.getElementById('cinematic-cursor');
  if(cursor) { cursor.style.transform = 'scale(0.8)'; setTimeout(() => cursor.style.transform = 'scale(1)', 200); }
};

window.spawnRipple = (x, y) => {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute; left:'+x+'px; top:'+y+'px; width:0px; height:0px; border-radius:50%; background:rgba(0,0,0,0.15); transform:translate(-50%, -50%); pointer-events:none; border:1px solid rgba(0,0,0,0.1); transition:all 0.4s ease-out;';
  document.getElementById('ripple-container').appendChild(el);
  requestAnimationFrame(() => { el.style.width = '120px'; el.style.height = '120px'; el.style.opacity = '0'; });
  setTimeout(() => el.remove(), 400);
};

window.zoomCamera = (scale, cx, cy, duration = 1.2) => {
  let camX = Math.min(0, Math.max(960 - cx * scale, 1920 - 1920 * scale));
  let camY = Math.min(0, Math.max(540 - cy * scale, 1080 - 1080 * scale));
  document.documentElement.style.transition = \`transform \${duration}s cubic-bezier(0.25, 1, 0.5, 1)\`;
  document.documentElement.style.transform = 'translate(' + camX + 'px, ' + camY + 'px) scale(' + scale + ')';
};
`;

async function pass1() {
  console.log("== Pass 1: Generic Flow Validation ==");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  
  await page.goto(START_URL);
  await page.waitForLoadState('networkidle');

  for (const step of demoSteps) {
    if (step.selector) {
      console.log(`Validating step: ${step.id}`);
      const loc = page.locator(step.selector).first();
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      await loc.scrollIntoViewIfNeeded();
      
      if (step.action === 'click') {
        await loc.click();
      } else if (step.action === 'type') {
        await loc.fill(step.value!);
      }
      
      await page.waitForTimeout(1000); 
    }
  }

  await browser.close();
  console.log("✅ Flow validated successfully.");
}

async function pass2() {
  console.log("== Pass 2: Generating Speech & Timestamps ==");
  
  const flowDescriptions = demoSteps.map(s => `- ${s.id}: ${s.description}`).join('\n');
  const requiredKeys = demoSteps.map(s => s.id);

  const scriptPrompt = `
  Write a direct, concise voiceover script for a product demo video based on this requirement: "${USER_REQ}".
  The video follows these steps sequentially: 
  ${flowDescriptions}
  
  CRITICAL PACING RULES:
  - DO NOT use conversational filler words, padding, or lengthy descriptions. Keep instructions bare and simple (e.g. "Click the search bar.", "Type nike shoes.").
  - To ensure there is a pause between actions, you MUST insert multiple ellipses (... ... ...) between the spoken instructions. This creates a natural silence in the voiceover so the actions have time to execute without adding unnecessary words.
  - Example: "Click the search bar. ... ... ... Now type nike shoes. ... ... ... Click the search button. ... ... ..."
  - The more ellipses you add, the longer the pause. Add at least three sets of ellipses between every single action.
  
  The script should be energetic and professional but minimal in word count. Do NOT include any stage directions like [clicks].
  `;
  const scriptRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: scriptPrompt });
  const scriptText = scriptRes.text!.trim();
  console.log("📝 Script:", scriptText);

  console.log("🎙️ Generating Voiceover...");
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-tts-preview',
    config: { speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } },
    contents: [{ role: 'user', parts: [{ text: scriptText }] }],
  });

  let finalAudioBuffer: Buffer;
  let responseMimeType = 'audio/pcm;rate=24000';
  
  const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!inlineData || !inlineData.data) {
     throw new Error("Failed to get audio data from model");
  }
  if (inlineData.mimeType) responseMimeType = inlineData.mimeType;
  
  const rawPcmBuffer = Buffer.from(inlineData.data, 'base64');
  finalAudioBuffer = rawPcmBuffer;
  if (mime.getExtension(responseMimeType) !== 'wav') {
    const options = parseMimeType(responseMimeType);
    finalAudioBuffer = Buffer.concat([createWavHeader(rawPcmBuffer.length, options), rawPcmBuffer]);
  }
  fs.writeFileSync(path.join(DEMO_DIR, 'voiceover.wav'), finalAudioBuffer);

  console.log("📝 Transcribing Voiceover...");
  const transcribeRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'audio/wav', data: finalAudioBuffer.toString('base64') } },
        { text: 'Listen to the audio and provide a complete transcript. Each object must have keys: "word", "startMs", "endMs".' }
      ]
    }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            word: { type: "STRING" },
            startMs: { type: "NUMBER" },
            endMs: { type: "NUMBER" }
          },
          required: ["word", "startMs", "endMs"]
        }
      }
    }
  });

  fs.writeFileSync(path.join(DEMO_DIR, 'timestamps.json'), transcribeRes.text!);

  console.log("🧠 Mapping timeline...");
  const mappingPrompt = `
  You are mapping UI interactions to a voiceover timeline.
  Transcript: ${transcribeRes.text!}
  
  Actions:
  ${flowDescriptions}
  
  Output a JSON object with keys for each action ID. Values should be time in seconds (e.g., 2.500) indicating when the action should happen based on the semantic context of the transcript. Make sure actions are sequential.
  `;
  
  const properties: Record<string, { type: "NUMBER" }> = {};
  requiredKeys.forEach(k => properties[k] = { type: "NUMBER" });

  const mappingRes = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: mappingPrompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: { type: "OBJECT", properties, required: requiredKeys }
    }
  });

  const timeline = JSON.parse(mappingRes.text!.trim());
  fs.writeFileSync(path.join(DEMO_DIR, 'timeline.json'), JSON.stringify(timeline, null, 2));
  console.log("✅ Timeline mapped natively via JSON rules.");
}

async function pass3() {
  console.log("== Pass 3: Generic Cinematic Recording (with JIT Coordinates) ==");
  const timeline = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'timeline.json'), 'utf8'));
  
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
    recordVideo: { dir: DEMO_DIR, size: { width: 1920, height: 1080 } },
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
  
  await page.goto(START_URL);

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
      // We start the scroll 1.5 seconds before the action
      await waitForTime(actionTime - 1.5); 

      // Ensure the element is visible
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      
      // Perform smooth scroll to bring it into view cinematically
      await loc.evaluate((node) => {
        node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }).catch(() => loc.scrollIntoViewIfNeeded());

      // 2. Wait until 0.5s before the action to zoom and move cursor
      // This ensures the scroll has settled so the bounding box is accurate
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

      // 2. Exact action time: Wait until the true action timestamp
      await waitForTime(actionTime);

      // Perform the cinematic ripple and native action
      if (step.action === 'click') {
        await page.evaluate(({x,y}) => { (window as any).clickCursor(); (window as any).spawnRipple(x,y); }, { x: cx, y: cy });
        await loc.click({ force: true });
      } else if (step.action === 'type') {
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
  const timestampsData = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'timestamps.json'), 'utf8'));
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
  // We use the exact wall-clock time spent loading the page before `startTime` was declared.
  const trimSeconds = (initDurationMs / 1000).toFixed(3);
  console.log(`⏱️ Syncing Audio... Trimming page load dead time: ${trimSeconds}s`);

  console.log(`🎬 Encoding Final Video...`);
  const finalOutput = config.outputPath ? path.resolve(DEMO_DIR, config.outputPath) : path.join(DEMO_DIR, 'demo-final.mp4');
  
  // Dynamically build filters
  // 1. Trim the video exactly by the dead time so it aligns with 0s
  let filterString = `[0:v]trim=start=${trimSeconds},setpts=PTS-STARTPTS[vout];[1:a]apad=pad_dur=2[voicepad]`;
  let mixInputs = '[voicepad]';
  let inputCount = 1;
  const command = ffmpeg().input(videoPath).input(path.join(DEMO_DIR, 'voiceover.wav'));

  let sfxIndex = 2;
  for (const step of demoSteps) {
    if (step.action === 'click') {
       command.input(path.join(DEMO_DIR, 'click.mp3'));
       const delayMs = Math.floor(timeline[step.id] * 1000);
       filterString += `;[${sfxIndex}:a]adelay=${delayMs}|${delayMs}[sfx${sfxIndex}]`;
       mixInputs += `[sfx${sfxIndex}]`;
       sfxIndex++;
       inputCount++;
    } else if (step.action === 'type') {
       command.input(path.join(DEMO_DIR, 'keyboard.mp3'));
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

async function main() {
  await pass1();
  await pass2();
  await pass3();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});