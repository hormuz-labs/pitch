---
name: auto-demo-generator
description: >
  Creates autonomous, cinematic product demo videos from any website URL. Use this skill
  whenever the user wants to record a product demo, walkthrough video, tutorial screencast,
  or any automated "show me how to use X" video. Triggers on: "make a demo video", "record
  a walkthrough", "create a tutorial video", "automate a product demo", "screencast of X",
  "show how to use X", or any request to produce an MP4 of web interactions.
compatibility: "npm deps: @google/genai, mime, fluent-ffmpeg, ffmpeg-static, ffprobe-static, dotenv, playwright. Env: GEMINI_API_KEY (required), TRANSCRIPTION_SERVICE_URL (required)."
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
  "userId": "<clerk-user-id>",
  "steps": [
    { "id": "tSearchClick", "description": "Click the search bar", "action": "click", "selector": "button.search" },
    { "id": "tSearchType", "description": "Type 'accordion'", "action": "type", "selector": "input.search", "value": "accordion" },
    { "id": "tOutro", "description": "Conclude the demo", "action": "wait", "zoom": 1.0 }
  ]
}
```
*Note: `outputPath` MUST be a flat filename (e.g. `video.mp4`). The `zoom` property is optional — see the cinematography guide below.*

### 🎥 Zoom & Camera Cinematography Guide (CRITICAL)

The engine handles camera movement **automatically** — you do NOT need to compute zoom values for click/type steps. There are only a few rules to follow when authoring `demo-config.json`.

#### 1. Auto-zoom on click / type (default)
Zoom is calculated per-step from the element's bounding box at record time:
```
zoom = clamp(min(videoWidth × 0.5 / elemWidth, videoHeight × 0.5 / elemHeight), 1.0, 1.8)
```
The element fills ~50% of the viewport with surrounding context. **Do NOT set `zoom` on click/type steps.**

| Element | Approx. zoom |
|---|---|
| 40×20 icon | 1.8× (capped) |
| 200×30 text input | 1.8× (capped) |
| 300×80 button | 1.6× |
| 900×600 panel | 1.0× (wide) |

#### 2. Form chaining (consecutive `type` steps)
When a `type` step follows another `type` step, the engine **carries the previous zoom level forward** so the camera pans smoothly across form fields instead of bouncing in/out for each input. No config needed — just chain them:
```json
{ "id": "tName",  "action": "type", "selector": "#name",  "value": "John" },
{ "id": "tEmail", "action": "type", "selector": "#email", "value": "john@test.com" },
{ "id": "tAfter", "action": "wait", "zoom": 1.0 }
```
The first `type` zooms in; subsequent ones just pan to the next field at the same zoom; the `wait` zooms out.

#### 3. Pre-navigation transition (auto-detected for `<a>` / `href`)
When a `click` step's target is an `<a>` element (or has an `href`), the engine **auto-detects navigation** and injects a synthetic zoom-in → zoom-out pair centered on the click target, so the camera settles to 1.0× *before* the new page paints. The viewer sees a smooth settle rather than an abrupt cut at high zoom.

The transition timing is tuned for smoothness:
- **Zoom-in** peaks at 2.0s before the click (1.0s transition to 1.4−1.8×)
- **Zoom-out** starts 0.8s before the click (1.0s transition back to 1.0×)
- The 1.2s gap between offsets ensures the zoom-in fully completes before the zoom-out begins, avoiding overlapping abrupt transitions.

Override per-step with `"preNavigate": true | false` if auto-detection is wrong.

#### 4. Manual zoom-out on `wait` steps
Set `"zoom": 1.0` on every `wait` step that sits between interactions. This zooms the camera back out to full-page context. Without it, the camera stays at the previous action's zoom level.

#### 5. Camera pan tracking
The camera **always follows the cursor** — the viewport pans so the cursor stays roughly centered. No config needed.

#### Summary: when to set `zoom`
| Step | `zoom` value |
|---|---|
| `click` / `type` | ❌ Omit — auto-calculated |
| `wait` (between actions) | ✅ `1.0` |
| `wait` (initial landing / outro) | ✅ `1.0` |
| `preNavigate` override | Optional `true` / `false` on click steps |

**Execution:**
```bash
JOB_ID=$JOB_ID bun run src/index.ts demos/<demo-name>/demo-config.json
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

Before creating the config, the AI Agent MUST create a project folder for the demo in the project root's `demos/` directory (e.g., `demos/shadcn-demo/`).

**CRITICAL RULE ON FILES:** You MUST NEVER run or modify the scripts directly from the `.opencode/` directory. The `.opencode` versions are the immutable templates. 
The agent MUST copy the TypeScript files, the assets directory, and the templates directory (`src/`, `assets/`, and `templates/`) from the `references/` folder into the new `demos/<demo-name>/` folder. Do NOT copy `package.json` or any other dependency files. All dependencies are already globally installed, so you do NOT need to install them.

**MANDATORY COPY COMMAND:**
```bash
cp -r .opencode/skills/auto-demo-generator/references/src .opencode/skills/auto-demo-generator/references/assets .opencode/skills/auto-demo-generator/references/templates demos/<demo-name>/
```
*(If you forget the `assets/` directory, the engine will crash with a missing cursor SVG error! If you forget the `templates/` directory, the outro card generation will crash!)*

From there, the AI should:
1. Create and modify the `demo-config.json` inside the `demos/<demo-name>` folder.
2. Modify any of the underlying TypeScript code (`src/`) if the specific demo requires custom logic or tweaks to make the right kind of demo. Remember, you must ONLY edit the copies located inside the `demos/` folder.
3. NEVER run `npm install` or `bun install`.
4. **NEVER attempt to optimize or modify the FFmpeg post-processing logic (e.g., `pass4-ffmpeg.ts` or `utils.ts`) just because it is taking a long time. The cinematic effects (`zoompan`, `geq` overlay, etc.) are highly computationally intensive and it is completely normal for pass 6 to take over 5 minutes. Set a high tool timeout (`timeout: 900000`) and let it run.**
5. **Handling Errors/Resuming:** If an error occurs during ANY phase of execution (Phase 0, 1, 2, 3, or 4) and you need to retry, you MUST NOT blindly redo the entire pipeline from scratch. You must manually edit the `src/index.ts` file in the generated demo folder and comment out EVERY pass that has already successfully completed before running the script again. 
   - If `pass0` succeeded but `pass1` failed, comment out `// await pass0(...)` and fix `pass1`.
   - If `pass1` succeeded but `pass2` failed, comment out `// await pass0(...)` AND `// await pass1(...)`.
   - If `pass2` succeeded but `pass3` failed, comment out `pass0`, `pass1`, and `pass2`.
   This ensures we never waste time or API costs regenerating the cinematic intro (`pass0`), validating selectors (`pass1`), or generating voiceovers (`pass2`) if they are already done.
   **Note on Progress Reporting:** The modified `src/index.ts` engine is smart enough to automatically backfill and "tick" (mark as completed) all prior phases in the UI if you resume from a later phase. For example, if you resume at `video_recording`, the engine will automatically report `voiceover_generation`, `flow_validation`, etc., as completed so the frontend UI stays perfectly synced.

6. **Handling Blockers/Popups:** If a login popup, cookie banner, or newsletter overlay blocks the automation during execution, the AI Agent must proactively patch `pass1-dry-run.ts` and `pass3-record.ts` to dismiss it (e.g. locate and click the `✕` button) after `page.goto()`.

7. **Environment Variable & CloakBrowser Setup (CRITICAL):** Before running any pipeline pass, you MUST ensure the following:
    *   **All browser launches now go through CloakBrowser.** Every `chromium.launch()` in the reference scripts routes through `src/cloak-launcher.ts`, which resolves the bundled Chromium binary, applies stealth fingerprinting args, and supports both headless and headed modes. This is how we bypass Cloudflare Turnstile and similar bot-detection walls by default — no extra config required.
    *   **Humanized typing for `type` steps:** The `humanizedType()` function in `cloak-launcher.ts` uses CloakBrowser's `humanType()` from `cloakbrowser/human` to type character-by-character with realistic delays (60ms avg, 30ms spread), thinking pauses, and natural per-character key events. It's called from `pass3-record.ts` for all `type` steps. Click and scroll remain using standard Playwright methods — only typing is humanized.
    *   **`recordVideo` compatibility:** The `humanize: true` browser-level flag conflicts with Playwright's `recordVideo`. Instead, the engine uses the standard CloakBrowser launch (`chromium.launch(cloakLaunchOptions())`) and selectively applies human typing via `humanizedType()`. This keeps video recording stable while still producing natural-looking input on screen.
    *   **Install CloakBrowser once** (if not already present):
        ```bash
        bun add -g cloakbrowser
        ```
        Verify the binary is detected:
        ```bash
        cloakbrowser info
        # Binary: /Users/<you>/.cloakbrowser/chromium-<version>/Chromium.app/Contents/MacOS/Chromium
        ```
        The launcher tries (in order): `CLOAK_BROWSER_PATH` env var → `cloakbrowser info` output → `~/.cloakbrowser/chromium-*/Chromium.app/Contents/MacOS/Chromium`. Override with `CLOAK_BROWSER_PATH=/path/to/Chromium` if needed.
    *   **Stealth / fingerprint args** — read from `PLAYWRIGHT_CLI_ARGS` (comma-separated). The launcher always prepends `--fingerprint` and appends `--fingerprint-platform=macos` if not present. Add more via:
        ```bash
        export PLAYWRIGHT_CLI_ARGS="--no-sandbox,--fingerprint-platform=macos"
        ```
    *   **Headed vs. headless** — headless by default. Set `CLOAK_HEADED=1` to pop a visible window (useful for local debugging or for watching the Cloudflare interstitial clear in real time).
    *   **`CLOAK_PROFILE_DIR` env var is set** — If the job parameters include a `cloakProfileDir`, export it as `CLOAK_PROFILE_DIR` before invoking `src/index.ts`. This is required for pass1 and pass3 to restore cookies for authenticated sessions.
    *   **If `CLOAK_PROFILE_DIR` is NOT set** — the engine still works for anonymous/public flows. For authenticated sessions, you need to capture a profile first:
        ```bash
        mkdir -p ~/.cloak-profiles/<job-id>
        CLOAK_HEADED=1 bun run src/index.ts demos/<demo-name>/demo-config.json
        # Solve login / Turnstile manually in the visible CloakBrowser window, then Ctrl-C
        # Re-run with CLOAK_PROFILE_DIR exported to skip the manual step next time
        ```
        Then export: `export CLOAK_PROFILE_DIR=~/.cloak-profiles/<job-id>`
    *   **Cloudflare Turnstile / Anti-Bot Detection:** The bundled CloakBrowser Chromium already includes fingerprint randomization that bypasses most Turnstile and bot-detection challenges. If a specific site still blocks you, set `CLOAK_HEADED=1` and solve the challenge manually in the visible window — the resulting `storage_state.json` is reused on subsequent runs.

### Phase 0.2 — Selector Collection via Playwright CLI (Prerequisite)

**[🛑 STOP AND READ - ABSOLUTELY CRITICAL]**
Before starting selector collection, you MUST manually report the `selector_collection` phase via the `job-cli`.
```bash
bun apps/job-cli/src/index.ts phase --job-id $JOB_ID --phase selector_collection --status running
```

Before generating `demo-config.json`, the AI Agent MUST use the `playwright-cli` skill to navigate the target website and interact with the elements. 

**AUTHENTICATION REQUIREMENT:** If the job requires an authenticated flow, you MUST check for and load the user's specific `storage_state.json` file during your selector exploration phase. The file is located in the user's profile directory based on the `userId` in the `demo-config.json` (or job parameters).
The standard location is: `~/.cloak-profiles/user-<userId>/storage_state.json`.

**IMPORTANT:** This file might NOT exist (e.g., if it's a public demo or the user hasn't authenticated). Do NOT fail or crash if it's missing. Just check if it exists; if it does, load it. If it doesn't, proceed unauthenticated.

Furthermore, standard Playwright Chromium will get blocked by Cloudflare/Turnstile. You MUST force `playwright-cli` to use the CloakBrowser binary via the `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` environment variable.

**MANDATORY COMMANDS FOR EXPLORING AUTHENTICATED SITES:**
```bash
# 1. Point Playwright CLI to the stealth CloakBrowser binary
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(cloakbrowser info | awk '/Binary:/ {print $2}')

# 2. Check if state exists, and if so, load it into the CLI
STATE_FILE=~/.cloak-profiles/user-<userId>/storage_state.json
if [ -f "$STATE_FILE" ]; then playwright-cli state-load "$STATE_FILE"; else echo "No state found, proceeding unauthenticated"; fi

# 3. Open the target page (authenticated if state existed)
playwright-cli open https://example.com/dashboard
```

**CRITICAL:** This step is crucial for discovering precise, reliable DOM selectors required for the actions. Snapshots and internal framework IDs will change between sessions. You must collect highly stable semantic selectors (e.g., specific text contents, stable CSS classes, or ARIA roles). If we run the same automation script on a fresh session, it shouldn't break. Always keep selector stability in mind.

**SELECTOR SAFETY RULES — NEVER SKIP THESE:**
1. **Never guess attributes**: Do NOT guess inputs' placeholders, name tags, or IDs. Always execute `playwright-cli get attr @ref placeholder/name/id` first to get the exact strings. Labels do not always equal placeholders.
2. **Never mix Playwright operators (`>>`) inside CSS functional pseudo-classes**: Browser engine CSS engines do not support `>>` inside `:has(...)` or `:not(...)` and will crash.
   * *Wrong:* `div:has(h3 >> text='X')`
   * *Right:* `h3:has-text('X') >> xpath=../.. >> .class`
3. **Prefer tag-agnostic selectors for inputs**: A field looking like a standard text box may be built with a `<textarea>` or custom element. Use `[name='salary']` instead of `input[name='salary']` to be safe.
4. **Enforce aggressive, low timeouts (3 to 5 seconds) on custom/exploratory scripts**: Default 30-second delays heavily extend feedback loops on failure. Always set short timeouts (e.g., `{ timeout: 3000 }` on clicks/waits) in ad-hoc explorer files. Fail fast, adjust, and continue instantly.

**MANDATORY — Logo Download:**  While the playwright-cli is already on the website, it MUST find and download the website's primary logo file and save it into `demos/<demo-name>/assets/icons/`. **CRITICAL**: You MUST name the file starting with `logo.` (e.g., `logo.svg`, `logo.png`, `logo.webp`). Do NOT name it `company.png` or `favicon.ico`. The engine strictly looks for files matching `logo.*`. Prefer the highest-resolution or vector (`.svg`) version available. Look in the header/navigation area first, then check `<link rel="apple-touch-icon">` as a fallback. If you find a URL to an SVG or PNG logo, download it via `fetch()` or copy its source and save it to the `assets/icons/` folder. This is REQUIRED for the cinematic intro to work in Phase 0.5.

Once the agent has successfully verified and collected all the necessary stable working selectors, it will dynamically generate the `demo-config.json` file inside the new demo folder.

**Note on Scrolling:** During the video recording phase, the engine automatically checks if the element is in the viewport. It will ONLY scroll the component into the viewport if it is not already visible. If it is in the viewport, it won't scroll. This ensures a clean cinematic experience.

### Phase 0.5 — Cinematic Intro Sequence (V4.6)
Before running the validation or generation passes, `pass0-intro.ts` automatically generates a 3.5-second premium intro card.
*   **Logo Source:** Reads the logo file directly from `assets/icons/` (placed there by playwright-cli in Phase 0.2). Supports `.svg`, `.png`, `.webp`, `.jpg`, `.jpeg`, `.avif`, `.gif`, `.ico`. Prefers SVG (infinite resolution) over raster formats.
*   **Adaptive Background:** Analyzes the logo's non-transparent pixels using canvas pixel math. Dark logo → white `#FFFFFF` background. Light logo → deep `#0A0A0A` background. Can be forced via `introBg: 'white' | 'black'` in `demo-config.json`.
*   **Cinematic Animation:** Renders an HTML page via Playwright `recordVideo` featuring an Apple-style staggered slide-in (cubic-bezier easing): logo blooms in → divider draws down → company name slides in from left. Font: `Inter Bold 700`, 72px, -0.03em tracking.
*   **Thumbnail Capture:** At ~1.5s into the animation (when logo + name are fully visible), a JPEG screenshot is saved as `thumbnail.jpg` in the demo directory and its path written to `thumbnail-path.txt`. The `src/index.ts` pipeline immediately uploads this via `job-cli thumbnail` so the dashboard shows the branded preview while the rest of the pipeline is still running.
*   **Visual QA Verification (CRITICAL):**
    *   **Background/Font Color:** Always verify that the automatically selected background color and font colors are correct, readable, and visually appealing. If the logo has a transparent background, ensure the adaptive background algorithm chooses the correct theme (e.g., dark logo on white background, light logo on black background).
    *   **Override settings:** If the automatically selected background does not look good, manually set `"introBg": "black"` or `"introBg": "white"` and `"outroBg": "#0A0A0A"` in `demo-config.json` to override the defaults.
    *   **Outro Card Text Replacement:** Ensure the `{{THANKS_TEXT}}` and `{{URL}}` variables inside `templates/outro-card.html` are correctly replaced and do not render literally in the output video. Check the generated `outro.webm` file using visual QA or checking `pass0-outro.ts` logs.
*   **Stitching:** The generated `intro.webm` is seamlessly concatenated at the very end of Phase 4 into the final `.mp4` via FFmpeg's `concat` filter.

### Phase 1 — Flow Validation (Playwright Dry Run)
The generic engine loops through `demoSteps`. For every step with a selector, it waits for the element and performs the action (`click` or `fill`). This ensures all selectors are valid and the sequence doesn't get stuck before we spend money on LLM/TTS generation.

### Phase 2 — Voiceover Generation & Transcription
Use `gemini-3.1-flash-tts-preview` (or fallback to `gemini-2.5-flash` if unavailable) to generate the `.wav` narration (default voice: `Puck`).
The generated `.wav` is automatically transcribed into a JSON array (`timestamps.json`) via the local microservice defined in `TRANSCRIPTION_SERVICE_URL`. The engine appends `/transcribe` to the URL internally, so `TRANSCRIPTION_SERVICE_URL` should be just the base (e.g., `http://localhost:4000`), not including the path.

### Phase 2.5 — LLM-Driven Timeline Mapping
Pass the raw transcription and the `demoSteps` descriptions to an LLM (`gemini-2.5-flash`). The LLM semantically maps the steps to exact timestamps in seconds. Save this to `timeline.json`. 

### Phase 3 — Raw Video Recording & JIT Tracking
Run the final Playwright instance with `recordVideo` enabled (1920x1080).
*   **Humanized Typing:** For `type` steps, the engine calls `humanizedType()` which uses CloakBrowser's `humanType()` to type character-by-character with realistic delays (60ms avg, 30ms spread), thinking pauses, and natural per-character key events. The browser is launched via standard `chromium.launch(cloakLaunchOptions())` — `recordVideo` is incompatible with CloakBrowser's `humanize: true` flag, so only typing is humanized via the selective wrapper.
*   **Pure Browser Context:** No CSS or DOM hacks are injected! The browser remains exactly as it naturally is.
*   **Generic Execution Loop:** The engine loops through `demoSteps` again. For each step, it looks up the timestamp in `timeline.json`. 
*   **JIT Coordinates:** It waits until `T - 0.5s`, waits for the element to be visible, dynamically grabs `locator.boundingBox()`, and logs the target coordinates into a tracking array. At exact time `T`, it performs `click()` or `humanizedType()`. All coordinate data is exported to `tracking.json`.

### Phase 4 — FFmpeg Post-Processing (Cinematic Overlay, Zoom & AV Sync) — V4.5
Multiplex the resulting `.webm` video from Playwright with the voiceover, typing, and click SFX.
*   **Linear Camera Movement:** All zoom, pan, and cursor movement transitions are pure linear interpolation (constant velocity, no easing). Helper: `smoothstepExpr()` in `utils.ts`.
*   **Dynamic Auto-Zoom:** Zoom is computed per-step from the element's bounding box at record time — small elements get tighter zooms, large panels stay wide. No manual zoom levels needed for actions.
*   **Camera Pan Tracking:** The camera viewport automatically pans to keep the cursor centered on screen at all times.
*   **Scroll-Tracking Camera Pan:** When `scrollIntoView` shifts the page by >20px, a synthetic `scroll` event is pushed to `tracking.json`. Phase 4 reads these to emit a smooth `panY` drift so the camera follows the page scroll naturally.
* **Click Shrink Animation:** Each `click` and `type` event generates a natural cursor shrink-and-expand effect (scales down to 70% over 0.05s, expands back over 0.15s). Synthetic events (`__pre_nav_in`, `__pre_nav_out`, `__scroll`) are automatically skipped since they have no timeline entry — they inject camera transitions, not user interactions.
*   **Cursor Park & Fade:** During idle gaps >4s, the cursor gracefully fades out in place over 0.4s via dynamic alpha channel masking (`geq` filter), and fades back in 1s before the next interaction begins. All done as post-processing on top of the cursor overlay expressions.
1.  **A/V Sync (Playwright Offset):** Playwright's `recordVideo` doesn't start its internal clock until the first frame is painted. The engine forces a blank frame immediately to start the clock, calculates `initDurationMs` (the time it takes for the actual page to load), and offsets the voiceover and all SFX by this duration in FFmpeg (`adelay`) to perfectly sync real-time audio with the delayed video.
2.  **Drop infinite apad:** FFmpeg tends to hang if `apad` is left on all SFX mixing tracks indefinitely. The script now lets SFX end naturally.
3.  **Disable Normalization (`normalize=0`):** Without `apad` on the SFX, standard `amix` behavior would volume-jump the voiceover whenever an SFX stops. `normalize=0` prevents volume shifting!
4.  **End on Voiceover (`duration=first`):** Ensure the mix stops when the main padded voiceover stops.

## Reference Files — Playwright Selector Gotchas

**Read this before writing any `demo-config.json` selectors.** Common selector mistakes that cause silent timeouts:

**`:has-text()` is not standard CSS inside `:has()`** — Playwright combinators (`>>`) and custom pseudo-classes like `:has-text()` or `:text()` are handled by Playwright's engine. Passing them inside standard functional CSS pseudo-classes like `:has(...)` or `:not(...)` will cause syntax errors.
* Use Playwright's split `>>` operator instead, or use XPath relative axes:
```
❌ "div:has(h3 >> text='Test Nurse') >> .button"
❌ "div:has(h3:has-text('Test Nurse')) >> .button"
✅ "h3:has-text('Test Nurse') >> xpath=../.. >> .button"
✅ "button >> text='Return policy?'"
✅ "button:text('Return policy?')"
```

**Never guess element attributes (Email, Password, etc.)** — Always use `playwright-cli` (specifically `playwright-cli get attr <ref> placeholder/name/id`) to fetch exact attribute values before writing selectors. Labels and placeholders are frequently different from visual text (e.g. "Email" visually vs. placeholder="Enter your email or phone number").

**Prefer Tag-Agnostic Selectors for Inputs** — Avoid prepending `input` to attribute selectors like `input[name='benefits']`. Features looking like text fields might be implemented as `<textarea>` or custom elements. Omitting the tag name makes the selector robust:
```
❌ "input[name='benefits']"
✅ "[name='benefits']"
```

**Verify hrefs with playwright-cli** — sites redirect URLs (e.g. `/docs/components/command` → `/docs/components/radix/command`). Always confirm the exact `href` value before using `a[href='...']`.

**Avoid class names with `/`** — Tailwind classes like `group/accordion-trigger` are invalid CSS selectors. Use a structural parent (`h3 button`) or ARIA role instead.

**Never assume `type="submit"` on search/form buttons** — Many sites (including Wikipedia, GitHub, and others using web components or custom design systems) render their submit buttons **without** a `type="submit"` attribute. Using `button[type='submit']` as a selector will silently timeout even though the button is clearly visible. Instead:
* Always inspect the button's actual HTML with `playwright-cli eval` before writing the selector.
* Use class-based or text-based selectors as a fallback:
```
❌ "button[type='submit'].cdx-search-input__end-button"   ← breaks on Wikipedia & similar
✅ "button.cdx-search-input__end-button"                  ← class-only, no type assumption
✅ "#searchform button"                                    ← parent-scoped, robust
✅ "button >> text='Search'"                              ← text-based, universal
```
* For **autocomplete/typeahead flows**, prefer clicking the first suggestion over submitting the form — it's more cinematic and avoids the `type` attribute problem entirely:
```
✅ "[role='option']:first-of-type"    ← clicks the first autocomplete suggestion
```

**⏱️ Fail Fast: Use Aggressive Timeouts for Exploration & Scraping**
By default, Playwright waits **30 seconds** (`30000ms`) for elements before throwing an error. When writing custom scripts or performing live explorations (e.g., `explore.ts`), waiting 30 seconds for a missing element severely slows down the agent's feedback loop and costs valuable reasoning time.
* **The Rule**: Always set a short, aggressive timeout (e.g., **3 to 5 seconds**) on wait and action methods when writing ad-hoc scripts. If the element is not there, let the script crash immediately so you can self-correct instantly.
* **How to implement**:
  ```typescript
  // BAD: Stalls the agent for 30 seconds on failure
  await page.click('text="Test Nurse"'); 
  
  // GOOD: Fails in 3 seconds, triggering immediate correction
  await page.click('text="Test Nurse"', { timeout: 3000 }); 
  
  // GOOD: Short wait before acting
  await page.waitForSelector('text="Test Nurse"', { timeout: 3000 });
  ```

| Intent | Selector |
|---|---|
| Button by text | `button >> text='Submit'` |
| Tab by label | `[role='tablist'] [role='tab'] >> text='Analytics'` |
| Input by placeholder | `[placeholder='Search...']` |
| Link by text | `a >> text='Command'` |
| Search button (no type attr) | `#searchform button` or `button.search-end-button` |
| First autocomplete suggestion | `[role='option']:first-of-type` |

## Reference Implementation
See the **perfected, generic pipeline modularized** in the `references/` directory. It acts as an automation engine that processes JSON steps rather than hardcoded Playwright scripts, making it infinitely reusable across any website.

## Phase Progress Reporting (MANDATORY)

**[🛑 DO NOT FORGET THIS]**
Every demo run MUST report phase progress in real time so the `/editor` page shows an accurate live progress widget to the user. The `src/index.ts` pipeline already handles this automatically via the `reportPhase()` helper. However, Phases 0.1 and 0.2 (workspace init and selector collection) happen **before** `index.ts` runs and MUST be reported manually by the agent. If you do not report them, the user will stare at a broken loading screen.

### Reporting Format
```bash
bun apps/job-cli/src/index.ts phase --job-id <JOB_ID> --phase <PHASE_KEY> --status <running|completed|failed>
```

### Phase Keys (in execution order)
| Phase Key | When to call |
|-----------|-------------|
| `workspace_init` | Before + after creating the `demos/<name>/` folder and copying `src/` files |
| `selector_collection` | Before + after playwright-cli navigates and collects selectors |
| `intro_sequence` | Automatically handled by `src/index.ts` |
| `flow_validation` | Automatically handled by `src/index.ts` |
| `voiceover_generation` | Automatically handled by `src/index.ts` |
| `video_recording` | Automatically handled by `src/index.ts` |
| `ffmpeg_postprocessing` | Automatically handled by `src/index.ts` |

### Critical Rules
1. **Phase reporting is fail-fast**: If a phase report command fails, it will crash the pipeline. Ensure the job-cli is running and JOB_ID is correct.
2. **Always report running THEN completed**: Never skip the `running` call — the frontend uses it to animate the current step.
3. **Set JOB_ID env var**: When running `bun run src/index.ts demos/<name>/demo-config.json`, prepend `JOB_ID=<JOB_ID>` so the auto-reporting inside `index.ts` knows the job ID.
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
# ... run playwright-cli, collect selectors, generate demo-config.json ...
bun apps/job-cli/src/index.ts phase --job-id $JOB_ID --phase selector_collection --status completed

# Run the main pipeline (auto-reports phases 0.5 → 4)
# NOTE: Ensure you set a high timeout (e.g., 900000ms / 15 minutes) if running this via a tool call,
# as FFmpeg post-processing is highly computationally intensive and can easily exceed 5 minutes.
JOB_ID=$JOB_ID bun run src/index.ts demos/<name>/demo-config.json
```

## Error Tracking & Telegram Notifications (MANDATORY)

You must proactively track your errors and communicate them to the user via Telegram during and after the video generation process. The workspace contains a utility script specifically for this at `.opencode/skills/auto-demo-generator/references/scripts/notify.ts`.

### Rules
1. **3 Consecutive Errors (Blocker Alert):** Keep an internal count of how many consecutive attempts/fixes fail (e.g., failed selector lookups, build errors, FFmpeg crashes). You MUST strictly count the number of errors. If you hit **3 consecutive failures** on a single step/phase, you MUST send a Telegram message to alert the user of the blocker before continuing.
   ```bash
   bun run .opencode/skills/auto-demo-generator/references/scripts/notify.ts --message "🚨 Blocker Alert: 3 consecutive failures trying to resolve [Phase/Step Name]. Last error: [Brief error summary]"
   ```
2. **Post-Job Report (Success / Final State / Exhausted Limits):** Once the entire MP4 generation is successfully completed, OR if you give up after an excessive amount of retries, OR if you hit your internal system $4.00 budget limits/timeout limits, you MUST send a comprehensive final report to Telegram. Maintain a mental log of *everything* that went wrong along the way. This data is critical for improving the system. Even if you are forced to stop by the platform limits, you MUST fire off the notify script with the accumulated errors right before you stop.
   ```bash
   bun run .opencode/skills/auto-demo-generator/references/scripts/notify.ts --message "✅ Video Generation Complete for [Demo Name].
   
   ⚠️ Issues encountered during run:
   - [Phase X] Failed 2 times because selector 'Y' was flaky. Fixed by using 'Z'.
   - [Phase Y] FFmpeg crashed because... fixed by...
   
   (Include all relevant struggles to help improve the system)"
   ```


