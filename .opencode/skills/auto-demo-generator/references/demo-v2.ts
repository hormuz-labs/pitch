/**
 * @author Hormuz Labs
 * @copyright (c) 2026 Hormuz Labs
 * @license CC-BY-4.0
 */

// @ts-nocheck

import puppeteer from 'puppeteer';
import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WavConversionOptions {
  numChannels : number,
  sampleRate: number,
  bitsPerSample: number
}

function parseMimeType(mimeType: string): WavConversionOptions {
  const [fileType, ...params] = mimeType.split(';').map(s => s.trim());
  const [_, format] = fileType.split('/');

  const options: Partial<WavConversionOptions> = {
    numChannels: 1,
    sampleRate: 24000,
    bitsPerSample: 16
  };

  if (format && format.toLowerCase().startsWith('l')) {
    const bits = parseInt(format.slice(1), 10);
    if (!isNaN(bits)) {
      options.bitsPerSample = bits;
    }
  }

  for (const param of params) {
    const [key, value] = param.split('=').map(s => s.trim());
    if (key === 'rate') {
      options.sampleRate = parseInt(value, 10);
    }
  }

  return options as WavConversionOptions;
}

function createWavHeader(dataLength: number, options: WavConversionOptions) {
  const { numChannels, sampleRate, bitsPerSample } = options;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44);

  buffer.write('RIFF', 0);                      // ChunkID
  buffer.writeUInt32LE(36 + dataLength, 4);     // ChunkSize
  buffer.write('WAVE', 8);                      // Format
  buffer.write('fmt ', 12);                     // Subchunk1ID
  buffer.writeUInt32LE(16, 16);                 // Subchunk1Size (PCM)
  buffer.writeUInt16LE(1, 20);                  // AudioFormat (1 = PCM)
  buffer.writeUInt16LE(numChannels, 22);        // NumChannels
  buffer.writeUInt32LE(sampleRate, 24);         // SampleRate
  buffer.writeUInt32LE(byteRate, 28);           // ByteRate
  buffer.writeUInt16LE(blockAlign, 32);         // BlockAlign
  buffer.writeUInt16LE(bitsPerSample, 34);      // BitsPerSample
  buffer.write('data', 36);                     // Subchunk2ID
  buffer.writeUInt32LE(dataLength, 40);         // Subchunk2Size

  return buffer;
}


async function generateCinematicDemo() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = 'gemini-3.1-flash-tts-preview';

  const demoDir = path.join(__dirname, 'demo-cinematic-' + Date.now());
  if (!fs.existsSync(demoDir)) fs.mkdirSync(demoDir, { recursive: true });

  console.log("🚀 PHASE 1: Capturing Raw DOM States & Coordinates...");
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--window-size=1280,720'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

  // Step 1: Initial Load
  await page.goto('https://www.wikipedia.org', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(demoDir, 'step-1.png') });

  // Get exact coordinates of the search input
  const targetBox = await page.evaluate(() => {
    const el = document.querySelector('#searchInput');
    if (!el) return { x: 640, y: 360 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  // Step 2: Typed Text
  await page.type('#searchInput', 'Solana (blockchain)');
  await page.screenshot({ path: path.join(demoDir, 'step-2.png') });

  // Step 3: Result Page
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.keyboard.press('Enter')
  ]);
  await page.screenshot({ path: path.join(demoDir, 'step-3.png') });
  await browser.close();

  console.log(`✅ Coordinates acquired: Search Box at X:${targetBox.x}, Y:${targetBox.y}`);

  console.log("🎙️ PHASE 2: Generating Voiceover...");
  
  const config = {
    temperature: 1,
    responseModalities: ['audio'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Orus',
        }
      }
    },
  };

  const contents = [
    {
      role: 'user',
      parts: [
        {
          text: `Read the following transcript based on the audio profile and director's note.

# Audio Profile
A smooth, premium commercial voice.

# Director's note
Style: Promo/Hype. Pace: Natural. Accent: American (Gen).

## Scene:
The Sound Stage Booth.

## Transcript:
To find out about Solana, simply click the Wikipedia search bar, type your query, and hit Enter. You'll instantly be taken to the official article.`,
        },
      ],
    },
  ];

  const response = await ai.models.generateContentStream({
    model,
    config,
    contents,
  });

  const chunks: Buffer[] = [];
  let responseMimeType = 'audio/pcm;rate=24000';

  for await (const chunk of response) {
    if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) {
      continue;
    }
    const inlineData = chunk.candidates[0].content.parts[0].inlineData;
    if (inlineData) {
      if (inlineData.mimeType) responseMimeType = inlineData.mimeType;
      chunks.push(Buffer.from(inlineData.data || '', 'base64'));
    }
  }

  const rawPcmBuffer = Buffer.concat(chunks);
  let finalAudioBuffer = rawPcmBuffer;
  
  let fileExtension = mime.getExtension(responseMimeType);
  if (!fileExtension || fileExtension !== 'wav') {
    const options = parseMimeType(responseMimeType);
    const wavHeader = createWavHeader(rawPcmBuffer.length, options);
    finalAudioBuffer = Buffer.concat([wavHeader, rawPcmBuffer]);
  }

  const audioPath = path.join(demoDir, 'voiceover.wav');
  fs.writeFileSync(audioPath, finalAudioBuffer);
  
  // Calculate duration roughly based on the MIME type info
  const options = parseMimeType(responseMimeType);
  const byteRate = options.sampleRate * options.numChannels * (options.bitsPerSample / 8);
  const totalAudioDuration = rawPcmBuffer.length / byteRate;
  
  console.log(\`✅ Voiceover generated. Duration: \${totalAudioDuration.toFixed(2)}s\`);

  console.log("🎞️ PHASE 3: Frame-by-Frame Cinematic Rendering...");
  
  // Copy the black or white cursor SVG into the demo directory depending on background (using black as default here)
  fs.copyFileSync(
    path.join(__dirname, 'icons/cursor-black.svg'),
    path.join(demoDir, 'cursor.svg')
  );

  const animatorHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { margin: 0; overflow: hidden; background: #000; width: 1280px; height: 720px; }
      #camera { width: 1280px; height: 720px; transform-origin: \${targetBox.x}px \${targetBox.y}px; position: absolute; top: 0; left: 0; }
      #screenshot { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
      #cursor { position: absolute; width: 32px; height: 32px; z-index: 100; transform-origin: top left; }
    </style>
  </head>
  <body>
    <div id="camera">
      <img id="screenshot" src="step-1.png" />
      <img id="cursor" src="cursor.svg" />
    </div>
    <script>
      const camera = document.getElementById('camera');
      const cursor = document.getElementById('cursor');
      const screenshot = document.getElementById('screenshot');

      const TARGET_X = \${targetBox.x};
      const TARGET_Y = \${targetBox.y};
      const START_X = 1000;
      const START_Y = 600;
      const TOTAL_DUR = \${totalAudioDuration};

      const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      window.renderFrame = function(timeSeconds) {
        let cursorX = START_X, cursorY = START_Y, zoom = 1.0, cursorScale = 1.0;

        if (timeSeconds < 1.5) {
          const p = easeInOut(timeSeconds / 1.5);
          cursorX = START_X + (TARGET_X - START_X) * p;
          cursorY = START_Y + (TARGET_Y - START_Y) * p;
          zoom = 1.0 + (0.5 * p);
          screenshot.src = "step-1.png";
        } else if (timeSeconds < 2.0) {
          cursorX = TARGET_X; cursorY = TARGET_Y; zoom = 1.5;
          const p = (timeSeconds - 1.5) / 0.5;
          cursorScale = p < 0.5 ? 1 - (p * 0.4) : 0.8 + ((p - 0.5) * 0.4);
          screenshot.src = "step-1.png";
        } else if (timeSeconds < 4.0) {
          cursorX = TARGET_X; cursorY = TARGET_Y; zoom = 1.5;
          screenshot.src = "step-2.png";
        } else if (timeSeconds < 4.5) {
          cursorX = TARGET_X; cursorY = TARGET_Y; zoom = 1.5;
          const p = (timeSeconds - 4.0) / 0.5;
          cursorScale = p < 0.5 ? 1 - (p * 0.4) : 0.8 + ((p - 0.5) * 0.4);
          screenshot.src = "step-2.png";
        } else if (timeSeconds < 6.0) {
          const p = easeInOut((timeSeconds - 4.5) / 1.5);
          cursorX = TARGET_X + (START_X - TARGET_X) * p;
          cursorY = TARGET_Y + (START_Y - TARGET_Y) * p;
          zoom = 1.5 - (0.5 * p);
          screenshot.src = "step-3.png";
        } else {
          cursorX = START_X; cursorY = START_Y; zoom = 1.0;
          screenshot.src = "step-3.png";
        }

        cursor.style.left = cursorX + 'px';
        cursor.style.top = cursorY + 'px';
        cursor.style.transform = 'scale(' + cursorScale + ')';
        camera.style.transform = 'scale(' + zoom + ')';
      };
    </script>
  </body>
  </html>
  \`;
  fs.writeFileSync(path.join(demoDir, 'animator.html'), animatorHtml);

  const fps = 30;
  const totalFrames = Math.ceil(totalAudioDuration * fps);

  const renderBrowser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const renderPage = await renderBrowser.newPage();
  await renderPage.setViewport({ width: 1280, height: 720 });
  await renderPage.goto('file://' + path.resolve(demoDir, 'animator.html'));

  console.log(\`Capturing \${totalFrames} frames at 30fps...\`);
  for (let i = 0; i < totalFrames; i++) {
    await renderPage.evaluate(\`window.renderFrame(\${i / fps})\`);
    await renderPage.screenshot({ path: path.join(demoDir, \`frame-\${String(i).padStart(4, '0')}.png\`) });
    if (i % 30 === 0) process.stdout.write(\`\\rRendered \${i}/\${totalFrames} frames...\`);
  }
  console.log(\`\\n✅ Rendered \${totalFrames} frames!\`);
  await renderBrowser.close();

  console.log("🎬 PHASE 4: Final FFmpeg Stitching...");
  const outputPath = path.join(__dirname, 'public/demo-cinematic.mp4');
  
  if (!fs.existsSync(path.join(__dirname, 'public'))) {
    fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
  }

  // NOTE: In a real production run, you MUST use FFmpeg's complexFilter to mix 
  // keyboard.mp3 and click.mp3 at the exact timestamps defined in TIMELINE.
  // See SKILL.md Phase 5 for the exact complexFilter syntax.

  await new Promise((resolve, reject) => {
    ffmpeg()
      .input(path.join(demoDir, 'frame-%04d.png'))
      .inputOptions(['-framerate 30'])
      .input(audioPath)
      .outputOptions(['-c:v libx264', '-pix_fmt yuv420p', '-c:a aac', '-shortest'])
      .on('end', resolve).on('error', reject)
      .save(outputPath);
  });

  console.log("✨ Done! Video saved to:", outputPath);
}

generateCinematicDemo().catch(console.error);
