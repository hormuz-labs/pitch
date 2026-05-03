# The Cinematic Time-Remapping Pipeline (V4)

This reference outlines the advanced architecture for generating perfectly synced, cinematic product demos. It solves the core problem of AI demo generation: **human interaction speeds (typing, scrolling) rarely match the timing of generated TTS voiceovers.**

Instead of forcing the browser to wait (which looks robotic) or animating static screenshots (which misses dynamic UI state like dropdowns), this pipeline uses **Post-Production Time-Remapping**.

## The Architecture

### 1. Segmented Raw Capture
Record the browser session (`agent-browser record`) natively, without worrying about audio timing. Split the recording into distinct segments based on the *type* of action:

*   **Static Action Blocks:** Clicking buttons, scrolling, navigating. 
*   **Dynamic Typing Blocks:** Filling out forms where native UI reactions (like autocomplete dropdowns or validation messages) must be captured. *Inject a ~400ms delay between keystrokes to ensure network requests resolve and UI updates render.*

*Tip: Inject an invisible, pulsing 1x1 pixel into the DOM during recording to force the browser to emit continuous frames during idle periods, preventing CDP screencast dropouts.*

### 2. Selective Decimation
Use FFmpeg's `mpdecimate` filter to strip out all "dead air" and idle time from the **Static Action Blocks**. This compresses seconds of waiting into a dense sequence of pure action frames.
*Do NOT decimate Dynamic Typing Blocks.*

```bash
ffmpeg -i part1_raw.webm -vf "mpdecimate,setpts=N/FRAME_RATE/TB" part1_decimated.webm
```

### 3. Voiceover Generation & Timestamping
Generate the TTS audio. Transcribe the audio (using an LLM like `gemini-2.5-flash`) to extract the exact millisecond `startMs` and `endMs` for every spoken word.

### 4. Time-Stretching & Padding (The Remap)
Extract the frames from the decimated videos. Using a script, map these pure-action frames to the audio timeline:
*   **Padding:** Hold a specific action frame (by duplicating it) until the exact millisecond the voiceover mentions the next action.
*   **Stretching:** For Dynamic Typing Blocks, calculate the duration of the audio segment vs the raw video segment, and use FFmpeg's `setpts` filter to smoothly stretch the typing to fit the audio.
    *   `ffmpeg -i typing.webm -vf "setpts=(AUDIO_DUR/VIDEO_DUR)*PTS" stretched.webm`

### 5. Programmatic Pan/Zoom & Cursor Injection (Canvas Renderer)
Do not use native OS cursors (which look messy and are often dropped by CDP). 
Instead, load the perfectly synced, time-mapped frames into an HTML Canvas (`animator.html`).
*   **The Cursor:** Render a high-quality SVG cursor that moves along programmed bezier curves between interaction coordinates, emitting CSS ripples on clicks.
*   **Professional Camera Logic (No Yo-Yo Zooming):** When scaling the Canvas to highlight UI elements (`transform: scale(zoom)`), **do not** zoom in for a click and immediately zoom back out to 1.0 (yo-yoing). Professional editors use long, continuous "pushes" (e.g., slowly zooming from 1.0 to 1.3 over several seconds) and then *hold* that zoom while panning the camera (`translate`) between nearby interactions. Only pull back to 1.0 during major page navigations or at the very end of the video.

Render this canvas out using Puppeteer to generate the final frames.

### 6. Final Compositing
Merge the rendered frames, the TTS voiceover, and synchronized sound effects (keyboard clacks, mouse clicks) using FFmpeg.

```bash
ffmpeg -y -framerate 30 -i seq_%04d.jpg -i voiceover.wav -i click.mp3 ...
```