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
AI narration, LLM-driven timeline mapping, FFmpeg post-processing for cinematic overlays (zoom & cursor), 
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
**[🛑 STOP AND READ - ABSOLUTELY CRITICAL]**
Before doing anything else, you MUST manually report the `workspace_init` phase via the `job-cli`. If you forget this, the frontend progress bar will break.
```bash
bun apps/job-cli/src/index.ts phase --job-id $JOB_ID --phase workspace_init --status running
```
The `references/` directory contains the template files. 

Before creating the config, the AI Agent MUST create a dedicated folder for the demo in the project root's `demos/` directory (e.g., `demos/shadcn-demo/`).

**CRITICAL RULE ON FILES:** You MUST NEVER run or modify the scripts directly from the `.opencode/` directory. The `.opencode` versions are the immutable templates. 
The agent MUST copy ONLY the TypeScript files and assets (the `src/`  and assets/ directory) from the `references/` folder into the new `demos/<demo-name>/` folder. Do NOT copy `package.json` or any other dependency files. All dependencies are already globally installed, so you do NOT need to install them.

From there, the AI should:
1. Create and modify the `demo-config.json` inside the `demos/<demo-name>` folder.
2. Modify any of the underlying TypeScript code (`src/`) if the specific demo requires custom logic or tweaks to make the right kind of demo. Remember, you must ONLY edit the copies located inside the `demos/` folder.
3. NEVER run `npm install` or `bun install`.
4. **Handling Errors/Resuming:** If an error occurs during ANY phase of execution (Phase 0, 1, 2, 3, or 4) and you need to retry, you MUST NOT blindly redo the entire pipeline from scratch. You must manually edit the `src/index.ts` file in the generated demo folder and comment out EVERY pass that has already successfully completed before running the script again. 
   - If `pass0` succeeded but `pass1` failed, comment out `// await pass0(...)` and fix `pass1`.
   - If `pass1` succeeded but `pass2` failed, comment out `// await pass0(...)` AND `// await pass1(...)`.
   - If `pass2` succeeded but `pass3` failed, comment out `pass0`, `pass1`, and `pass2`.
   This ensures we never waste time or API costs regenerating the cinematic intro (`pass0`), validating selectors (`pass1`), or generating voiceovers (`pass2`) if they are already done.
   **Note on Progress Reporting:** The modified `src/index.ts` engine is smart enough to automatically backfill and "tick" (mark as completed) all prior phases in the UI if you resume from a later phase. For example, if you resume at `video_recording`, the engine will automatically report `voiceover_generation`, `flow_validation`, etc., as completed so the frontend UI stays perfectly synced.

5. **Handling Blockers/Popups:** If a login popup, cookie banner, or newsletter overlay blocks the automation during execution, the AI Agent must proactively patch `pass1-dry-run.ts` and `pass3-cinematic-record.ts` to include a dynamic `try/catch` block that locates and clicks the dismiss button (e.g. `✕`) after `page.goto()`.

### Phase 0.2 — Selector Collection via Agent Browser (Prerequisite)

**[🛑 STOP AND READ - ABSOLUTELY CRITICAL]**
Before starting selector collection, you MUST manually report the `selector_collection` phase via the `job-cli`.
```bash
bun apps/job-cli/src/index.ts phase --job-id $JOB_ID --phase selector_collection --status running
```

Before generating `demo-config.json`, the AI Agent MUST use the `agent-browser` skill to navigate the target website and interact with the elements. 

**CRITICAL:** This step is crucial for discovering precise, reliable DOM selectors required for the actions. Snapshots and internal framework IDs will change between sessions. You must collect highly stable semantic selectors (e.g., specific text contents, stable CSS classes, or ARIA roles). If we run the same automation script on a fresh session, it shouldn't break. Always keep selector stability in mind.

**MANDATORY — Logo Download:**  While the agent-browser is already on the website, it MUST find and download the website's primary logo file and save it into `demos/<demo-name>/assets/icons/`. The logo can be in any format (`.svg`, `.png`, `.webp`, `.jpg`, `.ico`). Prefer the highest-resolution or vector (`.svg`) version available. Look in the header/navigation area first, then check `<link rel="apple-touch-icon">` as a fallback. If you find a URL to an SVG or PNG logo, download it via `fetch()` or copy its source and save it to the `assets/icons/` folder. This is REQUIRED for the cinematic intro to work in Phase 0.5.

Once the agent has successfully verified and collected all the necessary stable working selectors, it will dynamically generate the `demo-config.json` file inside the new demo folder.

**Note on Scrolling:** During the video recording phase, the engine automatically checks if the element is in the viewport. It will ONLY scroll the component into the viewport if it is not already visible. If it is in the viewport, it won't scroll. This ensures a clean cinematic experience.

### Phase 0.5 — Cinematic Intro Sequence (V4.6)
Before running the validation or generation passes, `pass0-intro.ts` automatically generates a 3.5-second premium intro card.
*   **Logo Source:** Reads the logo file directly from `assets/icons/` (placed there by agent-browser in Phase 0.2). Supports `.svg`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.avif`, `.gif`, `.ico`. Prefers SVG (infinite resolution) over raster formats.
*   **Adaptive Background:** Analyzes the logo's non-transparent pixels using canvas pixel math. Dark logo → white `#FFFFFF` background. Light logo → deep `#0A0A0A` background. Can be forced via `introBg: 'white' | 'black'` in `demo-config.json`.
*   **Cinematic Animation:** Renders an HTML page via Playwright `recordVideo` featuring an Apple-style staggered slide-in (cubic-bezier easing): logo blooms in → divider draws down → company name slides in from left. Font: `Inter Bold 700`, 72px, -0.03em tracking.
*   **Thumbnail Capture:** At ~1.5s into the animation (when logo + name are fully visible), a JPEG screenshot is saved as `thumbnail.jpg` in the demo directory and its path written to `thumbnail-path.txt`. The `references/src/index.ts` pipeline immediately uploads this via `job-cli thumbnail` so the dashboard shows the branded preview while the rest of the pipeline is still running.
*   **Stitching:** The generated `intro.webm` is seamlessly concatenated at the very end of Phase 4 into the final `.mp4` via FFmpeg's `concat` filter.

### Phase 1 — Flow Validation (Playwright Dry Run)
The generic engine loops through `demoSteps`. For every step with a selector, it waits for the element and performs the action (`click` or `fill`). This ensures all selectors are valid and the sequence doesn't get stuck before we spend money on LLM/TTS generation.

### Phase 2 — Voiceover Generation & Transcription
Use `gemini-3.1-flash-tts-preview` (or fallback to `gemini-2.5-flash` if unavailable) to generate the `.wav` narration (default voice: `Puck`).
Use `gemini-2.5-flash` to transcribe that `.wav` into a JSON array containing `word`, `startMs`, and `endMs`.

### Phase 2.5 — LLM-Driven Timeline Mapping
Pass the raw transcription and the `demoSteps` descriptions to an LLM (`gemini-2.5-flash`). The LLM semantically maps the steps to exact timestamps in seconds. Save this to `timeline.json`. 

### Phase 3 — Raw Video Recording & JIT Tracking
Run the final Playwright instance with `recordVideo` enabled (1920x1080).
*   **Pure Browser Context:** No CSS or DOM hacks are injected! The browser remains exactly as it naturally is.
*   **Generic Execution Loop:** The engine loops through `demoSteps` again. For each step, it looks up the timestamp in `timeline.json`. 
*   **JIT Coordinates:** It waits until `T - 0.5s`, waits for the element to be visible, dynamically grabs `locator.boundingBox()`, and logs the target coordinates into a tracking array. At exact time `T`, it performs the real Playwright `click()` or `pressSequentially()`. All coordinate data is exported to `tracking.json`.

### Phase 4 — FFmpeg Post-Processing (Cinematic Overlay, Zoom & AV Sync) — V4.5
Multiplex the resulting `.webm` video from Playwright with the voiceover, typing, and click SFX.
*   **Smoothstep Easing (3t²−2t³):** All cursor movement and camera pan transitions use cubic hermite interpolation (zero velocity at start & end) for a natural, human-feeling mouse glide. Helper: `smoothstepExpr()` in `utils.ts`.
*   **Spring Zoom Overshoot:** On zoom-in, the camera overshoots to `1.22x` at 60% of the transition window then settles back to `1.20x`, giving an elastic spring feel. Implemented via `springOvershootExpr()` in `utils.ts`.
*   **Scroll-Tracking Camera Pan:** When `scrollIntoView` shifts the page by >20px, a synthetic `scroll` event is pushed to `tracking.json`. Phase 4 reads these to emit a smooth `panY` drift so the camera follows the page scroll naturally.
*   **Click Shrink Animation:** Each `click` event generates a natural cursor shrink-and-expand effect (scales down to 70% over 0.05s, expands back over 0.15s). This is evaluated dynamically using the `scale` filter applied directly to the cursor overlay element.
*   **Cursor Park & Fade:** During idle gaps >4s, the cursor gracefully fades out in place over 0.4s via dynamic alpha channel masking (`geq` filter), and fades back in 1s before the next interaction begins. All done as post-processing on top of the cursor overlay expressions.
1.  **A/V Sync (Playwright Offset):** Playwright's `recordVideo` doesn't start its internal clock until the first frame is painted. The engine forces a blank frame immediately to start the clock, calculates `initDurationMs` (the time it takes for the actual page to load), and offsets the voiceover and all SFX by this duration in FFmpeg (`adelay`) to perfectly sync real-time audio with the delayed video.
2.  **Drop infinite apad:** FFmpeg tends to hang if `apad` is left on all SFX mixing tracks indefinitely. The script now lets SFX end naturally.
3.  **Disable Normalization (`normalize=0`):** Without `apad` on the SFX, standard `amix` behavior would volume-jump the voiceover whenever an SFX stops. `normalize=0` prevents volume shifting!
4.  **End on Voiceover (`duration=first`):** Ensure the mix stops when the main padded voiceover stops.

## Reference Files

- **[`references/playwright-selector-gotchas.md`](references/playwright-selector-gotchas.md)** — Common selector mistakes that cause silent timeouts: `:has-text()` vs `>> text=`, `/`-in-class-names, href mismatches. **Read this before writing any `demo-config.json` selectors.**

## Reference Implementation
See the **perfected, generic pipeline modularized** in the `references/` directory. It acts as an automation engine that processes JSON steps rather than hardcoded Playwright scripts, making it infinitely reusable across any website.

## Phase Progress Reporting (MANDATORY)

**[🛑 DO NOT FORGET THIS]**
Every demo run MUST report phase progress in real time so the `/editor` page shows an accurate live progress widget to the user. The `references/src/index.ts` already handles this automatically via the `reportPhase()` helper. However, Phases 0.1 and 0.2 (workspace init and selector collection) happen **before** `index.ts` runs and MUST be reported manually by the agent. If you do not report them, the user will stare at a broken loading screen.

### Reporting Format
```bash
bun apps/job-cli/src/index.ts phase --job-id <JOB_ID> --phase <PHASE_KEY> --status <running|completed|failed>
```

### Phase Keys (in execution order)
| Phase Key | When to call |
|-----------|-------------|
| `workspace_init` | Before + after creating the `demos/<name>/` folder and copying `src/` files |
| `selector_collection` | Before + after agent-browser navigates and collects selectors |
| `intro_sequence` | Automatically handled by `references/src/index.ts` |
| `flow_validation` | Automatically handled by `references/src/index.ts` |
| `voiceover_generation` | Automatically handled by `references/src/index.ts` |
| `video_recording` | Automatically handled by `references/src/index.ts` |
| `ffmpeg_postprocessing` | Automatically handled by `references/src/index.ts` |

### Critical Rules
1. **FIRE-AND-FORGET**: If a phase report command fails, DO NOT stop the pipeline. Log the error and continue.
2. **Always report running THEN completed**: Never skip the `running` call — the frontend uses it to animate the current step.
3. **Set JOB_ID env var**: When running `bun run src/index.ts demo-config.json`, prepend `JOB_ID=<JOB_ID>` so the auto-reporting inside `index.ts` knows the job ID.
   ```bash
   JOB_ID=<JOB_ID> bun run src/index.ts demos/<name>/demo-config.json
   ```

### Minimal Example (Phases 0.1 + 0.2 that you report manually)
```bash
# Phase 0.1 — workspace init
bun apps/job-cli/src/index.ts phase --job-id $JOB_ID --phase workspace_init --status running
# ... create demo folder, copy src/ files ...
bun apps/job-cli/src/index.ts phase --job-id $JOB_ID --phase workspace_init --status completed

# Phase 0.2 — selector collection
bun apps/job-cli/src/index.ts phase --job-id $JOB_ID --phase selector_collection --status running
# ... run agent-browser, collect selectors, generate demo-config.json ...
bun apps/job-cli/src/index.ts phase --job-id $JOB_ID --phase selector_collection --status completed

# Run the main pipeline (auto-reports phases 0.5 → 4)
# NOTE: Ensure you set a high timeout (e.g., 900000ms / 15 minutes) if running this via a tool call,
# as FFmpeg post-processing is highly computationally intensive and can easily exceed 5 minutes.
JOB_ID=$JOB_ID bun run src/index.ts demos/<name>/demo-config.json
```

