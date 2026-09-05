# Known issues

Found during the 2026-09-05 pass (paths unified, per-turn tools, skills merged,
compose runs of a launch film and a deck). Not fixed yet; listed so nothing is
lost. Strike a line when it is done.

## Engine and tools

- **Built-in factories overrun short shots.** `type-field` animates for ~3.4–3.6s
  whatever `dur` is, so a 3s shot is compressed 1.13× and the audit warns on
  every film. The custom-factory rule ("time everything as fractions of D")
  is not applied by the engine's own factories (`engine/js/factories.js`).
  Same for `ui-frame`'s default cursor timeline (~3.7s).
- **`motion_audit` flagged `#cta` for a 4.2s load against a 4.0s threshold**
  in the first trypitch run — find that rule and document it in the audit
  output, or drop it; the agent had to guess what it meant.
- **`lib/browser.mjs` falls back to a local Chromium** when the manager is
  unreachable. On a developer laptop the manager answered
  `GET /api/profiles → 404` at `127.0.0.1:8080` (it works from inside compose),
  so local runs silently use Chromium. Either make the local manager URL work
  or make the fallback loud.
- **The deck scraper writes into the repo root** (`<repo>/pptx/…`, via
  `path.resolve(__dirname, '../../../../pptx')` in
  `.pi/skills/slide-deck/reference/scrape_images.js`) and `pdf_scrape_images`
  moves the results into the workspace afterwards. It should write to a
  scratch dir the tool hands it.
- **`templates/index.json`** in `.pi/skills/slide-deck/templates/` has no
  reader in `apps/` any more; confirm the web gallery does not fetch it and
  delete it, or point the API at it.

- **Low-contrast accent cards.** With the real palette applied, the trypitch
  e2e film's `color-punch` ("Meet Pitch.") and `logo-cta` end card render
  their text and mark faintly on the accent field — check the ink rule for
  `.shot[data-bg="accent"]` in `engine/css/shots.css` and the SVG fill the
  logo lockup inherits. `motion_review` shows it on sheet 1 and 3.
- **The trypitch e2e film fails its own audit on the real palette** (a 2.0s
  quiet stretch at the end card, 28.3→30.3s). It passed before only because
  its brand tokens were never applied; re-cut it or accept it as a fixture
  of the wrong colours.

## Agent behaviour (prompt / skill work)

- **Decks invent figures.** With no search tool the deck agent wrote
  "$4.2M ARR, +142% YoY, NPS 78" for a fictional company. Fine for a made-up
  brief, wrong for a real one. Either give the agent a grounded search tool
  or make the deck skill demand a "figures are illustrative" note when it
  has no source.
- **Aesthetic QA loops are open-ended.** The deck agent ran three
  scrape → build → read-all-renders rounds polishing a cover image. Consider
  a cap (two rounds unless a DOM-QA defect remains) in the skill.
- **Agents still investigate host failures** before reporting them (the
  first film read `align.mjs` and ran `ldd` from inside the sandbox). The
  one-line error from `motion_align` should curb it; watch the next run.
- **`motion_schema` DOM-class list** is parsed from `class="…"` in the
  factories' templates; classes set from JS (`classList.add`) are missed.

## Context and transcripts

- **pi stores every image a tool returns in the transcript and re-sends it.**
  One deck transcript reached 12MB of PNG base64. JPEG renders cut that ~6×;
  the real fix is pi-side (drop or thumbnail old image blocks on compaction).
- **Skills are still read whole.** `launch-video/SKILL.md` (10KB) plus
  `creative-direction.md` (9KB) and `audio.md` (7KB) go into context once per
  project; `effects-catalog.md` (34KB) was read whole once despite the
  warning. A `skill_section` tool, like `motion_schema`, would let the agent
  pull one section.

## Infrastructure

- **The base image fix (static `whisper-cli`) only reaches prod when CI
  rebuilds `pitch-base`** (`deploy.yml` builds it only when `Dockerfile.base`
  changes — it did, so the next deploy should; verify `whisper-cli --help`
  in the deployed container).
- **Only `ggml-base.en.bin` is installed** (`make whisper-model`); alignment
  matched 57/57 words with it, but a noisier read may want `small.en`.
- **`tests/studio-watch.test.ts` flakes under load** (two different cases,
  each ~4s, timing-based). Not touched.
- **Pre-existing unused imports** in `apps/api/src/lib/public-api.ts`,
  `apps/api/src/mcp/server.ts`, `apps/api/src/projects/service.ts` (biome
  warnings). Left alone because those files carry someone's in-flight work.
- **`docker-compose.yml` pins postgres to host port 5433**, which another
  project on this machine also used; the local `da-dev-pg` container had to be
  stopped. A `.override.yml` or a free default port would avoid that.
