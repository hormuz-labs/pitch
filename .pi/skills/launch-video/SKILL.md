---
name: launch-video
description: How the studio builds a product launch film: a shots.js shot list compiled by the shared GSAP engine, built progressively so the user watches it grow, with recon-measured brand, one continuous narration read the picture is cut to, and the motion_audit gate. Read this first whenever the user wants a launch video, promo, teaser, feature announcement or kinetic-typography film, then follow the html-motion-video skill.
---

# Launch films — the studio's shot-list agent

## Prime directives

1. Every video looks like the product's own design team made it. Brand from
   recon, not from defaults; logos are the product's own files. Two products
   → two unmistakable videos.
2. **Never a lazy frame.** Something new happens on screen at least every
   ~1.2s: words arriving one by one, a toast landing, a line swapping, the
   last element flying out as the next lands, a warm `ambient` stage
   drifting behind it all. Every shot is entrance → second act → exit.
   Six 5-second shots with one entrance each is a slideshow, not a film —
   `motion_audit` will fail it (8–16 shots, avg ≤ 3.4s, no quiet stretch
   > 1.5s, ≥ 0.7 events/s). Read `references/pacing.md` once.

## "Sixty seconds" means about a minute

A length the user names is a target, not a spec. 54s and 67s are both "a
60-second video", and nobody watching one counts. Never stretch a shot, pad the
tail, speed up the read or add a shot you do not believe in to hit the number —
the shot list and one continuous read at a human pace decide the duration, and
you report what it came out at. Same for "make it shorter": cut a shot, do not
compress eight of them.

## Preview-first, shot by shot

The studio plays your live `index.html` and **reloads it every time you save
`shots.js`** (and again when you finish a turn). The user watches the film
grow, so build progressively: as soon as the shot list exists, write
`index.html` and a `shots.js` holding `brand`, `ambient`, `motion` and the
first two or three shots — save it — then add shots in batches of two to
four, saving after each batch and confirming with `motion_check`. Never hold
the whole film back for one big write at the end. A `shots.js` that does not
evaluate is shown to the user as an error, so keep every save a complete
literal.

**Do not render an MP4** unless the user explicitly asks for one in chat; the
studio has its own Export button. Use `motion_render` with `from`/`to` only
to inspect one shot while polishing.

## Tools

All `motion_*` tools run in the workspace (render timeout 20 minutes).
Seek-and-capture only — never screencast, Remotion, React, or AI video.
Every one that needs a page drives the CloakBrowser over CDP; there is no
Chromium to install anywhere, and a tool that reports it cannot reach a browser
is a host problem to report, not one to work around.

- **`motion_recon`** — Phase 0: MEASURE the brand from the live DOM → `recon/brand-tokens.md`
  (+ `.json`): bg/ink/accent, :root variables, headline and body type, CTA
  styles, surfaces, saturated colors, page copy; self-hosts the brand's web
  fonts into `assets/fonts/` with a `brand.fonts` snippet. Run on the home
  page and a product page. Every hex and font in direction.md comes from here.
- **`motion_screenshot`** — Phase 0 reference screenshots from a live URL → `recon/screenshots/`.
- **`motion_harvest`** — the site's own logo, screens and photos → `assets/harvested/`.
- **`motion_find_audio`** — list the curated music library, or import a bed
  the user named. A bed picked in the studio is already in `audio/`.
- **`motion_tts`** — the WHOLE script as one continuous read → `audio/vo.wav`
  (+ `vo.txt`), only if direction.md chose narration. Never one clip per shot.
- **`motion_align`** — word timestamps for that read → `audio/vo-words.json`.
- **`motion_sync`** — cut the picture to the words: retimes shots and beats
  from their `cue` phrases (`write: true` edits shots.js + the SFX sheet).
- **`motion_check`** — seconds-fast compile check after every batch of shots:
  page errors, shot count, real duration, start times, factory overruns.
- **`motion_cues`** — real shot start times → `audio/cues.json`.
- **`motion_sfx`** — query the SFX vocabulary / candidates, build `audio/sfx_bus.wav`.
- **`motion_mix`** — final mixdown to `audio/mix.wav`, verified by extraction.
- **`motion_audit`** — the philosophy gate: per-shot events/s table and a
  scorecard (shot count, lengths, longest quiet stretch, determinism, logo,
  narration: one read, cued shots, drift — per-shot clips fail).
  Run after building or reshaping shots; fix the lowest-ev/s shot first.
- **`motion_render`** — one-shot checks (`from`/`to`); full MP4 only on request.
- **`motion_verify_duration`** — ffprobe vs `__DURATION()` after a full render.

## Workflow

1. **Recon.** `motion_recon` (measured tokens, fonts, copy), `motion_screenshot`
   for reference frames, `motion_harvest` for the logo and screens.
2. **Direction.** `references/creative-direction.md` → `direction.md` +
   Uniqueness Test.
3. **Shot list.** 8–16 shots, ~20–40s, types from `../../engine/schema.md`.
   Present direction + table, then keep going.
4. **Build, progressively.** Thin `index.html` loading `../../engine/` (all
   GSAP plugins); `shots.js` with `brand`, `ambient`, `motion.exit` and the
   first 2–3 shots — save, `motion_check` — then 2–4 shots per save until
   the list is complete, each with a second act (`beats`, `word-build`
   lines, `pile`, `more`, `cursor`/`focus`). Add `js/shots.custom.js` when a
   beat needs a type the engine lacks.
5. **Audio.** Music bed. If narrated: script → `motion_tts` once → set
   `audio.vo` → `motion_align` → `cue` every shot → `motion_sync` (write) →
   `motion_cues` → `motion_sfx` → `motion_mix` → `audio/mix.wav`, ≥ 1s past the timeline.
6. **Gate.** `motion_audit`; fix every ❌ (add events or cut shots — never
   lengthen). Quote the scorecard in your summary. Then stop — the preview
   reloads on its own.

## Discipline

- Measure colors and fonts from the site; measure the mix, never assume it.
- Headlines only. One idea per shot. Cut first. Narration is one read at a
  human pace (1.9–2.4 words/s) and the picture lands on its words — a shot is
  never sized to a sentence, a sentence is never recorded on its own, and the
  voice is never sped up to make the film feel busy. Energy is on screen.
- Never default to dark navy + glow orbs + glass + Inter without site evidence.
