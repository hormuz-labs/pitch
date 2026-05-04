# The Cinematic Time-Remapping Pipeline (V4.1)

This reference outlines the advanced architecture for generating perfectly synced, cinematic product demos. It solves the core problem of AI demo generation: **human interaction speeds (typing, scrolling) rarely match the timing of generated TTS voiceovers.**

Instead of forcing the browser to wait (which looks robotic), recording compressed video (which is blurry), or writing fragile automation scripts, this pipeline uses **HD Static Plate Compositing and LLM Timeline Mapping**.

## The Architecture

### 1. HD Static Plate Capture
Do not record the browser session (e.g., no `agent-browser record`). Screen recording produces heavily compressed, low-resolution video that looks unprofessional when zoomed in.

Instead, capture a series of high-definition, uncompressed screenshots (`.png`) representing every key state of the interaction (e.g., initial page, modal open, form filled, success screen).
*   **Navigation:** Use direct URL navigation (`agent-browser open <url>`) where possible, combined with deliberate `sleep` commands (e.g., `sleep 3`), to guarantee the page and all client-side routing has fully rendered before capturing the HD plate.

### 2. Voiceover Generation & Transcription
Generate the TTS audio. Transcribe the audio (using an LLM like `gemini-2.5-flash`) to extract the exact millisecond `startMs` and `endMs` for every spoken word. Output this as a raw JSON array.

### 3. LLM-Driven Timeline Mapping
Do not use regex or array matching to find words in the transcript; common words appear multiple times and will break synchronization. 

Write a script that passes the `timestamps.json` array to an LLM with strict JSON structured output (`responseSchema`). Ask the LLM to semantically understand the voiceover and map specific interaction points (e.g., `tSearchClick`, `tResultShown`) to exact times in seconds.

### 4. HD State Machine & Programmatic Camera (Canvas Renderer)
Load the HD Static Plates into an HTML Canvas (`animator.html`). Use a time-based state machine powered by the LLM timeline to instantly swap between the HD plates exactly when the voiceover dictates.

*   **The Cursor:** Render a high-quality SVG cursor that moves along programmed bezier curves between interaction coordinates, emitting CSS ripples on clicks.
*   **Professional Camera Logic (No Yo-Yo Zooming):** When scaling the Canvas to highlight UI elements (`transform: scale(zoom)`), **do not** zoom in for a click and immediately zoom back out to 1.0 (yo-yoing). Professional editors use long, continuous "pushes" (e.g., slowly zooming from 1.0 to 1.3 over several seconds) and then *hold* that zoom while panning the camera (`translate`) between nearby interactions. Only pull back to 1.0 during major page navigations or at the very end of the video.

Render this canvas out using Puppeteer to generate the final sequential frames.

### 5. Final Compositing & Normalized FFmpeg Encoding
Merge the rendered frames, the TTS voiceover, and synchronized sound effects (keyboard clacks, mouse clicks) using FFmpeg. Ensure high-quality output settings (`-crf 18 -preset slow`).

**Volume Drift Fix:**
When mixing multiple audio tracks with `amix`, you MUST pad all SFX tracks (`apad`) and disable normalization (`normalize=0`). If you do not, FFmpeg will dynamically recalculate the overall volume every time a short sound effect finishes, causing the voiceover to progressively become louder and distort.

```bash
ffmpeg -y -framerate 30 -i seq_%04d.jpg -i voiceover.wav -i click.mp3 ...
```