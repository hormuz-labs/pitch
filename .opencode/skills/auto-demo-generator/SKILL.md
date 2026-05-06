---
name: auto-demo-generator
description: >
  Creates autonomous, cinematic product demo videos from any website URL. Use this skill
  whenever the user wants to record a product demo, walkthrough video, tutorial screencast,
  or any automated "show me how to use X" video. Triggers on: "make a demo video", "record
  a walkthrough", "create a tutorial video", "automate a product demo", "screencast of X",
  "show how to use X", or any request to produce an MP4 of web interactions.
compatibility: "npm deps: @google/genai, mime, fluent-ffmpeg, dotenv, playwright. System: ffmpeg binary. Env: GEMINI_API_KEY (required)."
---

# Auto-Demo Generator

Produces polished, cinematic product demo MP4s by combining native Playwright video recording,
AI narration, LLM-driven timeline mapping, injected cinematic overlays (zoom & cursor), 
and normalized FFmpeg audio mixing.

## Architecture: Data-Driven Automation & JIT Bounding Boxes

The engine is driven by a single JSON configuration file. Instead of writing custom Playwright code for each new website, the AI Agent simply generates a configuration file and passes it to the generic engine.

**Example `demo-config.json`:**
```json
{
  "startUrl": "https://example.com",
  "userReq": "Show me how to use the search feature on example.com",
  "outputPath": "example-demo.mp4",
  "cursorStyle": "black",
  "steps": [
    { "id": "tSearchClick", "description": "Click the search bar", "action": "click", "selector": "button.search" },
    { "id": "tSearchType", "description": "Type 'accordion'", "action": "type", "selector": "input.search", "value": "accordion" },
    { "id": "tOutro", "description": "Conclude the demo", "action": "wait" }
  ]
}
```

**Execution:**
```bash
bun run src/index.ts demo-config.json
```

**Just-In-Time (JIT) Element Resolution:** Bounding boxes are NOT extracted in a previous pass. Because modern web pages load dynamically and ads/banners can shift the layout, the engine resolves the selector's live coordinates directly during the video recording right before the camera moves. This ensures 100% precision.

## Workflow

### Phase 0.1 — Demo Workspace Initialization
Before creating the config, the AI Agent MUST create a dedicated folder for the demo in the project root's `demos/` directory (e.g., `demos/shadcn-demo/`).

**CRITICAL RULE ON FILES:** You MUST NEVER run or modify the scripts directly from the `.opencode/` directory. The `.opencode` versions are the templates. The agent MUST copy the entire `references/` folder into the new `demos/<demo-name>/` folder. For example, copy everything to `demos/shadcn-demo/` so that `demos/shadcn-demo/package.json` and `demos/shadcn-demo/src/index.ts` exist. From there, `cd demos/<demo-name>` and `bun install`, then add your `demo-config.json` inside that folder. If any customizations are needed for the specific demo, you must ONLY edit the copies located inside the `demos/` folder.

### Phase 0.2 — Selector Collection via Agent Browser (Prerequisite)
Before generating `demo-config.json`, the AI Agent MUST use the `agent-browser` skill to navigate the target website and interact with the elements. 

**CRITICAL:** This step is crucial for discovering precise, reliable DOM selectors required for the actions. Snapshots and internal framework IDs will change between sessions. You must collect highly stable semantic selectors (e.g., specific text contents, stable CSS classes, or ARIA roles). If we run the same automation script on a fresh session, it shouldn't break. Always keep selector stability in mind.

Once the agent has successfully verified and collected all the necessary stable working selectors, it will dynamically generate the `demo-config.json` file inside the new demo folder.

**Note on Scrolling:** During the video recording phase, the engine automatically checks if the element is in the viewport. It will ONLY scroll the component into the viewport if it is not already visible. If it is in the viewport, it won't scroll. This ensures a clean cinematic experience.

### Phase 1 — Flow Validation (Playwright Dry Run)
The generic engine loops through `demoSteps`. For every step with a selector, it waits for the element and performs the action (`click` or `fill`). This ensures all selectors are valid and the sequence doesn't get stuck before we spend money on LLM/TTS generation.

### Phase 2 — Voiceover Generation & Transcription
Use `gemini-3.1-flash-tts-preview` (or fallback to `gemini-2.5-flash` if unavailable) to generate the `.wav` narration (default voice: `Puck`).
Use `gemini-2.5-flash` to transcribe that `.wav` into a JSON array containing `word`, `startMs`, and `endMs`.

### Phase 2.5 — LLM-Driven Timeline Mapping
Pass the raw transcription and the `demoSteps` descriptions to an LLM (`gemini-2.5-flash`). The LLM semantically maps the steps to exact timestamps in seconds. Save this to `timeline.json`. 

### Phase 3 — Cinematic Recording & Execution
Run the final Playwright instance with `recordVideo` enabled (1920x1080).
*   **Cinematic Injections:** Inject CSS-animated artificial cursor and camera zoom transforms.
*   **Generic Execution Loop:** The engine loops through `demoSteps` again. For each step, it looks up the timestamp in `timeline.json`. 
*   **JIT Coordinates:** It waits until `T - 0.5s`, waits for the element to be visible, dynamically grabs `locator.boundingBox()`, and starts moving the CSS cursor and zooming the camera. We wait until right before the action to calculate coordinates in order to avoid clicking old stale coordinates after layout shifts (like CSS transitions and accordions). At exact time `T`, it triggers the CSS ripple and performs the real Playwright `click()` or `pressSequentially()`.

### Phase 4 — Normalized FFmpeg Encoding & AV Sync
Multiplex the resulting `.webm` video from Playwright with the voiceover, typing, and click SFX.
1.  **A/V Sync (Playwright Offset):** Playwright's `recordVideo` doesn't start its internal clock until the first frame is painted. The engine forces a blank frame immediately to start the clock, calculates `initDurationMs` (the time it takes for the actual page to load), and offsets the voiceover and all SFX by this duration in FFmpeg (`adelay`) to perfectly sync real-time audio with the delayed video.
2.  **Drop infinite apad:** FFmpeg tends to hang if `apad` is left on all SFX mixing tracks indefinitely. The script now lets SFX end naturally.
3.  **Disable Normalization (`normalize=0`):** Without `apad` on the SFX, standard `amix` behavior would volume-jump the voiceover whenever an SFX stops. `normalize=0` prevents volume shifting!
4.  **End on Voiceover (`duration=first`):** Ensure the mix stops when the main padded voiceover stops.

## Reference Implementation
See the **perfected, generic pipeline modularized** in the `references/` directory. It acts as an automation engine that processes JSON steps rather than hardcoded Playwright scripts, making it infinitely reusable across any website.
