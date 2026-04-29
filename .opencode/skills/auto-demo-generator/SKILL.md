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
compatibility: "Requires agent-browser MCP (Vercel) and bash tool. npm deps: @google/generative-ai, wavefile, fluent-ffmpeg, dotenv, puppeteer (render phase only). System: ffmpeg binary. Env: GEMINI_API_KEY (required), GEMINI_API_KEY_TTS (optional)."
---

# Auto-Demo Generator

Produces polished, cinematic product demo MP4s by combining autonomous browser capture,
AI narration, and smooth frame-by-frame animation rendering.

## Output

A single `demo-cinematic.mp4` written to `public/` (or a user-specified path) at 1280×720,
30 fps, with synchronized voiceover.

---

## Workflow

### Phase 1 — Trace Capture (agent-browser MCP)

Use the **Vercel agent-browser MCP** to navigate the target site. It handles browser
spin-up, viewport, and session management automatically — you just call its tools.

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
If coordinates aren't available, fall back to `{ x: 640, y: 360 }` (viewport center).

**Artifact:** Save all screenshots to a timestamped `demoDir/` and record a manifest:
```json
[
  { "step": 1, "file": "step-1.png", "action": "navigate",      "coords": null },
  { "step": 2, "file": "step-2.png", "action": "type",          "coords": { "x": 512, "y": 340 } },
  { "step": 3, "file": "step-3.png", "action": "pressEnter",    "coords": { "x": 512, "y": 340 } }
]
```

> **Key rule:** Always screenshot *after* typing but *before* pressing Enter, so typed text appears in the frame where the cursor is still at the input.

---

### Phase 2 — Voiceover Generation

Use Gemini TTS to generate a natural `.wav` narration timed to the demo flow.

```ts
const ttsModel = new GoogleGenerativeAI(process.env.GEMINI_API_KEY_TTS).getGenerativeModel({ model: 'gemini-3.1-flash-tts-preview' });

const audioResponse = await ttsModel.generateContent({
  contents: [{ role: 'user', parts: [{ text: `Say this naturally: ${scriptText}` }] }],
  generationConfig: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Callirrhoe' } }
    }
  }
});

// Extract PCM data and write as WAV
const audioData = audioResponse.response.candidates[0].content.parts[0].inlineData.data;
const audioBuffer = Buffer.from(audioData, 'base64');
const wav = new WaveFile();
const pcmData = new Int16Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.length / 2);
wav.fromScratch(1, 24000, '16', pcmData);
fs.writeFileSync(audioPath, wav.toBuffer());

// Calculate total duration to drive animation length
const totalAudioDuration = wav.data.chunkSize / wav.fmt.byteRate;
```

**Voice options:** `Callirrhoe` (default), or any other Gemini prebuilt voice name.

---

### Phase 3 — Cinematic Animation Rendering

Build an HTML animation canvas that reconstructs smooth cursor movement and camera zoom
using the screenshots and coordinates from Phase 1, then capture it frame-by-frame with
Puppeteer (used here only as a headless renderer, not a browser agent).

#### HTML Animation Canvas

The animator HTML file must:
- Be a **self-contained** page at exactly `1280×720`
- Load `step-N.png` screenshots as `<img>` sources (relative paths work when using `file://`)
- Expose a global `window.renderFrame(timeSeconds)` function that sets all element styles deterministically

**Cursor SVG** (inline as `data:image/svg+xml;base64,...`):
```svg
<svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M20.5056 10.7754C21.1225 10.5355 21.431 10.4155 21.5176 10.2459C21.5926 10.099 21.5903 9.92446 21.5115 9.77954C21.4205 9.61226 21.109 9.50044 20.486 9.2768L4.59629 3.5728C4.0866 3.38983 3.83175 3.29835 3.66514 3.35605C3.52029 3.40621 3.40645 3.52004 3.35629 3.6649C3.29859 3.8315 3.39008 4.08635 3.57304 4.59605L9.277 20.4858C9.50064 21.1088 9.61246 21.4203 9.77973 21.5113C9.92465 21.5901 10.0991 21.5924 10.2461 21.5174C10.4157 21.4308 10.5356 21.1223 10.7756 20.5054L13.3724 13.8278C13.4194 13.707 13.4429 13.6466 13.4792 13.5957C13.5114 13.5506 13.5508 13.5112 13.5959 13.479C13.6468 13.4427 13.7072 13.4192 13.828 13.3722L20.5056 10.7754Z" fill="black" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

**CSS transform setup** — zoom must be anchored to the interaction point:
```css
#camera {
  width: 1280px; height: 720px;
  transform-origin: {targetX}px {targetY}px;
  position: absolute; top: 0; left: 0;
}
```

#### Animation Timeline Pattern

`window.renderFrame(t)` should implement this timeline structure for each interaction:

| Time window | Action | Details |
|---|---|---|
| `0` → `t₁` | Cursor travels to target | Cubic ease-in-out, zoom 1.0 → 1.5× |
| `t₁` → `t₁+0.5s` | Click feedback | Cursor scales 1.0 → 0.8 → 1.0 |
| `t₁+0.5s` → `t₂` | Hold / show result | Screenshot advances to next step |
| `t₂` → `t₂+1.5s` | Zoom out + cursor retreats | Cubic ease-in-out, zoom 1.5 → 1.0× |

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
zoom = 1.0 + 0.5 * easeInOut(progress); // → 1.5×
```

**Apply transforms at the end of `renderFrame`:**
```js
cursor.style.left = cursorX + 'px';
cursor.style.top  = cursorY + 'px';
cursor.style.transform = `scale(${cursorScale})`;
camera.style.transform = `scale(${zoom})`;
```

#### Frame Capture Loop

```ts
const fps = 30;
const totalFrames = Math.ceil(totalAudioDuration * fps);

const renderBrowser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const renderPage = await renderBrowser.newPage();
await renderPage.setViewport({ width: 1280, height: 720 });
await renderPage.goto('file://' + path.resolve(demoDir, 'animator.html'));

for (let i = 0; i < totalFrames; i++) {
  await renderPage.evaluate(`window.renderFrame(${i / fps})`);
  await renderPage.screenshot({ path: path.join(demoDir, `frame-${String(i).padStart(4,'0')}.png`) });
}
await renderBrowser.close();
```

---

### Phase 4 — FFmpeg Encoding

Stitch frames + audio into the final MP4:

```ts
await new Promise((resolve, reject) => {
  ffmpeg()
    .input(path.join(demoDir, 'frame-%04d.png'))
    .inputOptions(['-framerate 30'])
    .input(audioPath)
    .outputOptions([
      '-c:v libx264',
      '-pix_fmt yuv420p',  // broad compatibility
      '-c:a aac',
      '-shortest'          // trim to the shorter of video/audio
    ])
    .on('end', resolve)
    .on('error', reject)
    .save(outputPath);
});
```

**Output path:** `<project-root>/public/demo-cinematic.mp4` by default.

## Handling Scrolling and Dynamic Layouts

When a demo requires interacting with elements "below the fold":
1. **Never jump instantly**: Capture a screenshot *before* scrolling (`step-N-top.png`), perform a `scrollIntoView`, then capture a screenshot *after* scrolling (`step-N-scrolled.png`). Only grab element coordinates *after* the scroll finishes so they are correct relative to the new viewport.
2. **Simulate Scroll via CSS**: In the Animator HTML, stack both images using `position: absolute` and `top: 0`. Animate a fake scroll by sliding the `before` screenshot up by `-720px` while sliding the `after` screenshot up from `+720px` to `0px` using `transform: translateY()`. 
   **CRITICAL (Blank Screen Bug):** Do NOT set `top: 720px` on the second image in your HTML if you are also using `translateY(720px)` in your JavaScript animation. This will double up the offsets, pushing the image to 1440px (off-screen) and resulting in a blank screen when the scroll finishes. Both images must start at `top: 0` when their movement is controlled entirely by `translateY()`.
3. **Proportional Timings**: Never hardcode animation phases to specific seconds. Always calculate them as percentages of `TOTAL_AUDIO_DURATION` (e.g., `const tScroll = dur * 0.5`) so the visual scroll perfectly synchronizes with the narration, no matter how long the TTS audio is.

---

## Best Practices

- **agent-browser is the capture layer:** Never spin up a raw Puppeteer instance for Phase 1. Let agent-browser handle navigation, sessions, and screenshots — it deals with anti-bot measures, wait strategies, and viewport configuration automatically.
- **No sudden transitions:** Always use 1.0–1.5s easing for all cursor moves and zoom changes.
- **Screenshot timing:** Capture after typing, before pressing Enter, so typed text is visible in the frame where the cursor sits at the input.
- **Fallback coordinates:** If agent-browser doesn't return element coords, default to `{ x: 640, y: 360 }` (viewport center).
- **Temp directory:** Create a timestamped `demo-cinematic-<Date.now()>/` working directory and clean it up after encoding if disk space is a concern.
- **Frame padding:** Use `String(i).padStart(4, '0')` for frame filenames so FFmpeg's `%04d` glob works correctly.
- **`-shortest` flag:** Always use `-shortest` in FFmpeg so any small timing mismatch between audio and frames is handled gracefully.

---

## Reference Implementation

See the full production pipeline in `apps/backend/demo-v2.ts` (bundled in `references/demo-v2.ts`).

Read `references/demo-v2.ts` when you need a complete working example or when adapting the
pipeline to a multi-step demo with more than 3 screenshots.

---

© 2026 Hormuz Labs. This work is licensed under a [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/).