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

Produces polished, cinematic product demo MP4s by combining agent-browser CLI capture,
AI narration, strict state-machine frame animation, and normalized FFmpeg audio mixing.

## Output
A single `demo-cinematic.mp4` written to `public/` (or a user-specified path) at 1920x1080,
30 fps, with synchronized voiceover and perfectly leveled sound effects.

---

## Workflow

### Phase 1 — High-Res Trace Capture (Agent-Browser CLI via Agent)
As the AI Agent, you MUST use the `agent-browser` CLI directly in your terminal for all interactions and captures. **Do not write a Node script for this phase.**
1. Set the viewport to 1920x1080: `agent-browser set viewport 1920 1080`
2. Navigate and capture step-by-step screenshots: Use `agent-browser open`, `agent-browser snapshot -i`, and `agent-browser screenshot step-1.png`.
3. Extract coordinates: Use `agent-browser get box @eN` to get the exact `{x, y, width, height}` for elements you interact with. 
4. Manually construct and save a `manifest.json` file containing these exact coordinates.

```bash
# Example sequence run directly by the Agent in the CLI
agent-browser set viewport 1920 1080
agent-browser open https://example.com
agent-browser screenshot step-1.png
agent-browser snapshot -i
# ... identify @e5 as Search button ...
agent-browser get box @e5 --json
agent-browser click @e5
```

### Phase 2 — Voiceover Generation & Transcription
Use `gemini-3.1-flash-tts-preview` to generate the `.wav` narration (default voice: `Orus`).
Use `gemini-2.5-flash` to transcribe that `.wav` into a JSON array containing `word`, `startMs`, and `endMs`.

These word-level timestamps are strictly required for Phase 3 synchronization.

### Phase 3 — State Machine Animation Rendering
Build an `animator.html` canvas.
*   **No Backticks in Script:** You MUST use string concatenation (`+`) when injecting JS templates into the `animatorHtml` variable. ESBuild/TypeScript execution will fail with "Unterminated string literal" if you use backticks inside the HTML string.
*   **Explicit State Machine & Dynamic Interpolation:** Build a strict `if/else if` ladder based on your `TIMELINE`.
*   **Cursor Movement & Easing:** Target a cursor movement duration of **1.4s to 1.5s**. This provides a smooth, deliberate pace that is easy for viewers to follow. **You MUST use a soft cubic easing function** (`4*t*t*t`). Absolutely do not use `power4` or sharp easings, as they cause the cursor to whip violently across the screen.
*   **Exact Center Clicks:** `agent-browser` bounding boxes return the *top-left* coordinate. You MUST manually calculate and target the exact center of the element by using `box.x + box.width / 2` and `box.y + box.height / 2`. Never click the top-left coordinate.
*   **Cursor Visibility:** Always use `<img id="cursor" src="cursor-black.svg" />` (not the white default) to ensure the cursor stands out clearly against modern, light-themed documentation pages.
*   **Human-Like Typing:** Use a stepped easing function with sine-wave distortion (`humanTypeEase`) to simulate natural, bursty typing rather than uniform linear typing.
*   **Strict Click Syncing:** Capture the bounding box for *every* interaction. Ensure each click triggers both a visual ripple in the DOM and a precisely timed `click.mp3` in the FFmpeg audio mix.
*   **Puppeteer for Frames:** Use a Node script with `puppeteer` to render the frames (as shown in `demo-v3.ts`). Launch it with `--force-device-scale-factor=2` and `deviceScaleFactor: 2` to match the 1080p retina resolution, and loop through `window.renderFrame(t)` to take screenshots.

### Phase 4 — Normalized FFmpeg Encoding (Volume Drift Fix)
When mixing multiple audio tracks (voiceover + clicks + typing), you MUST configure the `amix` filter carefully. If you do not, FFmpeg will dynamically recalculate the volume every time a short sound effect finishes (drops out), causing the voiceover to progressively become louder and louder until it distorts.

1.  **Pad all SFX (`apad`):** Add `,apad` to the end of every SFX filter chain so they "play silence" forever rather than dropping out.
2.  **Disable Normalization (`normalize=0`):** Tell `amix` not to scale the volume down based on the number of inputs.
3.  **End on Voiceover (`duration=first`):** Ensure the mix stops when the main padded voiceover stops.

```javascript
command.complexFilter([
  // Pad main voiceover
  '[1:a]apad=pad_dur=2[voicepad]',
  // Add ,apad to ALL SFX tracks so they never "drop out"
  '[2:a]atrim=0:' + typeDur + ',asetpts=PTS-STARTPTS,adelay=' + (TIMELINE.tTypeStart * 1000) + '|' + (TIMELINE.tTypeStart * 1000) + ',apad[typing]',
  '[3:a]adelay=' + (TIMELINE.tClick1 * 1000) + '|' + (TIMELINE.tClick1 * 1000) + ',apad[click1]',
  // Mix using duration=first and normalize=0
  '[voicepad][typing][click1]amix=inputs=3:duration=first:normalize=0[aout]'
]);
```

## Reference Implementation
See the **perfected, fully functioning pipeline** in `.opencode/skills/auto-demo-generator/references/demo-v3.ts`. This reference file uses `agent-browser` CLI for all captures and interactions. Always model new demos after this file.

For the advanced V4 sync architecture (decimation, native typing time-stretching, dynamic canvas zoom): [time-remapping-pipeline](references/time-remapping-pipeline.md)
