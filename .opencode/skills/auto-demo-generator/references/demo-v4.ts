import puppeteer from 'puppeteer';
import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';

dotenv.config();

const DEMO_DIR = path.join(process.cwd(), 'demo/shadcn-smooth');

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
  const scriptText = "Shadcn UI offers an extensive collection of components. Let's look at the Carousel, perfect for image galleries. Need a date? The Date Picker component is accessible and beautifully styled. Building stunning apps has never been easier.";

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
  console.log("🎞️ Rendering Time-Mapped Frames with Smooth Zoom...");
  const manifest = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'manifest.json'), 'utf8'));
  const timestamps = JSON.parse(fs.readFileSync(path.join(DEMO_DIR, 'timestamps.json'), 'utf8'));

  const findWord = (w: string, after = 0) => {
    const match = timestamps.find((t: any) => t.word.toLowerCase().replace(/[^a-z0-9]/g, '') === w.toLowerCase() && t.startMs >= after);
    return match ? match.startMs / 1000 : null;
  };

  const TIMELINE = {
    tCarouselNext: findWord('Carousel') || 4.0,
    tSearchClick: findWord('Need') || 7.0,
    tTypeStart: findWord('date') || 8.0,
    tTypeEnd: findWord('Picker', (findWord('date') || 8.0) * 1000) || 10.0, 
    tEnter: findWord('component') || 11.0,
    tDatePickerClick: findWord('accessible') || 13.0,
    tDateSelect: findWord('styled') || 15.0,
    tOutro: findWord('apps') || 17.0
  };

  // These mirror the delays in our live recording chain script.
  const RAW = {
    tStart: 0,
    tCarouselNext: 2.0,
    tSearchClick: 5.0,
    tTypeStart: 7.0,
    tTypeEnd: 9.0,
    tEnter: 11.0,
    tDatePickerClick: 15.0,
    tDateSelect: 17.0,
    tOutro: 20.0
  };

  const totalAudioDuration = timestamps[timestamps.length - 1].endMs / 1000;
  const finalVideoDuration = totalAudioDuration + 3.0; 

  const framesDir = path.join(DEMO_DIR, 'frames');
  const frameFiles = fs.readdirSync(framesDir).filter(f => f.endsWith('.jpg')).sort();
  const rawFPS = 30;

  const animatorHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; overflow: hidden; background: #000; width: 1920px; height: 1080px; font-family: sans-serif; }
    #camera { width: 1920px; height: 1080px; transform-origin: 0 0; position: absolute; top: 0; left: 0; }
    .screenshot { width: 100%; height: 100%; position: absolute; top: 0; left: 0; display: none; }
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
    ` + frameFiles.map((f, i) => `<img id="frame-${i + 1}" class="screenshot" src="frames/${f}" />`).join('\n    ') + `
    <img id="cursor" src="cursor-black.svg" />
    <div id="ripple-container"></div>
  </div>
  <div id="intro-card"><div class="card-title">Shadcn UI</div><div class="card-subtitle">Smooth Cinematic View</div></div>
  <div id="outro-card"><div class="card-title">Build Stunning Apps</div><div class="card-subtitle">ui.shadcn.com</div></div>
  
  <script>
    const MANIFEST = ` + JSON.stringify(manifest) + `;
    const TIMELINE = ` + JSON.stringify(TIMELINE) + `;
    const RAW = ` + JSON.stringify(RAW) + `;
    const FINAL_DUR = ` + finalVideoDuration + `;
    const RAW_FPS = ` + rawFPS + `;
    const TOTAL_RAW_FRAMES = ` + frameFiles.length + `;
    const INTRO_DUR = 1.5;

    const camera = document.getElementById('camera');
    const cursor = document.getElementById('cursor');
    const rippleContainer = document.getElementById('ripple-container');

    const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const clamp01 = t => Math.min(1, Math.max(0, t));
    const interp = (a, b, p) => a + (b - a) * p;

    function spawnRipple(x, y, t) {
      const el = document.createElement('div');
      el.style.cssText = 'position: absolute; left: ' + x + 'px; top: ' + y + 'px; width: 0px; height: 0px; border-radius: 50%; background: rgba(0,0,0,0.15); transform: translate(-50%, -50%) scale(0); pointer-events: none; border: 1px solid rgba(0,0,0,0.1);';
      rippleContainer.appendChild(el);
      el.dataset.spawnTime = String(t);
    }

    function getRawTime(t) {
        if (t < TIMELINE.tCarouselNext) return interp(0, RAW.tCarouselNext, t / TIMELINE.tCarouselNext);
        if (t < TIMELINE.tSearchClick) return interp(RAW.tCarouselNext, RAW.tSearchClick, (t - TIMELINE.tCarouselNext) / (TIMELINE.tSearchClick - TIMELINE.tCarouselNext));
        if (t < TIMELINE.tTypeStart) return interp(RAW.tSearchClick, RAW.tTypeStart, (t - TIMELINE.tSearchClick) / (TIMELINE.tTypeStart - TIMELINE.tSearchClick));
        if (t < TIMELINE.tTypeEnd) return interp(RAW.tTypeStart, RAW.tTypeEnd, (t - TIMELINE.tTypeStart) / (TIMELINE.tTypeEnd - TIMELINE.tTypeStart));
        if (t < TIMELINE.tEnter) return interp(RAW.tTypeEnd, RAW.tEnter, (t - TIMELINE.tTypeEnd) / (TIMELINE.tEnter - TIMELINE.tTypeEnd));
        if (t < TIMELINE.tDatePickerClick) return interp(RAW.tEnter, RAW.tDatePickerClick, (t - TIMELINE.tEnter) / (TIMELINE.tDatePickerClick - TIMELINE.tEnter));
        if (t < TIMELINE.tDateSelect) return interp(RAW.tDatePickerClick, RAW.tDateSelect, (t - TIMELINE.tDatePickerClick) / (TIMELINE.tDateSelect - TIMELINE.tDatePickerClick));
        if (t < TIMELINE.tOutro) return interp(RAW.tDateSelect, RAW.tOutro, (t - TIMELINE.tDateSelect) / (TIMELINE.tOutro - TIMELINE.tDateSelect));
        return RAW.tOutro;
    }

    window.renderFrame = function(t) {
      document.getElementById('intro-card').style.opacity = t < INTRO_DUR ? String(1 - easeInOut(clamp01((t - 1.0)/0.5))) : '0';
      document.getElementById('outro-card').style.opacity = t >= (FINAL_DUR - 2.0) ? String(easeInOut(clamp01((t - (FINAL_DUR - 2.0))/1.0))) : '0';

      const rawTime = getRawTime(t);
      let fIndex = Math.floor(rawTime * RAW_FPS);
      fIndex = Math.max(1, Math.min(TOTAL_RAW_FRAMES, fIndex + 1));

      document.querySelectorAll('.screenshot').forEach(img => { img.style.display = 'none'; });
      const activeFrame = document.getElementById('frame-' + fIndex);
      if(activeFrame) activeFrame.style.display = 'block';

      let cx = 960, cy = 540, zoom = 1.0, cScale = 1.0;
      const MOVE_DUR = 1.2;
      const ZOOM_DUR = 1.5;

      const cnTx = MANIFEST.carouselNextBox.x + MANIFEST.carouselNextBox.width / 2;
      const cnTy = MANIFEST.carouselNextBox.y + MANIFEST.carouselNextBox.height / 2;
      const searchTx = MANIFEST.searchBtnBox.x + MANIFEST.searchBtnBox.width / 2;
      const searchTy = MANIFEST.searchBtnBox.y + MANIFEST.searchBtnBox.height / 2;
      const cmdkTx = MANIFEST.cmdkBox.x + 50; 
      const cmdkTy = MANIFEST.cmdkBox.y + MANIFEST.cmdkBox.height / 2;
      const resultTx = MANIFEST.datePickerResultBox.x + MANIFEST.datePickerResultBox.width / 2;
      const resultTy = MANIFEST.datePickerResultBox.y + MANIFEST.datePickerResultBox.height / 2;
      const dpBtnTx = MANIFEST.datePickerBtnBox.x + MANIFEST.datePickerBtnBox.width / 2;
      const dpBtnTy = MANIFEST.datePickerBtnBox.y + MANIFEST.datePickerBtnBox.height / 2;
      const dateTx = MANIFEST.dateSelectBox.x + MANIFEST.dateSelectBox.width / 2;
      const dateTy = MANIFEST.dateSelectBox.y + MANIFEST.dateSelectBox.height / 2;

      // 1. Professional Cinematic Camera Logic
      // Professional editors don't "yo-yo" (zoom in, zoom out, zoom in). 
      // They use long, slow "pushes" (zooms) that hold, and then they pan the camera to the next point of interest while maintaining the zoom.
      // If a major context shift happens, they use a fast ease to zoom out.

      let targetZoom = 1.0;
      
      if (t < TIMELINE.tSearchClick - 1.0) {
          // Slowly push in on the Carousel over the first few seconds
          targetZoom = interp(1.0, 1.25, easeInOut(clamp01(t / TIMELINE.tCarouselNext)));
      } else if (t < TIMELINE.tDatePickerClick - 1.0) {
          // When moving to search, hold a steady 1.3x zoom and just pan the camera
          targetZoom = interp(1.25, 1.35, easeInOut(clamp01((t - TIMELINE.tSearchClick) / (TIMELINE.tEnter - TIMELINE.tSearchClick))));
      } else if (t < TIMELINE.tDateSelect + 1.0) {
          // After hitting enter on search, we stay zoomed in at 1.2x to focus on the date picker
          targetZoom = 1.2;
      } else {
          // Slow, dramatic pull out at the very end
          targetZoom = interp(1.2, 1.0, easeInOut(clamp01((t - (TIMELINE.tDateSelect + 1.0)) / 2.0)));
      }

      zoom = targetZoom;

      // 2. Smooth Cursor Movement Logic
      const moveCursor = (t, targetT, startX, startY, endX, endY) => {
        if (t < targetT - MOVE_DUR) { cx = startX; cy = startY; }
        else if (t < targetT) {
          let p = easeInOut(clamp01((t - (targetT - MOVE_DUR)) / MOVE_DUR));
          cx = interp(startX, endX, p); cy = interp(startY, endY, p);
        } else { cx = endX; cy = endY; }
      }

      if (t < TIMELINE.tCarouselNext) moveCursor(t, TIMELINE.tCarouselNext, 960, 540, cnTx, cnTy);
      else if (t < TIMELINE.tSearchClick) moveCursor(t, TIMELINE.tSearchClick, cnTx, cnTy, searchTx, searchTy);
      else if (t < TIMELINE.tTypeStart) moveCursor(t, TIMELINE.tTypeStart, searchTx, searchTy, cmdkTx, cmdkTy);
      else if (t < TIMELINE.tEnter) moveCursor(t, TIMELINE.tEnter, cmdkTx, cmdkTy, resultTx, resultTy);
      else if (t < TIMELINE.tDatePickerClick) moveCursor(t, TIMELINE.tDatePickerClick, resultTx, resultTy, dpBtnTx, dpBtnTy);
      else if (t < TIMELINE.tDateSelect) moveCursor(t, TIMELINE.tDateSelect, dpBtnTx, dpBtnTy, dateTx, dateTy);
      else { cx = dateTx; cy = dateTy; }

      // 3. Click Ripple Logic
      const checkClick = (targetT, targetX, targetY) => {
        if (t >= targetT && t < targetT + 0.2) {
          let p = (t - targetT) / 0.2; cScale = p < 0.5 ? 1 - (p*0.4) : 0.6 + ((p-0.5)*0.4);
          if (Math.abs(t - targetT) < 0.02) spawnRipple(targetX, targetY, t);
        }
      };

      checkClick(TIMELINE.tCarouselNext, cnTx, cnTy);
      checkClick(TIMELINE.tSearchClick, searchTx, searchTy);
      checkClick(TIMELINE.tEnter, resultTx, resultTy);
      checkClick(TIMELINE.tDatePickerClick, dpBtnTx, dpBtnTy);
      checkClick(TIMELINE.tDateSelect, dateTx, dateTy);

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
  await page.goto('file://' + path.resolve(DEMO_DIR, 'animator.html'), { waitUntil: 'networkidle0', timeout: 60000 });
  
  await page.evaluate(async () => {
    const images = Array.from(document.querySelectorAll('img.screenshot'));
    await Promise.all(images.map((img: any) => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
    }));
  });
  
  const fps = 30;
  const totalRenderFrames = Math.ceil(finalVideoDuration * fps);
  console.log('Rendering ' + totalRenderFrames + ' frames...');
  
  const seqDir = path.join(DEMO_DIR, 'sequence');
  if (!fs.existsSync(seqDir)) fs.mkdirSync(seqDir);

  for (let i = 0; i < totalRenderFrames; i++) {
    if (i % 30 === 0) console.log('Rendered ' + i + '/' + totalRenderFrames + ' frames...');
    await page.evaluate('window.renderFrame(' + (i / fps) + ')');
    await page.screenshot({ path: path.join(seqDir, 'seq_' + String(i).padStart(4, '0') + '.jpg'), type: 'jpeg', quality: 90 });
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
    tCarouselNext: findWord('Carousel') || 4.0,
    tSearchClick: findWord('Need') || 7.0,
    tTypeStart: findWord('date') || 8.0,
    tTypeEnd: findWord('Picker', (findWord('date') || 8.0) * 1000) || 10.0, 
    tEnter: findWord('component') || 11.0,
    tDatePickerClick: findWord('accessible') || 13.0,
    tDateSelect: findWord('styled') || 15.0,
    tOutro: findWord('apps') || 17.0
  };

  const typeDur = TIMELINE.tTypeEnd - TIMELINE.tTypeStart;
  const outputPath = path.join(process.cwd(), 'public/shadcn-smooth.mp4');
  
  const command = ffmpeg();
  command.input(path.join(DEMO_DIR, 'sequence/seq_%04d.jpg')).inputOptions(['-framerate 30']);
  command.input(path.join(DEMO_DIR, 'voiceover.wav'));
  command.input(path.join(DEMO_DIR, 'keyboard.mp3'));
  command.input(path.join(DEMO_DIR, 'click.mp3')); 
  command.input(path.join(DEMO_DIR, 'click.mp3')); 
  command.input(path.join(DEMO_DIR, 'click.mp3')); 
  command.input(path.join(DEMO_DIR, 'click.mp3')); 
  command.input(path.join(DEMO_DIR, 'click.mp3')); 

  command.complexFilter([
    '[1:a]apad=pad_dur=2[voicepad]',
    '[2:a]atrim=0:' + typeDur + ',asetpts=PTS-STARTPTS,adelay=' + (TIMELINE.tTypeStart * 1000) + '|' + (TIMELINE.tTypeStart * 1000) + ',apad[typing]',
    '[3:a]adelay=' + (TIMELINE.tCarouselNext * 1000) + '|' + (TIMELINE.tCarouselNext * 1000) + ',apad[click1]',
    '[4:a]adelay=' + (TIMELINE.tSearchClick * 1000) + '|' + (TIMELINE.tSearchClick * 1000) + ',apad[click2]',
    '[5:a]adelay=' + (TIMELINE.tEnter * 1000) + '|' + (TIMELINE.tEnter * 1000) + ',apad[click3]',
    '[6:a]adelay=' + (TIMELINE.tDatePickerClick * 1000) + '|' + (TIMELINE.tDatePickerClick * 1000) + ',apad[click4]',
    '[7:a]adelay=' + (TIMELINE.tDateSelect * 1000) + '|' + (TIMELINE.tDateSelect * 1000) + ',apad[click5]',
    '[voicepad][typing][click1][click2][click3][click4][click5]amix=inputs=7:duration=first:normalize=0[aout]'
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
