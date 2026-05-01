// @ts-nocheck

import puppeteer from 'puppeteer';
import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';

dotenv.config();

const DEMO_DIR = path.join(process.cwd(), 'demo/shadcn-reference');

// --- UTILS FOR WAV CONVERSION ---
interface WavConversionOptions {
  numChannels: number,
  sampleRate: number,
  bitsPerSample: number
}

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
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  return buffer;
}

// --- PHASE 1: DIRECT PUPPETEER CAPTURE ---
async function capturePhase() {
  console.log("🚀 Capturing high-res screenshots and exact coordinates...");
  if (!fs.existsSync(DEMO_DIR)) fs.mkdirSync(DEMO_DIR, { recursive: true });

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // CRITICAL: Force 2x scale for crisp 1080p rendering later
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  
  await page.goto('https://ui.shadcn.com/', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(DEMO_DIR, 'step-1.png') });
  
  const docsBox = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('a')).find(a => a.textContent?.trim() === 'Docs');
    const rect = el!.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  
  await page.goto('https://ui.shadcn.com/docs', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(DEMO_DIR, 'step-2.png') });

  const searchBtnBox = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Search'));
    const rect = el!.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Search'))?.click();
  });
  await page.waitForSelector('[cmdk-input]', { visible: true });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(DEMO_DIR, 'step-3.png') });

  const cmdkBox = await page.evaluate(() => {
    const el = document.querySelector('[cmdk-input]');
    const rect = el!.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, left: rect.left, width: rect.width };
  });

  await page.type('[cmdk-input]', 'Accordion', { delay: 30 });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(DEMO_DIR, 'step-4.png') });

  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(DEMO_DIR, 'step-5.png') });
  
  await browser.close();

  fs.writeFileSync(path.join(DEMO_DIR, 'manifest.json'), JSON.stringify({ docsBox, searchBtnBox, cmdkBox }, null, 2));
  console.log("✅ Capture complete!");
}

// --- PHASE 2: VOICEOVER GENERATION ---
async function voiceoverPhase() {
  console.log("🎙️ Generating Voiceover...");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = 'gemini-3.1-flash-tts-preview';
  const scriptText = "Welcome to ShadCN UI. The beautiful, accessible component library for your React apps. Let's explore how to get started. To find any component, simply click the search bar, type your query like 'Accordion', and hit Enter. You'll instantly see the component documentation, complete with installation guides and interactive examples. Build your next project with ShadCN. Thank you for watching!";

  const response = await ai.models.generateContentStream({
    model,
    config: { responseModalities: ['audio'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } } } },
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
  console.log("✅ Voiceover generated!");
}

// --- PHASE 2.5: TRANSCRIPTION ---
async function transcribePhase() {
  console.log("📝 Transcribing Voiceover...");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const audioBuffer = fs.readFileSync(path.join(DEMO_DIR, 'voiceover.wav'));

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { mimeType: 'audio/wav', data: audioBuffer.toString('base64') } },
        { text: 'Listen to the audio and provide a complete transcript. Output the result as a raw JSON array of objects (do not wrap in markdown ```json blocks). Each object must have keys: "word", "startMs", "endMs".' }
      ]
    }]
  });

  const text = result.text;
  const jsonMatch = text.match(/\[.*\]/s);
  if (!jsonMatch) throw new Error("Failed to parse transcription JSON.");

  fs.writeFileSync(path.join(DEMO_DIR, 'timestamps.json'), jsonMatch[0]);
  console.log("✅ Transcription saved!");
}

// --- PHASE 3: RENDER ENGINE (STATE MACHINE) ---
async function renderPhase() {
  console.log("🎞️ Rendering Frames...");
  const manifest = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'manifest.json'), 'utf8'));
  const timestamps = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'timestamps.json'), 'utf8'));

  const findWord = (w: string, after = 0) => {
    const match = timestamps.find((t: any) => t.word.toLowerCase().replace(/[^a-z0-9]/g, '') === w.toLowerCase() && t.startMs >= after);
    return match ? match.startMs / 1000 : null;
  };

  const TIMELINE = {
    tDocs: findWord('explore') || 7.5,
    tSearch: findWord('search') || 11.8,
    tTypeStart: findWord('type') || 12.8,
    tTypeEnd: (findWord('type') || 12.8) + 1.0,
    tEnter: findWord('enter') || 15.0,
    tZoomOut: (findWord('enter') || 15.0) + 1.7
  };

  const totalAudioDuration = timestamps[timestamps.length - 1].endMs / 1000;
  const finalVideoDuration = Math.max(totalAudioDuration, TIMELINE.tZoomOut + 3.0);

  // CRITICAL: Avoid backticks inside the script tag to prevent ESBuild Unterminated String errors
  const animatorHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; overflow: hidden; background: #000; width: 1920px; height: 1080px; font-family: sans-serif; }
    #camera { width: 1920px; height: 1080px; transform-origin: 0 0; position: absolute; top: 0; left: 0; }
    .screenshot { width: 100%; height: 100%; position: absolute; top: 0; left: 0; display: none; }
    #screenshot-1 { display: block; }
    #cursor { position: absolute; width: 32px; height: 32px; z-index: 100; transform-origin: top left; pointer-events: none; }
    #ripple-container { position:absolute;top:0;left:0;width:1920px;height:1080px;pointer-events:none;z-index:100; }
    #intro-card, #outro-card { position:absolute; top:0; left:0; width:1920px; height:1080px; background:#0a0a0f; display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:200; }
    #intro-card { opacity: 1; }
    #outro-card { opacity: 0; }
    .card-title { font:700 64px/1.2 sans-serif; color:#fff; }
    .card-subtitle { font:400 28px/1 sans-serif; color:rgba(255,255,255,0.5); margin-top:18px; }
  </style>
</head>
<body>
  <div id="camera">
    <img id="screenshot-1" class="screenshot" src="step-1.png" />
    <img id="screenshot-2" class="screenshot" src="step-2.png" />
    <img id="screenshot-3" class="screenshot" src="step-3.png" />
    <img id="screenshot-4" class="screenshot" src="step-4.png" />
    <img id="screenshot-5" class="screenshot" src="step-5.png" />
    <img id="cursor" src="cursor.svg" />
    <div id="ripple-container"></div>
  </div>
  <div id="intro-card"><div class="card-title">ShadCN UI</div><div class="card-subtitle">Beautiful, accessible components</div></div>
  <div id="outro-card"><div class="card-title">Build with ShadCN</div><div class="card-subtitle">ui.shadcn.com</div></div>
  
  <script>
    const MANIFEST = ` + JSON.stringify(manifest) + `;
    const TIMELINE = ` + JSON.stringify(TIMELINE) + `;
    const FINAL_DUR = ` + finalVideoDuration + `;
    const INTRO_DUR = 1.5;
    const OUTRO_START = FINAL_DUR - 1.5;

    const camera = document.getElementById('camera');
    const cursor = document.getElementById('cursor');
    const rippleContainer = document.getElementById('ripple-container');

    const easeInOut = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
    const clamp01 = t => Math.min(1, Math.max(0, t));
    const interp = (a, b, p) => a + (b - a) * p;

    function spawnRipple(x, y, t) {
      const el = document.createElement('div');
      el.style.cssText = 'position: absolute; left: ' + x + 'px; top: ' + y + 'px; width: 0px; height: 0px; border-radius: 50%; background: rgba(0,0,0,0.3); transform: translate(-50%, -50%) scale(0); pointer-events: none;';
      rippleContainer.appendChild(el);
      el.dataset.spawnTime = String(t);
    }

    const DOCS = MANIFEST.docsBox;
    const SEARCH = MANIFEST.searchBtnBox;

    window.renderFrame = function(t) {
      let cx = 960, cy = 540, zoom = 1.0, cScale = 1.0;
      let shot = 1, typeP = 0;

      document.getElementById('intro-card').style.opacity = t < INTRO_DUR ? String(1 - easeInOut(clamp01((t - 1.0)/0.5))) : '0';
      document.getElementById('outro-card').style.opacity = t >= OUTRO_START ? String(easeInOut(clamp01((t - OUTRO_START)/1.5))) : '0';

      // --- EXPLICIT STATE MACHINE ---
      if (t < TIMELINE.tDocs - 1.5) {
        let p = easeInOut(clamp01((t - INTRO_DUR) / (TIMELINE.tDocs - 1.5 - INTRO_DUR)));
        cx = interp(960, DOCS.x, p); cy = interp(540, DOCS.y, p); zoom = interp(1.0, 1.3, p); shot = 1;
      } else if (t < TIMELINE.tDocs) {
        cx = DOCS.x; cy = DOCS.y; zoom = 1.3; shot = 1;
      } else if (t < TIMELINE.tSearch) {
        let gap = TIMELINE.tSearch - TIMELINE.tDocs;
        let dur = Math.max(1.5, Math.min(gap, 2.0));
        let startMoveT = TIMELINE.tSearch - dur;
        if (t < startMoveT) {
          cx = DOCS.x; cy = DOCS.y; zoom = 1.3; shot = 2;
        } else {
          let p = easeInOut(clamp01((t - startMoveT) / dur));
          cx = interp(DOCS.x, SEARCH.x, p); cy = interp(DOCS.y, SEARCH.y, p);
          zoom = p < 0.5 ? interp(1.3, 1.0, p*2) : interp(1.0, 1.5, (p-0.5)*2); shot = 2;
        }
      } else if (t < TIMELINE.tTypeStart) {
        let p = easeInOut(clamp01((t - TIMELINE.tSearch) / (TIMELINE.tTypeStart - TIMELINE.tSearch)));
        cx = SEARCH.x; cy = SEARCH.y; zoom = interp(1.5, 1.1, p); shot = 3;
      } else if (t < TIMELINE.tTypeEnd) {
        cx = SEARCH.x; cy = SEARCH.y; zoom = 1.1; shot = 4;
        typeP = clamp01((t - TIMELINE.tTypeStart) / (TIMELINE.tTypeEnd - TIMELINE.tTypeStart));
      } else if (t < TIMELINE.tEnter) {
        cx = SEARCH.x; cy = SEARCH.y; zoom = 1.1; shot = 4; typeP = 1;
      } else if (t < TIMELINE.tZoomOut) {
        let gap = TIMELINE.tZoomOut - TIMELINE.tEnter;
        let dur = Math.max(1.5, Math.min(gap, 2.0));
        let startMoveT = TIMELINE.tZoomOut - dur;
        if (t < startMoveT) {
          cx = SEARCH.x; cy = SEARCH.y; zoom = 1.1; shot = 5;
        } else {
          let p = easeInOut(clamp01((t - startMoveT) / dur));
          cx = SEARCH.x; cy = SEARCH.y; zoom = interp(1.1, 1.0, p); shot = 5;
        }
      } else {

      // --- CLICK RIPPLES ---
      if (t >= TIMELINE.tDocs && t < TIMELINE.tDocs + 0.22) {
        let p = (t - TIMELINE.tDocs) / 0.22; cScale = p < 0.5 ? 1 - (p*0.3) : 0.7 + ((p-0.5)*0.3);
        if (Math.abs(t - TIMELINE.tDocs) < 0.034) spawnRipple(DOCS.x, DOCS.y, t);
      }
      if (t >= TIMELINE.tSearch && t < TIMELINE.tSearch + 0.22) {
        let p = (t - TIMELINE.tSearch) / 0.22; cScale = p < 0.5 ? 1 - (p*0.3) : 0.7 + ((p-0.5)*0.3);
        if (Math.abs(t - TIMELINE.tSearch) < 0.034) spawnRipple(SEARCH.x, SEARCH.y, t);
      }

      const isActive = (t >= INTRO_DUR && t < OUTRO_START);
      let cOp = 1;
      if (!isActive) {
        const driftP = easeInOut(clamp01((t < INTRO_DUR ? t : (t - OUTRO_START)) / 0.8));
        cx += 400 * driftP; cOp = 1 - driftP;
      }

      document.querySelectorAll('.screenshot').forEach(img => { img.style.display = 'none'; img.style.clipPath = 'none'; });

      if (shot === 4) {
        document.getElementById('screenshot-3').style.display = 'block';
        const s4 = document.getElementById('screenshot-4');
        s4.style.display = 'block';
        const charP = Math.floor(typeP * 9) / 9;
        const revealW = MANIFEST.cmdkBox.left + (MANIFEST.cmdkBox.width * charP);
        s4.style.clipPath = 'inset(0px ' + (1920 - revealW) + 'px 0px 0px)';
      } else {
        document.getElementById('screenshot-' + shot).style.display = 'block';
      }

      cursor.style.left = cx + 'px'; cursor.style.top = cy + 'px';
      cursor.style.transform = 'scale(' + cScale + ')'; cursor.style.opacity = String(cOp);

      let camX = Math.min(0, Math.max(960 - cx * zoom, 1920 - 1920 * zoom));
      let camY = Math.min(0, Math.max(540 - cy * zoom, 1080 - 1080 * zoom));
      camera.style.transform = 'translate(' + camX + 'px, ' + camY + 'px) scale(' + zoom + ')';

      for (const ripple of rippleContainer.querySelectorAll('div')) {
        const age = t - parseFloat(ripple.dataset.spawnTime);
        if (age > 0.22) { ripple.remove(); continue; }
        const p = age / 0.22;
        ripple.style.width = (40 * (1 - Math.pow(1 - p, 3))) + 'px';
        ripple.style.height = (40 * (1 - Math.pow(1 - p, 3))) + 'px';
        ripple.style.opacity = String(0.4 * (1 - p));
      }
    };
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(DEMO_DIR, 'animator.html'), animatorHtml);

  const fps = 30;
  const totalFrames = Math.ceil(finalVideoDuration * fps);
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--force-device-scale-factor=2'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.goto('file://' + path.resolve(DEMO_DIR, 'animator.html'));
  
  for (let i = 0; i < totalFrames; i++) {
    await page.evaluate('window.renderFrame(' + (i / fps) + ')');
    await page.screenshot({ path: path.join(DEMO_DIR, 'frame-' + String(i).padStart(4, '0') + '.png') });
  }
  await browser.close();
  console.log("✅ Rendered frames!");
}

// --- PHASE 4: FFmpeg ENCODING (VOLUME NORMALIZED) ---
async function encodePhase() {
  console.log("🎬 Encoding Final Video (Audio Normalized)...");
  const timestamps = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'timestamps.json'), 'utf8'));
  const TIMELINE = { tDocs: 8.2, tSearch: 11.8, tTypeStart: 12.8, tTypeEnd: 13.8, tEnter: 15.0, tZoomOut: 16.7 };
  const totalAudioDuration = timestamps[timestamps.length - 1].endMs / 1000;
  const padAmount = Math.max(0, (TIMELINE.tZoomOut + 3.0) - totalAudioDuration);
  const outputPath = path.join(process.cwd(), 'public/demo-cinematic.mp4');
  
  const command = ffmpeg();
  command.input(path.join(DEMO_DIR, 'frame-%04d.png')).inputOptions(['-framerate 30']);
  command.input(path.join(DEMO_DIR, 'voiceover.wav'));
  command.input(path.join(DEMO_DIR, 'keyboard.mp3'));
  command.input(path.join(DEMO_DIR, 'keyboard.mp3'));
  command.input(path.join(DEMO_DIR, 'click.mp3'));
  command.input(path.join(DEMO_DIR, 'click.mp3'));

  const typeDur = TIMELINE.tTypeEnd - TIMELINE.tTypeStart;

  // CRITICAL: apad on SFX + normalize=0 prevents volume ramping
  command.complexFilter([
    `[1:a]apad=pad_dur=${padAmount}[voicepad]`,
    `[2:a]atrim=0:${typeDur},asetpts=PTS-STARTPTS,adelay=${TIMELINE.tTypeStart * 1000}|${TIMELINE.tTypeStart * 1000},apad[typing]`,
    `[3:a]atrim=0:0.1,asetpts=PTS-STARTPTS,adelay=${TIMELINE.tEnter * 1000}|${TIMELINE.tEnter * 1000},apad[enterkey]`,
    `[4:a]adelay=${TIMELINE.tDocs * 1000}|${TIMELINE.tDocs * 1000},apad[click1]`,
    `[5:a]adelay=${TIMELINE.tSearch * 1000}|${TIMELINE.tSearch * 1000},apad[click2]`,
    `[voicepad][typing][enterkey][click1][click2]amix=inputs=5:duration=first:normalize=0[aout]`
  ]);

  command.outputOptions(['-map 0:v', '-map [aout]', '-c:v libx264', '-preset slow', '-crf 18', '-pix_fmt yuv420p', '-c:a aac', '-b:a 192k', '-shortest']);
  
  await new Promise((resolve, reject) => {
    command.on('end', resolve).on('error', reject).save(outputPath);
  });
  console.log("✨ Done! Video saved to:", outputPath);
}

// Orchestrator
async function main() {
  // Comment out phases as needed during active development
  // await capturePhase();
  // await voiceoverPhase();
  // await transcribePhase();
  // await renderPhase();
  // await encodePhase();
  console.log("Pipeline reference is ready. Uncomment phases in main() to run.");
}
main().catch(console.error);
