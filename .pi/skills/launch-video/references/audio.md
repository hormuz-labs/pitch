# Audio — bed, narration, SFX, mix

The tools carry their own parameters; this is the craft. Files live in
`audio/`: `music.mp3` (bed), `vo.txt` + `vo.wav` (the one read),
`vo-words.json` (its word timeline), `sfx-cues.json` + `sfx_bus.wav`,
`mix.wav` (what the renderer muxes).

## 1. The bed

The studio's music picker and `motion_find_audio` read the same curated
library; a bed the user picked is already in `audio/`. Pick by the audio
persona (direction.md Axis 8) and name the file in your summary. The beat map
beside the beds (`musicTimestamp.json`) lists beat times and strengths —
nudge shot `dur`s so hard cuts land on strong beats. Never scan personal
directories; if nothing fits, ask the user to drop a bed into the picker.

## 2. Narration — one read, cut to words

The first films recorded one clip per shot and placed each at its shot's
start. Every clip restarted the voice's intonation and left 0.5–1.2s of dead
air; fourteen restarts in forty seconds is the "robotic" sound whatever the
voice. So: **the voice is recorded once, as one continuous read, and the
picture is cut to its words.**

- **Script first**, before the shot list is final. One paragraph at a human
  pace — 1.9–2.4 words/s, 60–70 words per 30s. Headlines on screen,
  sentences in the voice. Give every beat the words its picture needs (a 3s
  demo ≈ 6–7 words, or a written pause "…"); a punch word needs one. If the
  film feels slow, add a second act to the picture, never speed to the read.
- **One call.** `motion_tts({ script: "audio/vo.txt", voice, style })` with
  one delivery direction for the whole read; the arc (drawing-in → proud →
  inviting) lives in phrasing and punctuation. Over 2.45 words/s is rushed
  (the audit fails at 2.7) — re-record unhurried; under 1.6 drags.
- **Time it.** `motion_align` transcribes the read locally and aligns the
  known script to it, so every word has an onset even where a brand name was
  misheard; under 60% matched means the wrong file or text.
- **Cue and sync.** `audio: { vo: "audio/vo.wav", voStart: 0.3 }` at the top
  of `shots.js`; `cue: "step two"` on every shot, and on beats, `word-build`
  lines and `more` items that should land on a word. `motion_sync` prints the
  plan; `{ write: true }` starts each cued shot ~0.12s before its word, fills
  `at` / `lineAt` / `moreAt`, retimes the SFX sheet and keeps
  `shots.js.bak`. Uncued shots share their interval proportionally; the last
  shot extends if the read outruns the picture. Re-run align + sync after
  ANY change to script or cues. A beat the audit calls compressed > 1.6×
  gets more words, never a padded shot.
- Delete every per-shot `vo` / `voDur`: more than one clip is "fragmented
  narration" and fails the audit.

## 3. SFX — sound is evidence that something moved

A motion graphic without sound design reads as a slideshow with music. The
fix is a sound for each real state change and silence everywhere else. Per
beat: did something change state? is it the beat's subject (background
motion gets nothing)? is the voice speaking (then only micro-events, 6dB
quieter)? One perfectly placed sound beats six.

**Vocabulary** (`motion_sfx({ mode: "list" })` is the source of truth):
`tick` counters/steps · `pop` an item appearing · `click` a real control ·
`type` typing · `select` a confirm · `data` scanning/populating · `notify` a
toast · `chime` grace note · `success` completion · `camera` snapshot ·
`whoosh_soft` small travel · `whoosh_deep` **big or fast motion** (a tile
filling the frame, a scene-scale move) · `reverse` suck-in before a cut ·
`riser` build into a reveal · `impact` slam / lock-up · `subdrop` weighted
cut · `glitch` scramble/error.

**Two tiers, strictly separate.** Tier 1 signature cues — the moment the
shot is *about*: `impact`, `subdrop`, `whoosh_deep`, `riser`, `success` —
**~6 per 30s, one per shot** (the build warns past that). Tier 2 micro-
texture — `tick`, `pop`, `click`, `type`, `data` only, ≤ −30 LUFS, ≥ 0.12s
apart, varied clips (a repeated identical pop sounds like a stuck button) —
up to ~10–14 per 30s. A staggered group is 3–4 pops at falling gain, never
one per item. One shot is deliberately silent.

**Sync law.** Library clips carry silence before the sound (206 of 308, up
to 2.25s); the manifest measures each onset and the build subtracts it —
which is why cues go through the tool, never a hand-written `adelay`.
Transients (`pop`, `click`, `impact`) land on the beat; whooshes peak on it
(lead 0.12s / 0.22s); `reverse` starts 0.30s before; a `riser` ends on it.
A sustained sound lasts as long as its event: any cue over ~1.5s needs `dur`
(audible seconds from the transient) matching the animation. Pair a
front-loaded clip with a `power4.out` move; a slow-swelling whoosh under a
snappy tween is the classic "sounds off" failure.

**Cue sheet** `audio/sfx-cues.json`: `{ "duration", "defaults": { "gainDb" },
"cues": [{ "label", "t", "event" | "clip", "dur"?, "fadeOut"?, "gainDb"?,
"lead"?, "max"?, "varied"? }] }`. `t` is the moment the visual event happens:
the real shot start (`motion_cues`) plus the factory's in-shot offset (a
`stat-counter` lands at ~`0.1 + min(2.2, D*0.55)`; a `ui-frame` cursor
presses at `cursor.at + 0.82`) — never eyeballed from a draft.

Recipes: counter → 3 falling `tick`s then `impact` on the landing; text
reveal → one `whoosh_soft` + a `pop` on set, never per character; scramble →
`glitch` then `select` on resolve; tile expanding → `whoosh_deep` then
`impact −3dB`; cursor → `click` then `success`; weighted cut → `subdrop`
(2–3 per film at most — a whoosh on every cut is template sound design);
reveal → `riser` ending on the `impact`. Banned: meme/game/franchise audio
(the index filters it; never reach into the raw folders), sounding every
item of a stagger, anything under a sentence louder than −28 LUFS, ambient
loops in the SFX bus.

## 4. The mix — `motion_mix` only

Never hand-roll it (there is no ffmpeg in your shell anyway). The tool
builds in stages and **verifies by extraction**, failing if the voice is not
clearly above the bed.

| | Narrated | Music-only |
|---|---|---|
| VO stem | compressed, limited, ~−18dB mean | — |
| Bed (`bed_db`) | −13dB → ≈ −27dB mean | −10dB → ≈ −24dB |
| Ducking | sidechain, `duck` 9dB, gentle under a continuous read | none |
| SFX bus | 10–14dB under the voice | under the bed's peaks |
| Gate | voice ≥ 10dB above music-only gaps | mix mean ≥ −30dB |
| Peaks / length | `alimiter` 0.95, never `loudnorm`; ≥ 1s past `__DURATION()` | same |

"The music is missing" → raise `bed_db` (e.g. −10) and re-run. A failing
gate means re-mix, never render. The renderer and the Export button mux
`audio/mix.wav` automatically.
