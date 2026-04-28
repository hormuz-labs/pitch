/**
 * @author Hormuz Labs
 * @copyright (c) 2026 Hormuz Labs
 * @license CC-BY-4.0
 */

import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pkg from 'wavefile';
import ffmpeg from 'fluent-ffmpeg';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' }); // load from parent .env

const { WaveFile } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateCinematicDemo() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ttsApiKey = process.env.GEMINI_API_KEY_TTS || apiKey;
  const genAITTS = new GoogleGenerativeAI(ttsApiKey);
  const ttsModel = genAITTS.getGenerativeModel({ model: 'gemini-3.1-flash-tts-preview' });

  const demoDir = path.join(__dirname, 'demo-cinematic-' + Date.now());
  if (!fs.existsSync(demoDir)) fs.mkdirSync(demoDir, { recursive: true });

  console.log("🚀 PHASE 1: Capturing Raw DOM States & Coordinates...");
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--window-size=1280,720'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });

  // Step 1: Initial Load
  console.log("Navigating to Wikipedia...");
  await page.goto('https://www.wikipedia.org', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(demoDir, 'step-1.png') });

  // Get exact coordinates of the search input
  const searchBox = await page.evaluate(() => {
    const el = document.querySelector('#searchInput');
    if (!el) return { x: 640, y: 360 };
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  // Step 2: Typed Text
  console.log("Typing Istanbul...");
  await page.type('#searchInput', 'Istanbul');
  await page.screenshot({ path: path.join(demoDir, 'step-2.png') });

  // Step 3: Result Page (Istanbul)
  console.log("Pressing Enter...");
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
    page.keyboard.press('Enter')
  ]);
  
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: path.join(demoDir, 'step-3-top.png') });

  // Step 4: Scroll down to Ferries
  console.log("Scrolling to Ferries section...");
  const ferriesTarget = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('h2, h3, h4, a, span.toctext'));
    const ferryEl = els.find(el => el.textContent.toLowerCase().includes('ferries') && el.getBoundingClientRect().height > 0);
    if (!ferryEl) return { x: 640, y: 360 };
    
    // Perform scroll
    ferryEl.scrollIntoView({ behavior: 'instant', block: 'center' });
    
    // Return coords relative to the *new* scrolled viewport
    const rect = ferryEl.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  await new Promise(r => setTimeout(r, 1000));
  // Capture the scrolled view
  await page.screenshot({ path: path.join(demoDir, 'step-4-scrolled.png') });
  
  console.log("Clicking Ferries...");
  await page.mouse.click(ferriesTarget.x, ferriesTarget.y);
  await new Promise(r => setTimeout(r, 2000));
  
  // Step 5: After click
  await page.screenshot({ path: path.join(demoDir, 'step-5-result.png') });
  
  await browser.close();

  console.log(`✅ Coordinates: Search Box X:${searchBox.x}, Y:${searchBox.y} | Ferries Target X:${ferriesTarget.x}, Y:${ferriesTarget.y}`);

  console.log("🎙️ PHASE 2: Generating Voiceover...");
  const scriptText = "To learn about getting around Istanbul, start by searching for it on Wikipedia. Once on the page, scroll down to the ferries section to find detailed information about water transportation.";
  const audioResponse = await ttsModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: `Say this naturally: ${scriptText}` }] }],
    generationConfig: {
      // @ts-ignore
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Callirrhoe' } } }
    }
  });
  
  const audioData = audioResponse.response.candidates[0].content.parts[0].inlineData.data;
  const audioBuffer = Buffer.from(audioData, 'base64');
  const wav = new WaveFile();
  const pcmData = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
  wav.fromScratch(1, 24000, '16', pcmData);
  const audioPath = path.join(demoDir, 'voiceover.wav');
  fs.writeFileSync(audioPath, wav.toBuffer());
  const totalAudioDuration = wav.data.chunkSize / wav.fmt.byteRate;

  console.log(`🎞️ PHASE 3: Frame-by-Frame Rendering (${totalAudioDuration.toFixed(2)}s)...`);
  const cursorSvg = 'data:image/svg+xml;base64,' + Buffer.from(`<svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M11.6687 28.5323C11.3986 28.6473 11.0874 28.6053 10.8529 28.422C10.6184 28.2386 10.5054 27.9482 10.5564 28.6577L13.8898 6.65775C13.9554 6.21316 14.3592 5.92212 14.8016 5.99981C15.0344 6.04068 15.2343 6.17702 15.3444 6.36987L24.6778 22.7032C24.8988 23.0898 24.7644 23.5824 24.3778 23.8034C24.2384 23.8831 24.0805 23.9248 23.9198 23.9246L18.4239 23.9145L15.6565 28.3248C15.3999 28.7337 14.8624 28.8551 14.4534 28.5985L11.6687 28.5323Z" fill="black" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>`).toString('base64');

  const animatorHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      body { margin: 0; overflow: hidden; background: #000; width: 1280px; height: 720px; }
      #camera { width: 1280px; height: 720px; transform-origin: 0 0; position: absolute; top: 0; left: 0; }
      .screen { width: 100%; height: 100%; position: absolute; top: 0; left: 0; }
      #cursor { position: absolute; width: 32px; height: 32px; z-index: 100; filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.3)); transform-origin: top left; }
    </style>
  </head>
  <body>
    <div id="camera">
      <img id="img1" class="screen" src="step-1.png" />
      <img id="img2" class="screen" src="step-1.png" />
      <img id="cursor" src="${cursorSvg}" />
    </div>
    <script>
      const camera = document.getElementById('camera');
      const cursor = document.getElementById('cursor');
      const img1El = document.getElementById('img1');
      const img2El = document.getElementById('img2');

      const SEARCH_X = ${searchBox.x};
      const SEARCH_Y = ${searchBox.y};
      const FERRY_X = ${ferriesTarget.x};
      const FERRY_Y = ${ferriesTarget.y};
      const START_X = 1000;
      const START_Y = 600;
      
      const DUR = ${totalAudioDuration};
      
      // Calculate proportional phase timings
      const p1_searchMove = DUR * 0.15;
      const p2_type       = DUR * 0.30;
      const p3_load       = DUR * 0.45;
      const p4_scroll     = DUR * 0.65;
      const p5_ferryMove  = DUR * 0.80;
      const p6_click      = DUR * 0.90;

      const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      window.renderFrame = function(t) {
        let cursorX = START_X, cursorY = START_Y, zoom = 1.0, cursorScale = 1.0;
        let transX = 0, transY = 0;
        let src1 = "step-1.png", src2 = "step-1.png";
        let img1Y = 0, img2Y = 720;

        if (t < p1_searchMove) {
          // Cursor to search box
          const p = easeInOut(t / p1_searchMove);
          cursorX = START_X + (SEARCH_X - START_X) * p;
          cursorY = START_Y + (SEARCH_Y - START_Y) * p;
          zoom = 1.0 + (0.5 * p);
          transX = (1 - zoom) * SEARCH_X; transY = (1 - zoom) * SEARCH_Y;
        } 
        else if (t < p2_type) {
          // Typing
          cursorX = SEARCH_X; cursorY = SEARCH_Y; zoom = 1.5;
          transX = (1 - zoom) * SEARCH_X; transY = (1 - zoom) * SEARCH_Y;
          src1 = "step-2.png";
        }
        else if (t < p3_load) {
          // Zoom out and show top of article
          const p = easeInOut((t - p2_type) / (p3_load - p2_type));
          cursorX = SEARCH_X + (START_X - SEARCH_X) * p;
          cursorY = SEARCH_Y + (START_Y - SEARCH_Y) * p;
          zoom = 1.5 - (0.5 * p);
          transX = (1 - zoom) * SEARCH_X; transY = (1 - zoom) * SEARCH_Y;
          src1 = p > 0.5 ? "step-3-top.png" : "step-2.png"; // switch midway through zoom
        }
        else if (t < p4_scroll) {
          // Simulated smooth CSS scroll
          cursorX = START_X; cursorY = START_Y; zoom = 1.0;
          const p = easeInOut((t - p3_load) / (p4_scroll - p3_load));
          src1 = "step-3-top.png";
          src2 = "step-4-scrolled.png";
          img1Y = -p * 720;
          img2Y = (1 - p) * 720;
        }
        else if (t < p5_ferryMove) {
          // Move cursor to ferries link
          src1 = "step-4-scrolled.png"; img1Y = 0;
          const p = easeInOut((t - p4_scroll) / (p5_ferryMove - p4_scroll));
          cursorX = START_X + (FERRY_X - START_X) * p;
          cursorY = START_Y + (FERRY_Y - START_Y) * p;
          zoom = 1.0 + (0.5 * p);
          transX = (1 - zoom) * FERRY_X; transY = (1 - zoom) * FERRY_Y;
        }
        else if (t < p6_click) {
          // Click effect
          src1 = "step-4-scrolled.png"; img1Y = 0;
          cursorX = FERRY_X; cursorY = FERRY_Y; zoom = 1.5;
          transX = (1 - zoom) * FERRY_X; transY = (1 - zoom) * FERRY_Y;
          
          const p = (t - p5_ferryMove) / (p6_click - p5_ferryMove);
          cursorScale = p < 0.2 ? 1 - (p / 0.2) * 0.3 : 0.7 + ((p - 0.2) / 0.8) * 0.3;
        }
        else {
          // Final result
          src1 = "step-5-result.png"; img1Y = 0;
          cursorX = FERRY_X; cursorY = FERRY_Y; zoom = 1.5;
          transX = (1 - zoom) * FERRY_X; transY = (1 - zoom) * FERRY_Y;
        }

        // Apply visual updates
        img1El.src = src1;
        img1El.style.transform = 'translateY(' + img1Y + 'px)';
        img2El.src = src2;
        img2El.style.transform = 'translateY(' + img2Y + 'px)';
        
        cursor.style.left = cursorX + 'px';
        cursor.style.top = cursorY + 'px';
        cursor.style.transform = 'scale(' + cursorScale + ')';
        camera.style.transform = 'matrix(' + zoom + ', 0, 0, ' + zoom + ', ' + transX + ', ' + transY + ')';
      };
    </script>
  </body>
  </html>
  `;
  fs.writeFileSync(path.join(demoDir, 'animator.html'), animatorHtml);

  const fps = 30;
  const totalFrames = Math.ceil(Math.max(10, totalAudioDuration) * fps);

  const renderBrowser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const renderPage = await renderBrowser.newPage();
  await renderPage.setViewport({ width: 1280, height: 720 });
  await renderPage.goto('file://' + path.resolve(demoDir, 'animator.html'));

  console.log(`Capturing ${totalFrames} frames at 30fps...`);
  for (let i = 0; i < totalFrames; i++) {
    await renderPage.evaluate(`window.renderFrame(${i / fps})`);
    await renderPage.screenshot({ path: path.join(demoDir, `frame-${String(i).padStart(4, '0')}.png`) });
    if (i % 30 === 0) process.stdout.write(`\rRendered ${i}/${totalFrames} frames...`);
  }
  console.log(`\n✅ Rendered ${totalFrames} frames!`);
  await renderBrowser.close();

  console.log("🎬 PHASE 4: Final FFmpeg Stitching...");
  
  if (!fs.existsSync(path.join(__dirname, 'public'))) fs.mkdirSync(path.join(__dirname, 'public'));
  const outputPath = path.join(__dirname, 'public/demo-cinematic.mp4');

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