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

Produces polished, cinematic product demo MP4s by combining HD static plate capture,
AI narration, LLM-driven timeline mapping, and normalized FFmpeg audio mixing.

## Output
A single `demo-cinematic.mp4` written to `public/` (or a user-specified path) at 1920x1080,
30 fps, with synchronized voiceover and perfectly leveled sound effects.

---

## Workflow

### Phase 1 — HD Static Plate Capture (Agent-Browser CLI via Agent)
As the AI Agent, you MUST use the `agent-browser` CLI directly in your terminal to capture high-definition static plates for every key state. **DO NOT write any automation scripts (no Bash scripts, no Node scripts, no Python scripts) for this phase.** 

**Why?** Modern web frameworks (React, Angular, Vue) use highly dynamic DOM structures and client-side routing. Taking a screenshot immediately after a click often captures the *old* page state. Recording video results in heavy compression and blurry text.

**CRITICAL NOTE FOR HD CAPTURE:**
1. Do not use `agent-browser record` (it produces low-res video).
2. **VERIFY BEFORE CAPTURE (MANDATORY):** Client-side routing and network requests take unpredictable amounts of time. You MUST verify the page state has updated before running `screenshot`. Do not rely solely on `sleep`. Use `agent-browser snapshot` or `agent-browser get box <ref>` to confirm the expected new element is present in the DOM *before* capturing the HD plate.
3. For navigation, prefer using `agent-browser open <direct_url>` to guarantee a fresh load.
4. Save each state to a dedicated directory (e.g., `hd_plates/state_0.png`, `hd_plates/state_1.png`).
5. Capture the bounding box (`agent-browser get box ... --json`) for every element you intend to "click" or "type" into.

```bash
# Example sequence run DIRECTLY by the Agent in the CLI
agent-browser --session demo-capture set viewport 1920 1080
agent-browser --session demo-capture open https://example.com
# 1. Wait for page load
sleep 3
# 2. VERIFY the expected element exists before capturing
agent-browser --session demo-capture snapshot -i
agent-browser --session demo-capture screenshot hd_plates/state_0.png

# ... identify @e5 as Search button ...
agent-browser --session demo-capture get box @e5 --json
agent-browser --session demo-capture click @e5
# 1. Wait for interaction/routing
sleep 2
# 2. VERIFY the new state (e.g., check if the search modal is open)
agent-browser --session demo-capture get box @e20 --json
agent-browser --session demo-capture screenshot hd_plates/state_1.png
```

### Phase 2 — Voiceover Generation & Transcription
Use `gemini-3.1-flash-tts-preview` (or fallback to `gemini-2.5-flash` if unavailable) to generate the `.wav` narration (default voice: `Orus`).
Use `gemini-2.5-flash` to transcribe that `.wav` into a JSON array containing `word`, `startMs`, and `endMs`.

These word-level timestamps are strictly required for synchronization.

### Phase 2.5 — LLM-Driven Timeline Mapping
**Do not use regex or `Array.find` to map words to timestamps.** Common words like "is" or "click" appear multiple times and will break your timeline.
You MUST write a script that passes the raw `timestamps.json` array to an LLM (`gemini-2.5-flash` or `gemini-3.1-flash`) and asks it to semantically extract the exact time in seconds for each interaction using a strict JSON `responseSchema`. Save this to `timeline.json`.

### Phase 3 — State Machine Animation Rendering
Build an `animator.html` canvas.
*   **No Backticks in Script:** You MUST use string concatenation (`+`) when injecting JS templates into the `animatorHtml` variable. ESBuild/TypeScript execution will fail with "Unterminated string literal" if you use backticks inside the HTML string.
*   **HD State Machine:** Instead of interpolating through video frames, build a strict time-based state machine (`activeState = 1`, `activeState = 2`) that toggles the visibility of the HD static `<img>` plates captured in Phase 1.
*   **Cursor Movement & Easing:** Target a cursor movement duration of **1.4s to 1.5s**. This provides a smooth, deliberate pace that is easy for viewers to follow. **You MUST use a soft cubic easing function** (`4*t*t*t`). Absolutely do not use `power4` or sharp easings, as they cause the cursor to whip violently across the screen.
*   **Exact Center Clicks:** `agent-browser` bounding boxes return the *top-left* coordinate. You MUST manually calculate and target the exact center of the element by using `box.x + box.width / 2` and `box.y + box.height / 2`. Never click the top-left coordinate.
*   **Professional Camera Logic (No Yo-Yo Zooming):** When scaling the Canvas to highlight UI elements (`transform: scale(zoom)`), **do not** zoom in for a click and immediately zoom back out to 1.0 (yo-yoing). Professional editors use long, continuous "pushes" (e.g., slowly zooming from 1.0 to 1.3 over several seconds) and then *hold* that zoom while panning the camera (`translate`) between nearby interactions. Only pull back to 1.0 during major page navigations or at the very end of the video.
*   **Human-Like Typing:** Use a stepped easing function with sine-wave distortion (`humanTypeEase`) to simulate natural, bursty typing rather than uniform linear typing.
*   **Strict Click Syncing:** Ensure each click triggers both a visual ripple in the DOM and a precisely timed `click.mp3` in the FFmpeg audio mix.
*   **Puppeteer for Frames:** Use a Node script with `puppeteer` to render the frames (as shown in `demo-v4.ts`). Launch it with `--force-device-scale-factor=2` and `deviceScaleFactor: 2` to match the 1080p retina resolution, and loop through `window.renderFrame(t)` to take screenshots.

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
See the **perfected, fully functioning pipeline** in [demo-v4](references/demo-v4.ts). This reference file demonstrates the complete V4.1 architecture, including HD plate capture, semantic LLM timeline mapping, and professional continuous cinematic camera zooming. Always model new demos after this file.
