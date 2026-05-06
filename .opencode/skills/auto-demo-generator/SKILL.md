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
bun demos/<demo-name>/demo-v4.ts demos/<demo-name>/demo-config.json
```

**Just-In-Time (JIT) Element Resolution:** Bounding boxes are NOT extracted in a previous pass. Because modern web pages load dynamically and ads/banners can shift the layout, the engine resolves the selector's live coordinates directly during the video recording right before the camera moves. This ensures 100% precision.

## Workflow

### Phase 0.1 — Demo Workspace Initialization
Before creating the config, the AI Agent MUST create a dedicated folder for the demo in the project root's `demos/` directory (e.g., `demos/shadcn-demo/`).

**CRITICAL RULE ON FILES:** You MUST NEVER run or modify the `demo-v4.ts` script directly from the `.opencode/` directory. The `.opencode` version is the template. The agent MUST copy the main engine script (`demo-v4.ts`) and all required media assets (`references/sounds/*.mp3`) directly into the new `demos/<demo-name>/` folder. This creates a flat structure so the script can seamlessly access `click.mp3` and `keyboard.mp3` from the same directory where it runs. If any customizations are needed for the specific demo, you must ONLY edit the copy located inside the `demos/` folder.

### Phase 0.2 — Selector Collection via Playwright CLI/MCP (Prerequisite)
Before generating `demo-config.json`, the AI Agent MUST use the `playwright-cli` skill (or Playwright MCP) to navigate the target website and interact with the elements. 

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
*   **JIT Coordinates:** It waits until `T - 1.2s`, waits for the element to be visible, dynamically grabs `locator.boundingBox()`, and starts moving the CSS cursor and zooming the camera. At exact time `T`, it triggers the CSS ripple and performs the real Playwright `click()` or `pressSequentially()`.

### Phase 4 — Normalized FFmpeg Encoding (Volume Drift Fix)
Multiplex the resulting `.webm` video from Playwright with the voiceover, typing, and click SFX.
1.  **Drop infinite apad:** FFmpeg tends to hang if `apad` is left on all SFX mixing tracks indefinitely. The script now lets SFX end naturally.
2.  **Disable Normalization (`normalize=0`):** Without `apad` on the SFX, standard `amix` behavior would volume-jump the voiceover whenever an SFX stops. `normalize=0` prevents volume shifting!
3.  **End on Voiceover (`duration=first`):** Ensure the mix stops when the main padded voiceover stops.

## Reference Implementation
See the **perfected, generic pipeline** in `references/demo-v4.ts`. It acts as an automation engine that processes JSON steps rather than hardcoded Playwright scripts, making it infinitely reusable across any website.
