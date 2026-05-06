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

window.moveCursor = (x, y) => {
  const cursor = document.getElementById('cinematic-cursor');
  if(cursor) { cursor.style.left = x + 'px'; cursor.style.top = y + 'px'; }
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

window.zoomCamera = (scale, cx, cy) => {
  let camX = Math.min(0, Math.max(960 - cx * scale, 1920 - 1920 * scale));
  let camY = Math.min(0, Math.max(540 - cy * scale, 1080 - 1080 * scale));
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
  Write a 20-30 second voiceover script for a product demo video based on this requirement: "${USER_REQ}".
  The video follows these steps: 
  ${flowDescriptions}
  
  The script should be energetic and professional. Do NOT include any stage directions like [clicks]. Just the spoken words.
  `;
  const scriptRes = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: scriptPrompt });
  const scriptText = scriptRes.text!.trim();
  console.log("📝 Script:", scriptText);

  console.log("🎙️ Generating Voiceover...");
  const response = await ai.models.generateContentStream({
    model: 'gemini-3.1-flash-tts-preview',
    config: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } } },
    contents: [{ role: 'user', parts: [{ text: scriptText }] }],
  });

  const chunks: Buffer[] = [];
  let responseMimeType = 'audio/pcm;rate=24000';
  for await (const chunk of response) {
    const inlineData = chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (inlineData) {
      if (inlineData.mimeType) responseMimeType = inlineData.mimeType;
      chunks.push(Buffer.from(inlineData.data || '', 'base64'));
    }
  }

  const rawPcmBuffer = Buffer.concat(chunks);
  let finalAudioBuffer = rawPcmBuffer;
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
        { text: 'Listen to the audio and provide a complete transcript. Output the result as a raw JSON array of objects (do not wrap in markdown ```json blocks). Each object must have keys: "word", "startMs", "endMs".' }
      ]
    }]
  });

  const jsonMatch = transcribeRes.text!.match(/\[.*\]/s);
  if (!jsonMatch) throw new Error("Failed to parse transcription JSON.");
  fs.writeFileSync(path.join(DEMO_DIR, 'timestamps.json'), jsonMatch[0]);

  console.log("🧠 Mapping timeline...");
  const mappingPrompt = `
  You are mapping UI interactions to a voiceover timeline.
  Transcript: ${jsonMatch[0]}
  
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
  
  const startTime = Date.now();
  const waitForTime = async (targetSeconds: number) => {
    const targetMs = targetSeconds * 1000;
    const elapsed = Date.now() - startTime;
    if (elapsed < targetMs) {
      await page.waitForTimeout(targetMs - elapsed);
    }
  };

  await page.goto(START_URL);
  await page.evaluate(getSetupCinematic(cursorSvg));
  await page.evaluate(() => (window as any).setupCinematic());

  // Execute generic engine
  for (const step of demoSteps) {
    const actionTime = timeline[step.id];

    if (step.selector) {
      const loc = page.locator(step.selector).first();

      // 1. Pre-action: Wait until 1.2s before the action is supposed to happen
      await waitForTime(actionTime - 1.2);
      
      // Ensure the element is present on screen RIGHT NOW and grab its live coordinates
      await loc.waitFor({ state: 'visible', timeout: 5000 });
      await loc.scrollIntoViewIfNeeded();
      await page.waitForTimeout(50); // small buffer for layout shift
      const box = await loc.boundingBox();
      
      // Fallback to center screen if for some reason boundingBox fails
      const cx = box ? box.x + box.width / 2 : 960;
      const cy = box ? box.y + box.height / 2 : 540;

      // Start the CSS camera zoom and cursor movement
      await page.evaluate(({x,y}) => {
        (window as any).moveCursor(x, y);
        (window as any).zoomCamera(1.2, x, y);
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
        await page.evaluate(() => (window as any).zoomCamera(1.0, 960, 540));
        await page.waitForTimeout(2000); // Give zoom time to finish
      }
    }
  }
  
  await context.close();
  await browser.close();

  // Multiplexing
  const files = fs.readdirSync(DEMO_DIR);
  const videoFile = files.find(f => f.endsWith('.webm'));
  if (!videoFile) throw new Error("Video not found!");

  console.log(`🎬 Encoding Final Video...`);
  const finalOutput = config.outputPath ? path.resolve(DEMO_DIR, config.outputPath) : path.join(DEMO_DIR, 'demo-final.mp4');
  
  // Dynamically build audio filters based on steps
  let filterString = '[1:a]apad=pad_dur=2[voicepad]';
  let mixInputs = '[voicepad]';
  let inputCount = 1;
  const command = ffmpeg().input(path.join(DEMO_DIR, videoFile)).input(path.join(DEMO_DIR, 'voiceover.wav'));

  let sfxIndex = 2;
  for (const step of demoSteps) {
    if (step.action === 'click') {
       command.input(path.join(DEMO_DIR, 'click.mp3'));
       const delayMs = Math.floor(timeline[step.id] * 1000);
       filterString += `,[${sfxIndex}:a]adelay=${delayMs}|${delayMs}[sfx${sfxIndex}]`;
       mixInputs += `[sfx${sfxIndex}]`;
       sfxIndex++;
       inputCount++;
    } else if (step.action === 'type') {
       command.input(path.join(DEMO_DIR, 'keyboard.mp3'));
       const delayMs = Math.floor(timeline[step.id] * 1000);
       // Assuming typing takes roughly 0.8 seconds based on keyboard.mp3 generation
       filterString += `,[${sfxIndex}:a]atrim=0:0.8,asetpts=PTS-STARTPTS,adelay=${delayMs}|${delayMs}[sfx${sfxIndex}]`;
       mixInputs += `[sfx${sfxIndex}]`;
       sfxIndex++;
       inputCount++;
    }
  }
  
  filterString += `,${mixInputs}amix=inputs=${inputCount}:duration=first:normalize=0[aout]`;

  await new Promise((resolve, reject) => {
    command
      .complexFilter([filterString])
      .outputOptions(['-map 0:v', '-map [aout]', '-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-shortest', '-crf 18', '-preset fast'])
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

main().catch(console.error);