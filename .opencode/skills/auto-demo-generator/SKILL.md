---
name: auto-demo-generator
description: >
  Creates autonomous, cinematic product demo videos from any website URL. Use this skill
  whenever the user wants to record a product demo, walkthrough video, tutorial screencast,
  or any automated "show me how to use X" video. Triggers on: "make a demo video", "record
  a walkthrough", "create a tutorial video", "automate a product demo", "screencast of X",
  "show how to use X", or any request to produce an MP4 of web interactions.
compatibility: "npm deps: @google/genai, mime, fluent-ffmpeg, dotenv, puppeteer. System: ffmpeg binary. Env: GEMINI_API_KEY (required)."
---

# Auto-Demo Generator

Produces polished, cinematic product demo MP4s by combining raw Puppeteer browser capture,
AI narration, strict state-machine frame animation, and normalized FFmpeg audio mixing.

## Output
A single `demo-cinematic.mp4` written to `public/` (or a user-specified path) at 1920x1080,
30 fps, with synchronized voiceover and perfectly leveled sound effects.

---

## Workflow

**CRITICAL RULE:** Do NOT use the `agent-browser` CLI for Phase 1. It causes resolution downscaling and coordinate mismatch. You MUST use direct `puppeteer` manipulation via script.

### Phase 1 — High-Res Trace Capture (Direct Puppeteer)
Write a Node script using raw `puppeteer`. Force the viewport to `1920x1080` and use `deviceScaleFactor: 2`. This guarantees the captured screenshots are true 1080p retina resolution, matching the animation canvas exactly.

To get the exact coordinates for clicks, do NOT guess. Use `page.evaluate()` and `getBoundingClientRect()` on the specific element you need to interact with. Save these absolute coordinates to a `manifest.json`.

```javascript
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });

const btnBox = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Search'));
  const rect = el.getBoundingClientRect();
  // Return true center coordinates
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
});
```

### Phase 2 — Voiceover Generation & Transcription
Use `gemini-3.1-flash-tts-preview` to generate the `.wav` narration (default voice: `Orus`).
Use `gemini-2.5-flash` to transcribe that `.wav` into a JSON array containing `word`, `startMs`, and `endMs`.

These word-level timestamps are strictly required for Phase 3 synchronization.

### Phase 3 — State Machine Animation Rendering
Build an `animator.html` canvas.
*   **No Backticks in Script:** You MUST use string concatenation (`+`) when injecting JS templates into the `animatorHtml` variable. ESBuild/TypeScript execution will fail with "Unterminated string literal" if you use backticks inside the HTML string.
*   **Explicit State Machine & Dynamic Interpolation:** Do not rely on loose interpolations or hardcoded durations. Build a strict `if/else if` ladder based on your `TIMELINE`. Crucially, calculate the gap between audio events dynamically. Use logic like `let gap = TIMELINE.next - TIMELINE.current; let dur = Math.max(1.5, Math.min(gap, 2.0));` to guarantee a smooth, cinematic transition even if the voiceover timing is tight. 
*   **Camera Tracking:** Ensure the camera clamps cleanly and zooms back out (e.g., `zoom = 1.0`) after deep interactions so the user isn't stuck staring at a zoomed-in fragment of the screen.
*   **Cursor Options:** Three cursor styles are available in `references/icons/`: `cursor-black.svg`, `cursor-white.svg`, and `cursor.svg` (default).

```javascript
// Example of robust, dynamic interpolation
} else if (t < TIMELINE.tSearch) {
  let gap = TIMELINE.tSearch - TIMELINE.tDocs;
  // Enforce a minimum 1.5s animation duration
  let dur = Math.max(1.5, Math.min(gap, 2.0));
  let startMoveT = TIMELINE.tSearch - dur;
  
  if (t < startMoveT) {
    cx = DOCS.x; cy = DOCS.y; zoom = 1.3; shot = 2;
  } else {
    let p = easeInOut(clamp01((t - startMoveT) / dur));
    cx = interp(DOCS.x, SEARCH.x, p); cy = interp(DOCS.y, SEARCH.y, p);
    zoom = p < 0.5 ? interp(1.3, 1.0, p*2) : interp(1.0, 1.5, (p-0.5)*2); shot = 2;
  }
}
```

### Phase 4 — Normalized FFmpeg Encoding (Volume Drift Fix)
When mixing multiple audio tracks (voiceover + clicks + typing), you MUST configure the `amix` filter carefully. If you do not, FFmpeg will dynamically recalculate the volume every time a short sound effect finishes (drops out), causing the voiceover to progressively become louder and louder until it distorts.

1.  **Pad all SFX (`apad`):** Add `,apad` to the end of every SFX filter chain so they "play silence" forever rather than dropping out.
2.  **Disable Normalization (`normalize=0`):** Tell `amix` not to scale the volume down based on the number of inputs.
3.  **End on Voiceover (`duration=first`):** Ensure the mix stops when the main padded voiceover stops.

```javascript
command.complexFilter([
  // Pad main voiceover
  `[1:a]apad=pad_dur=${padAmount}[voicepad]`,
  // Add ,apad to ALL SFX tracks so they never "drop out"
  `[2:a]atrim=0:${typeDur},asetpts=PTS-STARTPTS,adelay=${TIMELINE.tTypeStart * 1000}|${TIMELINE.tTypeStart * 1000},apad[typing]`,
  `[3:a]adelay=${TIMELINE.tDocs * 1000}|${TIMELINE.tDocs * 1000},apad[click1]`,
  // Mix using duration=first and normalize=0
  `[voicepad][typing][click1]amix=inputs=3:duration=first:normalize=0[aout]`
]);
```

## Reference Implementation
See the **perfected, fully functioning pipeline** in `.opencode/skills/auto-demo-generator/references/demo-v3.ts`. This reference file contains the exact `puppeteer` capture logic, the `gemini-2.5-flash` transcription, the HTML state machine, and the normalized `ffmpeg` encoding block. Always model new demos after this file.
