
import puppeteer from 'puppeteer';
import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';

dotenv.config();

const DEMO_DIR = path.join(process.cwd(), 'demo/search-demo');

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

async function voiceoverPhase() {
  console.log("🎙️ Generating Voiceover...");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = 'gemini-3.1-flash-tts-preview';
  const scriptText = "Finding exactly what you need is incredibly fast with ShadCN UI. Just click the search bar or use the command palette shortcut. Start typing Accordion, and hit enter to jump straight to the documentation. Smooth, instant, and completely accessible. Happy building!";

  const response = await ai.models.generateContentStream({
    model,
    config: { 
      responseModalities: ['audio'], 
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } } } 
    },
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

async function renderPhase() {
  console.log("🎞️ Rendering Frames...");
  const manifest = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'manifest.json'), 'utf8'));
  const timestamps = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'timestamps.json'), 'utf8'));

  const findWord = (w: string, after = 0) => {
    const match = timestamps.find((t: any) => t.word.toLowerCase().replace(/[^a-z0-9]/g, '') === w.toLowerCase() && t.startMs >= after);
    return match ? match.startMs / 1000 : null;
  };

  const TIMELINE = {
    tSearchClick: findWord('click') || 4.5,
    tTypeStart: findWord('typing') || 8.0,
    tTypeEnd: (findWord('typing') || 8.0) + 0.9, 
    tEnter: findWord('enter') || 10.2,
    tOutro: findWord('building') || 15.0
  };

  const totalAudioDuration = timestamps[timestamps.length - 1].endMs / 1000;
  const finalVideoDuration = Math.max(totalAudioDuration + 2.0, TIMELINE.tOutro + 3.0);

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
    <img id="cursor" src="cursor-black.svg" />
    <div id="ripple-container"></div>
  </div>
  <div id="intro-card"><div class="card-title">Instant Search</div><div class="card-subtitle">ShadCN Command Palette</div></div>
  <div id="outro-card"><div class="card-title">Happy Building!</div><div class="card-subtitle">ui.shadcn.com</div></div>
  
  <script>
    const MANIFEST = ` + JSON.stringify(manifest) + `;
    const TIMELINE = ` + JSON.stringify(TIMELINE) + `;
    const FINAL_DUR = ` + finalVideoDuration + `;
    const INTRO_DUR = 1.5;

    const camera = document.getElementById('camera');
    const cursor = document.getElementById('cursor');
    const rippleContainer = document.getElementById('ripple-container');

    // Softer cubic easing for a smoother, less jerky feeling even at the same speed
    const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const clamp01 = t => Math.min(1, Math.max(0, t));
    const interp = (a, b, p) => a + (b - a) * p;

    function spawnRipple(x, y, t) {
      const el = document.createElement('div');
      // Ripple centered exactly on x,y with a dark color for visibility against light backgrounds
      el.style.cssText = 'position: absolute; left: ' + x + 'px; top: ' + y + 'px; width: 0px; height: 0px; border-radius: 50%; background: rgba(0,0,0,0.15); transform: translate(-50%, -50%) scale(0); pointer-events: none; border: 1px solid rgba(0,0,0,0.1);';
      rippleContainer.appendChild(el);
      el.dataset.spawnTime = String(t);
    }

    const humanTypeEase = (p) => {
      const steps = 9; 
      const stepped = Math.floor(p * steps) / steps;
      const distorted = stepped + 0.05 * Math.sin(p * Math.PI * steps);
      return clamp01(Math.max(stepped, distorted));
    };

    window.renderFrame = function(t) {
      let cx = 960, cy = 540, zoom = 1.0, cScale = 1.0, shot = 1, typeP = 0;

      document.getElementById('intro-card').style.opacity = t < INTRO_DUR ? String(1 - easeInOut(clamp01((t - 1.0)/0.5))) : '0';
      document.getElementById('outro-card').style.opacity = t >= TIMELINE.tOutro ? String(easeInOut(clamp01((t - TIMELINE.tOutro)/1.0))) : '0';

      // 1.5s movement duration paired with softer cubic easing feels very deliberate and natural
      const MOVE_DUR = 1.5;

      // Target exactly the centers of the elements
      const searchTx = MANIFEST.searchBtnBox.x + MANIFEST.searchBtnBox.width / 2;
      const searchTy = MANIFEST.searchBtnBox.y + MANIFEST.searchBtnBox.height / 2;
      
      const cmdkTx = MANIFEST.cmdkBox.x + 50; // Typing starts left-aligned, plus some padding
      const cmdkTy = MANIFEST.cmdkBox.y + MANIFEST.cmdkBox.height / 2;

      const resultTx = MANIFEST.resultBox.x + MANIFEST.resultBox.width / 2;
      const resultTy = MANIFEST.resultBox.y + MANIFEST.resultBox.height / 2;

      if (t < TIMELINE.tSearchClick - MOVE_DUR) {
        cx = 960; cy = 540; zoom = 1.0; shot = 1;
      } else if (t < TIMELINE.tSearchClick) {
        let p = easeInOut(clamp01((t - (TIMELINE.tSearchClick - MOVE_DUR)) / MOVE_DUR));
        cx = interp(960, searchTx, p); cy = interp(540, searchTy, p); 
        zoom = interp(1.0, 1.4, p); shot = 1;
      } else if (t < TIMELINE.tTypeStart - MOVE_DUR) {
        cx = searchTx; cy = searchTy; zoom = 1.4; shot = 2;
      } else if (t < TIMELINE.tTypeStart) {
        let p = easeInOut(clamp01((t - (TIMELINE.tTypeStart - MOVE_DUR)) / MOVE_DUR));
        cx = interp(searchTx, cmdkTx, p); cy = interp(searchTy, cmdkTy, p); 
        zoom = interp(1.4, 1.2, p); shot = 2;
      } else if (t < TIMELINE.tTypeEnd) {
        cx = cmdkTx; cy = cmdkTy; zoom = 1.2; shot = 3;
        typeP = humanTypeEase(clamp01((t - TIMELINE.tTypeStart) / (TIMELINE.tTypeEnd - TIMELINE.tTypeStart)));
      } else if (t < TIMELINE.tEnter - MOVE_DUR) {
        cx = cmdkTx; cy = cmdkTy; zoom = 1.2; shot = 3; typeP = 1;
      } else if (t < TIMELINE.tEnter) {
        let p = easeInOut(clamp01((t - (TIMELINE.tEnter - MOVE_DUR)) / MOVE_DUR));
        cx = interp(cmdkTx, resultTx, p); cy = interp(cmdkTy, resultTy, p); 
        zoom = 1.2; shot = 3; typeP = 1;
      } else if (t < TIMELINE.tEnter + 1.5) {
        let p = easeInOut(clamp01((t - TIMELINE.tEnter) / 1.5));
        cx = resultTx; cy = resultTy; 
        zoom = interp(1.2, 1.1, p); shot = 4;
      } else {
        cx = resultTx; cy = resultTy; zoom = 1.1; shot = 4;
      }

      if (t >= TIMELINE.tSearchClick && t < TIMELINE.tSearchClick + 0.2) {
        let p = (t - TIMELINE.tSearchClick) / 0.2; cScale = p < 0.5 ? 1 - (p*0.4) : 0.6 + ((p-0.5)*0.4);
        if (Math.abs(t - TIMELINE.tSearchClick) < 0.02) spawnRipple(searchTx, searchTy, t);
      }
      if (t >= TIMELINE.tEnter && t < TIMELINE.tEnter + 0.2) {
        let p = (t - TIMELINE.tEnter) / 0.2; cScale = p < 0.5 ? 1 - (p*0.4) : 0.6 + ((p-0.5)*0.4);
        if (Math.abs(t - TIMELINE.tEnter) < 0.02) spawnRipple(resultTx, resultTy, t);
      }

      document.querySelectorAll('.screenshot').forEach(img => { img.style.display = 'none'; img.style.clipPath = 'none'; });

      if (shot === 3) {
        document.getElementById('screenshot-2').style.display = 'block';
        const s3 = document.getElementById('screenshot-3');
        s3.style.display = 'block';
        const revealW = MANIFEST.cmdkBox.x + (MANIFEST.cmdkBox.width * typeP);
        s3.style.clipPath = 'inset(0px ' + (1920 - revealW) + 'px 0px 0px)';
      } else {
        document.getElementById('screenshot-' + shot).style.display = 'block';
      }

      cursor.style.left = cx + 'px'; cursor.style.top = cy + 'px';
      cursor.style.transform = 'scale(' + cScale + ')';

      let camX = Math.min(0, Math.max(960 - cx * zoom, 1920 - 1920 * zoom));
      let camY = Math.min(0, Math.max(540 - cy * zoom, 1080 - 1080 * zoom));
      camera.style.transform = 'translate(' + camX + 'px, ' + camY + 'px) scale(' + zoom + ')';

      for (const ripple of rippleContainer.querySelectorAll('div')) {
        const age = t - parseFloat(ripple.dataset.spawnTime);
        if (age > 0.4) { ripple.remove(); continue; }
        const p = age / 0.4;
        ripple.style.width = (120 * p) + 'px'; ripple.style.height = (120 * p) + 'px'; ripple.style.opacity = String(0.6 * (1 - p));
      }
    };
  </script>
</body>
</html>
`;
  fs.writeFileSync(path.join(DEMO_DIR, 'animator.html'), animatorHtml);

  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--force-device-scale-factor=2'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  await page.goto('file://' + path.resolve(DEMO_DIR, 'animator.html'));
  
  const fps = 30;
  const totalFrames = Math.ceil(finalVideoDuration * fps);
  console.log('Rendering ' + totalFrames + ' frames...');
  for (let i = 0; i < totalFrames; i++) {
    if (i % 30 === 0) console.log('Rendered ' + i + '/' + totalFrames + ' frames...');
    await page.evaluate('window.renderFrame(' + (i / fps) + ')');
    await page.screenshot({ path: path.join(DEMO_DIR, 'frame-' + String(i).padStart(4, '0') + '.png') });
  }
  await browser.close();
}

async function encodePhase() {
  console.log("🎬 Encoding Final Video...");
  const timestamps = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'timestamps.json'), 'utf8'));
  const findWord = (w: string, after = 0) => {
    const match = timestamps.find((t: any) => t.word.toLowerCase().replace(/[^a-z0-9]/g, '') === w.toLowerCase() && t.startMs >= after);
    return match ? match.startMs / 1000 : null;
  };
  
  const TIMELINE = {
    tSearchClick: findWord('click') || 4.5,
    tTypeStart: findWord('typing') || 8.0,
    tTypeEnd: (findWord('typing') || 8.0) + 0.9, 
    tEnter: findWord('enter') || 10.2,
    tOutro: findWord('building') || 15.0
  };

  const typeDur = TIMELINE.tTypeEnd - TIMELINE.tTypeStart;
  const outputPath = path.join(process.cwd(), 'public/search-demo.mp4');
  
  const command = ffmpeg();
  command.input(path.join(DEMO_DIR, 'frame-%04d.png')).inputOptions(['-framerate 30']);
  command.input(path.join(DEMO_DIR, 'voiceover.wav'));
  command.input(path.join(DEMO_DIR, 'keyboard.mp3'));
  command.input(path.join(DEMO_DIR, 'click.mp3')); // Click 1
  command.input(path.join(DEMO_DIR, 'click.mp3')); // Click 2

  // apad ensures the audio mix doesn't dynamically crank up the volume when a short SFX ends
  command.complexFilter([
    '[1:a]apad=pad_dur=2[voicepad]',
    '[2:a]atrim=0:' + typeDur + ',asetpts=PTS-STARTPTS,adelay=' + (TIMELINE.tTypeStart * 1000) + '|' + (TIMELINE.tTypeStart * 1000) + ',apad[typing]',
    '[3:a]adelay=' + (TIMELINE.tSearchClick * 1000) + '|' + (TIMELINE.tSearchClick * 1000) + ',apad[click1]',
    '[4:a]adelay=' + (TIMELINE.tEnter * 1000) + '|' + (TIMELINE.tEnter * 1000) + ',apad[click2]',
    '[voicepad][typing][click1][click2]amix=inputs=4:duration=first:normalize=0[aout]'
  ]);

  command.outputOptions(['-map 0:v', '-map [aout]', '-c:v libx264', '-pix_fmt yuv420p', '-shortest']);
  
  await new Promise((resolve, reject) => {
    command.on('end', resolve).on('error', reject).save(outputPath);
  });
  console.log("✨ Done! Video saved to:", outputPath);
}

async function main() {
  await voiceoverPhase();
  await transcribePhase();
  await renderPhase();
  await encodePhase();
}

main().catch(console.error);
