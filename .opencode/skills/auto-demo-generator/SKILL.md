---
name: auto-demo-generator
description: >
  Creates autonomous, cinematic product demo videos from any website URL. Use this skill
  whenever the user wants to record a product demo, walkthrough video, tutorial screencast,
  or any automated "show me how to use X" video. Triggers on: "make a demo video", "record
  a walkthrough", "create a tutorial video", "automate a product demo", "screencast of X",
  "show how to use X", or any request to produce an MP4 of web interactions. This skill
  uses the Vercel agent-browser MCP for autonomous site navigation and screenshot capture,
  Gemini TTS for narration, frame-by-frame HTML5 animation rendering with Puppeteer, and
  FFmpeg for final encoding — always produce the full pipeline end-to-end unless the user
  explicitly asks for just one phase.
compatibility: "Requires agent-browser (NPM package) and bash tool. npm deps: @google/genai, mime, fluent-ffmpeg, dotenv, agent-browser (for Phase 1), puppeteer (for Phase 3 rendering only). System: ffmpeg binary. Env: GEMINI_API_KEY (required)."
---

# Auto-Demo Generator


Produces polished, cinematic product demo MP4s by combining autonomous browser capture,
AI narration, and smooth frame-by-frame animation rendering.

## Output

A single `demo-cinematic.mp4` written to `public/` (or a user-specified path) at 1920×1080,
30 fps, with synchronized voiceover.

---

## Workflow

**SFX REQUIREMENT:** Every generated demo MUST include synchronized `click.mp3` and `keyboard.mp3` sound effects for all interactions. Failure to include these results in a low-quality, non-cinematic output.

### Phase 1 — Trace Capture (agent-browser SDK)

Use the **agent-browser SDK** (installed via npm) to navigate the target site. It handles browser
spin-up, viewport, and session management automatically via its CLI/SDK tools.

**For each step, call agent-browser tools in sequence:**

1. `navigate` — go to the target URL
2. `screenshot` — save the current state as `step-1.png`
3. `getElementCoordinates` (or equivalent) — extract the **center `(x, y)`** of the element you're about to interact with; this is critical for the animation phase
4. Perform the action (`click`, `type`, `pressKey`, etc.)
5. Screenshot again *after* typing but *before* submitting — so the typed text is visible: `step-2.png`
6. Submit / navigate, wait for load, screenshot the result: `step-3.png`

**Coordinate extraction:** agent-browser returns bounding box data with each element interaction. Pull `x` and `y` from the center of that bounding box:
```
x = rect.left + rect.width / 2
y = rect.top  + rect.height / 2
```
If coordinates aren't available, fall back to `{ x: 960, y: 540 }` (1080p viewport center).

**Anti-bot User-Agent:** When launching agent-browser sessions, always set a realistic desktop User-Agent to avoid bot detection:
```js
await page.setUserAgent(
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
);
```
This significantly reduces the chance of CAPTCHAs or bot-walls interrupting the capture phase.

**deviceScaleFactor:** Set `deviceScaleFactor: 2` when calling `page.setViewport` so screenshots are captured at 2× pixel density (retina). This ensures crisp, sharp frames at 1080p:
```js
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
```
All coordinate values remain in CSS pixels — only the rendered bitmap is 2×.

**Artifact:** Save all screenshots to a timestamped `demo/demoDir/` (where `demoDir` is `demo-cinematic-<Date.now()>`) and record a manifest:
```json
[
  { "step": 1, "file": "step-1.png", "action": "navigate",      "coords": null },
  { "step": 2, "file": "step-2.png", "action": "type",          "coords": { "x": 512, "y": 340 } },
  { "step": 3, "file": "step-3.png", "action": "pressEnter",    "coords": { "x": 512, "y": 340 } }
]
```

> **Key rule:** Always screenshot *after* typing but *before* pressing Enter, so typed text appears in the frame where the cursor is still at the input. All files, including generated `.ts` scripts, MUST be kept inside the `demo/` folder.

---

### Phase 2 — Voiceover Generation

Use Gemini TTS to generate a natural `.wav` narration timed to the demo flow.

**Narration Tone Templates** — choose one based on the product/audience:

| Template | Style | Pace | Use when |
|---|---|---|---|
| `promo` | Hype / Upbeat | Energetic | SaaS launches, consumer apps |
| `corporate` | Authoritative / Clear | Measured | Enterprise software, B2B demos |
| `tutorial` | Friendly / Instructive | Relaxed | How-to walkthroughs, onboarding |
| `minimal` | Clean / Neutral | Natural | Developer tools, internal demos |

Pass the chosen template as a `toneTemplate` variable into the TTS prompt. Default is `promo`.

```ts
const TONE_TEMPLATES = {
  promo: {
    audioProfile: 'A smooth, premium commercial voice.',
    directorNote: 'Style: Promo/Hype. Pace: Natural. Accent: American (Gen).'
  },
  corporate: {
    audioProfile: 'A confident, clear professional voice.',
    directorNote: 'Style: Corporate/Authoritative. Pace: Measured. Accent: Neutral American.'
  },
  tutorial: {
    audioProfile: 'A warm, approachable instructional voice.',
    directorNote: 'Style: Friendly/Instructive. Pace: Relaxed. Accent: American (Gen).'
  },
  minimal: {
    audioProfile: 'A clean, neutral voice with no affectation.',
    directorNote: 'Style: Minimal/Developer. Pace: Natural. Accent: Neutral.'
  }
};

const tone = TONE_TEMPLATES[toneTemplate ?? 'promo'];

const contents = [
  {
    role: 'user',
    parts: [
      {
        text: `Read the following transcript based on the audio profile and director's note.

# Audio Profile
${tone.audioProfile}

# Director's note
${tone.directorNote}

## Scene:
The Sound Stage Booth.

## Transcript:
Say this naturally: ${scriptText}`
      }
    ]
  }
];
```

```ts
import { GoogleGenAI } from '@google/genai';
import mime from 'mime';
// ... you will also need the convertToWav/createWavHeader utility functions ...

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = 'gemini-3.1-flash-tts-preview';

const config = {
  temperature: 1,
  responseModalities: ['audio'],
  speechConfig: {
    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Orus' } }
  }
};

const response = await ai.models.generateContentStream({ model, config, contents });

const chunks: Buffer[] = [];
let responseMimeType = 'audio/pcm;rate=24000';

for await (const chunk of response) {
  if (!chunk.candidates || !chunk.candidates[0].content || !chunk.candidates[0].content.parts) continue;
  
  const inlineData = chunk.candidates[0].content.parts[0].inlineData;
  if (inlineData) {
    if (inlineData.mimeType) responseMimeType = inlineData.mimeType;
    let fileExtension = mime.getExtension(responseMimeType);
    let buffer = Buffer.from(inlineData.data || '', 'base64');
    
    if (!fileExtension || fileExtension !== 'wav') {
      buffer = convertToWav(inlineData.data || '', responseMimeType);
    }
    chunks.push(buffer);
  }
}

const finalAudioBuffer = Buffer.concat(chunks);
fs.writeFileSync(audioPath, finalAudioBuffer);

// Calculate total duration using the parsed mime type data
const options = parseMimeType(responseMimeType);
const byteRate = options.sampleRate * options.numChannels * (options.bitsPerSample / 8);
const totalAudioDuration = finalAudioBuffer.length / byteRate;
```

**Voice options:** `Orus` (default), or any other Gemini prebuilt voice name.

---

### Phase 2b — Background Music Mix (optional, recommended)

Blend a subtle ambient music track underneath the voiceover for a premium feel.

**Music source:** Use a royalty-free track (e.g. from `assets/music/`) or a user-supplied file. Keep it quiet — music should sit well below the voice.

```ts
// After generating voiceover WAV, mix music under it with FFmpeg
await new Promise((resolve, reject) => {
  ffmpeg()
    .input(audioPath)                     // voiceover
    .input(musicTrackPath)                // background music loop
    .complexFilter([
      // Loop music to match voiceover length, fade out last 2s
      `[1:a]aloop=loop=-1:size=2e+09,atrim=duration=${totalAudioDuration},` +
      `afade=t=out:st=${totalAudioDuration - 2}:d=2,volume=0.12[music]`,
      // Mix voice at full volume + music at 12%
      `[0:a][music]amix=inputs=2:duration=first[aout]`
    ])
    .outputOptions(['-map [aout]'])
    .on('end', resolve)
    .on('error', reject)
    .save(mixedAudioPath);
});
// Use mixedAudioPath in Phase 4 instead of audioPath
```

**Volume guidance:**
- Voice: 100% (`volume=1.0`)
- Background music: 10–15% (`volume=0.10`–`0.15`) — barely audible, mood-setting only
- Always fade music out over the last 2 seconds so it doesn't hard-cut at the end

---

### Phase 2.5 — Audio Transcription for Perfect Sync

To ensure perfect synchronization between the spoken narration and the visual actions (typing, clicking, scrolling), use Gemini to transcribe the generated `.wav` file into a JSON array of word-level timestamps.

**Process:**
Upload the generated `voiceover.wav` to Gemini (e.g., `gemini-2.0-flash` or `gemini-1.5-flash`) using the File API, and prompt it to return a structured JSON array.

```ts
import { GoogleAIFileManager } from '@google/genai/files';
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const uploadResult = await fileManager.uploadFile(audioPath, {
  mimeType: 'audio/wav',
  displayName: 'Voiceover',
});

const transcriptionPrompt = `
Listen to the audio and provide a complete transcript. 
Output the result as a raw JSON array of objects (do not wrap in markdown \`\`\`json blocks). 
Each object must have the following keys:
- "word": The spoken word (string)
- "startMs": The start time of the word in milliseconds (number)
- "endMs": The end time of the word in milliseconds (number)

Example:
[
  { "word": "Welcome", "startMs": 0, "endMs": 450 },
  { "word": "to", "startMs": 450, "endMs": 600 }
]
`;

const transcriptionResponse = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: [
    {
      role: 'user',
      parts: [
        { fileData: { mimeType: uploadResult.file.mimeType, fileUri: uploadResult.file.uri } },
        { text: transcriptionPrompt }
      ]
    }
  ]
});

// Parse the JSON array
const timestamps = JSON.parse(transcriptionResponse.text.replace(/^\\s*\`\`\`json|\\s*\`\`\`$/g, ''));
fs.writeFileSync(path.join(demoDir, 'timestamps.json'), JSON.stringify(timestamps, null, 2));
```

You must read `timestamps.json` in Phase 3 to dynamically calculate exact trigger times for your animation `TIMELINE`. For example, if the script says "Click on the dashboard" and you need to trigger a click ripple on the word "dashboard", you find the object where `"word": "dashboard"`, convert `startMs` to seconds (e.g., `startMs / 1000`), and assign that to `TIMELINE.clickDashboard.start`.

---

### Phase 3 — Cinematic Animation Rendering

Build an HTML animation canvas that reconstructs smooth cursor movement and camera zoom
using the screenshots and coordinates from Phase 1, then capture it frame-by-frame with
Puppeteer (used here only as a headless renderer, not a browser agent).

#### HTML Animation Canvas

The animator HTML file must:
- Be a **self-contained** page at exactly `1920×1080`
- Load `step-N.png` screenshots as `<img>` sources (relative paths work when using `file://`)
- Expose a global `window.renderFrame(timeSeconds)` function that sets all element styles deterministically

**Cursor Asset:** Do not use massive inline SVG strings. Depending on the background of the target website, pick either the black or white cursor. Copy `cursor-black.svg` or `cursor-white.svg` from `.opencode/skills/auto-demo-generator/references/icons/` into your working `demoDir` and reference it in the animator HTML (saving it as `cursor.svg` in the working directory):
```html
<img id="cursor" src="cursor.svg" style="position: absolute; width: 32px; height: 32px; z-index: 100; transform-origin: top left;" />
```
*(Note: the new cursor already has an SVG drop-shadow baked in, so you do not need a CSS filter).*

**CSS transform setup** — zoom must be anchored to the interaction point:
```css
#camera {
  width: 1920px; height: 1080px;
  transform-origin: {targetX}px {targetY}px;
  position: absolute; top: 0; left: 0;
}
```

#### Click Ripple Effect

On every click action, render a small, fast ripple emanating from the click coordinates. The ripple should be subtle and snappy — not a slow theatrical ring, but a tight, quick pulse that confirms the interaction.

```html
<!-- In animator HTML, add a ripple container above the camera layer -->
<div id="ripple-container" style="position:absolute;top:0;left:0;width:1920px;height:1080px;pointer-events:none;z-index:100;"></div>
```

```js
// Call this inside renderFrame when a click action fires
function spawnRipple(x, y) {
  const el = document.createElement('div');
  el.style.cssText = `
    position: absolute;
    left: ${x}px; top: ${y}px;
    width: 0px; height: 0px;
    border-radius: 50%;
    background: rgba(255,255,255,0.55);
    transform: translate(-50%, -50%) scale(0);
    pointer-events: none;
  `;
  document.getElementById('ripple-container').appendChild(el);
  // Ripple is driven by renderFrame — store spawn time
  el.dataset.spawnTime = String(currentTime);
  return el;
}

// Inside renderFrame, animate all live ripples
for (const ripple of document.querySelectorAll('#ripple-container div')) {
  const age = currentTime - parseFloat(ripple.dataset.spawnTime);
  const DURATION = 0.22; // seconds — fast and snappy
  const MAX_SIZE = 28;   // px — small footprint
  if (age > DURATION) {
    ripple.remove();
    continue;
  }
  const p = age / DURATION;
  const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
  const size = MAX_SIZE * eased;
  const opacity = 0.55 * (1 - p);
  ripple.style.width  = size + 'px';
  ripple.style.height = size + 'px';
  ripple.style.opacity = String(opacity);
  ripple.style.transform = `translate(-50%, -50%)`;
}
```

**Tuning:**
- `DURATION = 0.22s` — keeps the ripple snappy; never go above `0.35s`
- `MAX_SIZE = 28px` — tight halo; adjust to `20–32px` based on element size
- Spawn exactly **one** ripple per click action at the click coordinates; never stack multiple ripples for the same event

#### Intro / Outro Fade Cards

Bookend the demo with a 1.5s fade-in title card at the start and a 1.5s fade-out end card at the finish. These are rendered as HTML overlay divs, driven by `renderFrame`.

```html
<!-- Intro card -->
<div id="intro-card" style="
  position:absolute; top:0; left:0; width:1920px; height:1080px;
  background: #0a0a0f;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  z-index:200; pointer-events:none; opacity:1;
">
  <div style="font:700 64px/1.2 'Inter',sans-serif; color:#fff; letter-spacing:-1px;">
    {PRODUCT_NAME}
  </div>
  <div style="font:400 28px/1 'Inter',sans-serif; color:rgba(255,255,255,0.5); margin-top:18px;">
    {TAGLINE}
  </div>
</div>

<!-- Outro card -->
<div id="outro-card" style="
  position:absolute; top:0; left:0; width:1920px; height:1080px;
  background: #0a0a0f;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  z-index:200; pointer-events:none; opacity:0;
">
  <div style="font:700 56px/1.2 'Inter',sans-serif; color:#fff; letter-spacing:-1px;">
    {CTA_TEXT}
  </div>
  <div style="font:400 24px/1 'Inter',sans-serif; color:rgba(255,255,255,0.45); margin-top:16px;">
    {URL_OR_SUBTEXT}
  </div>
</div>
```

```js
// Inside renderFrame(t):
const INTRO_DURATION  = 1.5;  // seconds
const OUTRO_START     = totalAudioDuration - 1.5;

const introCard = document.getElementById('intro-card');
const outroCard = document.getElementById('outro-card');

// Intro: fully opaque → fade to 0 over last 0.5s of intro window
if (t < INTRO_DURATION) {
  const fadeProgress = Math.max(0, (t - 1.0) / 0.5); // start fading at t=1.0s
  introCard.style.opacity = String(1 - easeInOut(fadeProgress));
  outroCard.style.opacity = '0';
} else if (t >= OUTRO_START) {
  // Outro: fade in
  const fadeProgress = (t - OUTRO_START) / 1.5;
  introCard.style.opacity = '0';
  outroCard.style.opacity = String(easeInOut(Math.min(fadeProgress, 1)));
} else {
  introCard.style.opacity = '0';
  outroCard.style.opacity = '0';
}
```

**Content:** Replace `{PRODUCT_NAME}`, `{TAGLINE}`, `{CTA_TEXT}`, `{URL_OR_SUBTEXT}` with values derived from the target URL / user instructions. If not provided, infer sensible defaults from the page title and domain.

#### Master Timeline Configuration (Zero Lag Sync)

To guarantee that AI voiceover, visual animations, and sound effects are perfectly synchronized without any lag or drift, **you must dynamically build a master `TIMELINE` object** inside `demo.js` to drive all three. 

**Do not hardcode arbitrary timestamps like `P1_START = 2.5`.** Instead, use the `timestamps.json` file generated in Phase 2.5 to map exact spoken words to actions.

```js
// Load the transcription timestamps
const timestamps = JSON.parse(fs.readFileSync(path.join(demoDir, 'timestamps.json'), 'utf8'));

// Helper to find the start time of a specific word (first occurrence or after a certain time)
function findWordTime(targetWord, afterMs = 0) {
  const match = timestamps.find(t => t.word.toLowerCase().replace(/[^a-z0-9]/g, '') === targetWord.toLowerCase() && t.startMs > afterMs);
  return match ? match.startMs / 1000 : null; // Return in seconds
}

// Build the central timeline config dynamically
const TIMELINE = {
  // Trigger the click when the voiceover says "search"
  clickSearch: { 
    start: findWordTime('search') || 2.5, 
    duration: 0.22 
  },
  // Start typing right after the click
  typeQuery: { 
    start: (findWordTime('search') || 2.5) + 0.22, 
    duration: 2.1 
  }, // e.g. 21 characters at 0.1s per keystroke
  // Trigger result click when voiceover says "enter"
  clickResult: { 
    start: findWordTime('enter', 3000) || 7.72, 
    duration: 0.22 
  }
};
```

1. **In `animator.html` (`renderFrame`)**: Use `TIMELINE.action.start` and `(TIMELINE.action.start + TIMELINE.action.duration)` for your interpolation bounds.
2. **Typing Speed**: For mask reveal typing, ensure duration is exactly `charCount * 0.1s` (approx 60 WPM).
3. **In FFmpeg Audio Mix**: Multiply the timeline start value by 1000 for `adelay`, and use the exact duration for `atrim`. This ensures the `.mp3` matches the visual exactly to the millisecond.

| Time window | Action | Details |
|---|---|---|
| `0` → `1.5s` | Intro card fade | Held fully opaque, fades out at t=1.0s |
| `1.5s` → `TIMELINE.clickSearch.start` | Cursor travels to target | Cubic ease-in-out, zoom 1.0 → 1.15× |
| `TIMELINE.clickSearch.start` | Click ripple + feedback | Small ripple spawns; cursor scales 1.0 → 0.85 → 1.0 |
| `TIMELINE.typeQuery.start` | Mask Reveal Typing | Animates clip-path based exactly on `TIMELINE.typeQuery.duration` |
| `end - 1.5s` → `end` | Outro card fade in | Dark card fades in over 1.5s |

**Cubic ease-in-out:**
```js
const easeInOut = t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2;
```

**Interpolation pattern:**
```js
// Cursor movement
cursorX = startX + (targetX - startX) * easeInOut(progress);
cursorY = startY + (targetY - startY) * easeInOut(progress);

// Zoom
zoom = 1.0 + 0.15 * easeInOut(progress); // → 1.15×
```

**Cursor idle fade-out behavior:**
When there is no active interaction (during intro/outro cards or transitions), the cursor should smoothly drift to the right edge and fade out. This creates a natural, polished feel.

```js
// Track if cursor is in "active" interaction phase
const isActive = (t >= INTRO_DUR && t < OUTRO_START);
let cursorOpacity = 1;

if (!isActive) {
  // Fade out + drift right over 0.8s
  const fadeOutDur = 0.8;
  const timeSinceInactive = (isActive ? 0 : (t - (isActive ? INTRO_DUR : OUTRO_START))) % fadeOutDur;
  const fadeP = clamp01(timeSinceInactive / fadeOutDur);
  const eased = easeInOut(fadeP);
  
  // Drift rightward by ~400px over fade duration
  const driftX = 400 * eased;
  cursorX += driftX;
  cursorOpacity = 1 - eased; // fade from 1 → 0
}

cursor.style.opacity = String(cursorOpacity);
cursor.style.left = cursorX + 'px';
cursor.style.top  = cursorY + 'px';
cursor.style.transform = `scale(${cursorScale})`;
camera.style.transform = `scale(${zoom})`;
```

This ensures the cursor never feels "stuck" on screen — it gracefully exits when idle.

**Apply transforms at the end of `renderFrame`:**
```js
cursor.style.left = cursorX + 'px';
cursor.style.top  = cursorY + 'px';
cursor.style.transform = `scale(${cursorScale})`;
camera.style.transform = `scale(${zoom})`;
```

#### Frame Capture Loop — 30fps / 1080p

```ts
const fps = 30;
const totalFrames = Math.ceil(totalAudioDuration * fps);

const renderBrowser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--force-device-scale-factor=2']  // deviceScaleFactor=2 for retina
});
const renderPage = await renderBrowser.newPage();
await renderPage.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await renderPage.goto('file://' + path.resolve(demoDir, 'animator.html'));

for (let i = 0; i < totalFrames; i++) {
  await renderPage.evaluate(`window.renderFrame(${i / fps})`);
  await renderPage.screenshot({
    path: path.join(demoDir, `frame-${String(i).padStart(4,'0')}.png`),
    // No clip needed — viewport is already 1920×1080
  });
}
await renderBrowser.close();
```

> **Frame padding:** Use `padStart(4, '0')` for frame filenames at 30fps (up to 9,999 frames) so FFmpeg's `%04d` glob works correctly.

---

### Phase 3b — Scroll Inertia Physics

When a demo requires interacting with elements "below the fold," simulate natural scroll momentum instead of an instantaneous jump. This makes the scroll feel organic and camera-like.

**Capture:** Before scrolling, take `step-N-top.png`. After `scrollIntoView`, take `step-N-scrolled.png`.

**Physics model in `renderFrame`:**
```js
// Inertia scroll: exponential decay toward target scroll position
// scrollVelocity and scrollPos are persistent state (declared outside renderFrame)
let scrollPos = 0;
let scrollVelocity = 0;
const SCROLL_TARGET = 720; // px to scroll (one viewport height)
const SPRING_K = 8;        // stiffness — higher = snappier
const DAMPING  = 0.72;     // 0–1, lower = more oscillation

function tickScroll(dt) {
  const force = (SCROLL_TARGET - scrollPos) * SPRING_K;
  scrollVelocity = scrollVelocity * DAMPING + force * dt;
  scrollPos += scrollVelocity * dt;
}
```

**Animator layout for scroll:**
```html
<!-- Both images start at top:0; translateY controls their position entirely -->
<img id="scroll-top"      src="step-N-top.png"      style="position:absolute;top:0;left:0;">
<img id="scroll-scrolled" src="step-N-scrolled.png" style="position:absolute;top:0;left:0;">
```

```js
// Inside renderFrame — drive both images with inertia physics
tickScroll(1 / 30);
const topImg      = document.getElementById('scroll-top');
const scrolledImg = document.getElementById('scroll-scrolled');
topImg.style.transform      = `translateY(${-scrollPos}px)`;
scrolledImg.style.transform = `translateY(${720 - scrollPos}px)`;
```

**Critical:** Never combine `top: 720px` with `translateY(720px)` on the same element — this doubles the offset to 1440px and produces a blank screen. Set `top: 0` on both images and control all movement via `translateY` only.

**Proportional timings:** Always calculate scroll phase timing using the word timestamps from `timestamps.json` (e.g. `const tScrollStart = findWordTime('scroll')`) so the visual scroll perfectly synchronizes with the narration, no matter how long the TTS audio is.

---

### Phase 4 — FFmpeg Encoding

Stitch frames + audio into the final MP4 at 1080p / 30fps:

```ts
await new Promise((resolve, reject) => {
  ffmpeg()
    .input(path.join(demoDir, 'frame-%04d.png'))  // 4-digit padding for 30fps
    .inputOptions(['-framerate 30'])               // 30fps input
    .input(mixedAudioPath)                         // voiceover + music mix
    .outputOptions([
      '-c:v libx264',
      '-preset slow',      // better compression quality at 1080p
      '-crf 18',           // visually lossless — lower = higher quality
      '-pix_fmt yuv420p',  // broad compatibility
      '-c:a aac',
      '-b:a 192k',         // high-quality audio bitrate
      '-shortest'          // trim to the shorter of video/audio
    ])
    .on('end', resolve)
    .on('error', reject)
    .save(outputPath);
});
```

**Output path:** `<project-root>/public/demo-cinematic.mp4` by default. Final output is 1920×1080 @ 30fps.

---

## Handling Scrolling and Dynamic Layouts

When a demo requires interacting with elements "below the fold":
1. **Never jump instantly**: Capture a screenshot *before* scrolling (`step-N-top.png`), perform a `scrollIntoView`, then capture a screenshot *after* scrolling (`step-N-scrolled.png`). Only grab element coordinates *after* the scroll finishes so they are correct relative to the new viewport.
2. **Simulate Scroll via CSS**: In the Animator HTML, stack both images using `position: absolute` and `top: 0`. Animate a fake scroll using inertia physics (see Phase 3b) by sliding the `before` screenshot up and the `after` screenshot in from below.
   **CRITICAL (Blank Screen Bug):** Do NOT set `top: 720px` on the second image in your HTML if you are also using `translateY(720px)` in your JavaScript animation. This will double up the offsets, pushing the image to 1440px (off-screen) and resulting in a blank screen when the scroll finishes. Both images must start at `top: 0` when their movement is controlled entirely by `translateY()`.
3. **Synchronized Timings**: Never hardcode animation phases to specific seconds. Always extract precise trigger times from `timestamps.json` (Phase 2.5) so visual scrolls perfectly synchronize with the narration keywords (e.g. scrolling when the voiceover says "scroll down").

---

## Best Practices

- **agent-browser is the capture layer:** Never spin up a raw Puppeteer instance for Phase 1. Let agent-browser handle navigation, sessions, and screenshots — it deals with anti-bot measures, wait strategies, and viewport configuration automatically.
- **Anti-bot User-Agent:** Always set a realistic Chrome/macOS User-Agent in Phase 1 to prevent bot-wall interruptions (see Phase 1 section).
- **deviceScaleFactor:** Set `deviceScaleFactor: 2` in Phase 1 capture AND Phase 3 Puppeteer render for crisp retina-quality frames at 1080p.
- **No sudden transitions:** Always use 1.0–1.5s easing for all cursor moves and zoom changes.
- **Screenshot timing:** Capture after typing, before pressing Enter, so typed text is visible in the frame where the cursor sits at the input.
- **Fallback coordinates:** If agent-browser doesn't return element coords, default to `{ x: 960, y: 540 }` (1080p viewport center).
- **Temp directory:** Create a timestamped working directory inside `demo/` (e.g., `demo/demo-cinematic-<Date.now()>/`). All screenshots, manifests, and generated scripts MUST reside here.
- **Frame padding:** Use `String(i).padStart(4, '0')` for 30fps frame filenames so FFmpeg's `%04d` glob works correctly.
- **SFX Mandatory:** You MUST always include `click.mp3` for every click interaction and `keyboard.mp3` for every typing sequence. These must be perfectly synchronized via the `TIMELINE` object as described in Phase 5.
- **Click ripples:** Keep them small (`MAX_SIZE ≤ 32px`) and fast (`DURATION ≤ 0.22s`). One ripple per click event only.
- **Background music:** Mix at 10–15% volume under the voice. Always fade out the last 2 seconds.
- **Unlimited Steps:** The demo pipeline is **not restricted to 4 or 5 steps**. You can build workflows of any complexity (e.g. `step-10.png`, `step-15.png`). Simply add more Puppeteer actions in Phase 1, capture screenshots, and extend the cinematic animator's timeline variables (`p1`, `p2` ... `p20`) to map to your voiceover script.
- **`-shortest` flag:** Always use `-shortest` in FFmpeg so any small timing mismatch between audio and frames is handled gracefully.
- **Narration tone:** Default to `promo` template unless the user specifies a product/audience that suggests another template. Always pass the template variables into the TTS prompt rather than hardcoding the style text.

### Phase 5 — Audio & SFX Integration

To create a professional, immersive demo, the pipeline must integrate synchronized sound effects and perfect visual feedback:

- **Typing Visuals (The Mask Reveal Method)**: To achieve a premium, zero-lag letter-by-letter typing effect with pixel-perfect native fonts:
  1. Capture `step-1.png` (empty input) and `step-2.png` (fully typed text).
  2. Extract the EXACT bounding box width and left-edge pixel coordinate of the input element via `getBoundingClientRect()`.
  3. In the Animator HTML, stack `step-2.png` exactly on top of `step-1.png`.
  4. Apply a CSS clip-path to hide `step-2.png` initially using absolute pixels: `<img id="screenshot-typed" src="step-2.png" style="clip-path: inset(0px 1920px 0px 0px); position: absolute; top: 0; left: 0; z-index: 5;">`
  5. During the typing phase in `renderFrame(t)`, calculate exactly where the text cursor is: `currentX = boxLeft + (boxWidth * typeProgress)`. Animate the right-edge `inset` using `1920 - currentX`. Discretize the progress using `Math.floor(progress * charCount) / charCount` to make the text reveal abruptly keystroke-by-keystroke.
- **Typing SFX**: When the typing visual plays, trigger `keyboard.mp3` at the exact start time. **Crucial**: Use `atrim` to stop the typing audio exactly when the visual typing finishes.
- **Clicking SFX**: When the manifest action is `click`, trigger `click.mp3` at the precise moment the visual click ripple spawns.
- **Narration**: TTS narration remains the primary audio layer, mixed at 100% volume.

**Asset Paths:**
- SFX: `.opencode/skills/auto-demo-generator/references/sounds/keyboard.mp3`, `.opencode/skills/auto-demo-generator/references/sounds/click.mp3`

**Implementation Note (FFmpeg SFX Sync)**: 
Use FFmpeg's `complexFilter` to accurately delay (`adelay`) and trim (`atrim`) the SFX to match the visual phases. ALWAYS dynamically link these to your `TIMELINE` object so they never drift. Example:
```ts
.complexFilter([
  // e.g., typing duration = 2.1s, delay = 2720ms. Use asetpts=PTS-STARTPTS to reset timestamps after trim!
  `[2:a]atrim=0:${TIMELINE.typeQuery.duration},asetpts=PTS-STARTPTS,adelay=${TIMELINE.typeQuery.start * 1000}|${TIMELINE.typeQuery.start * 1000}[typing]`,
  // e.g., click delay = 2500ms
  `[3:a]adelay=${TIMELINE.clickSearch.start * 1000}|${TIMELINE.clickSearch.start * 1000}[click]`,
  // Mix voiceover (input 1), typing, and click into one track
  `[1:a][typing][click]amix=inputs=3:duration=first:dropout_transition=0[aout]`
])
.outputOptions(['-map 0:v', '-map [aout]'])
```

---

## Reference Implementation

See the full production pipeline in `apps/backend/demo-v2.ts` (bundled in `references/demo-v2.ts`).

Read `references/demo-v2.ts` when you need a complete working example or when adapting the
pipeline to a multi-step demo with more than 3 screenshots.

---

© 2026 Hormuz Labs. This work is licensed under a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).
