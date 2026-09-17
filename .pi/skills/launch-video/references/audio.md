# Audio — bed, narration, SFX, mix

The tools carry their own parameters; this is the craft. Files live in
`audio/`: `music.mp3` (bed), `vo.txt` + `vo.wav` or `vo.mp3` (the one read),
`vo-words.json` (its word timeline), `sfx-cues.json` + `sfx_bus.wav`,
`mix.wav` (what the renderer muxes), and `mix-settings.json` (the successful
mix's levels, reused by automatic preview/export rebuilds).

## 1. The bed

The studio's music picker and `pitch motion find-audio` read the same curated
library; a bed the user picked is already in `audio/`. When no bed is already
selected and the user has not requested a specific soundtrack, run
`pitch motion find-audio --random`. It picks uniformly from the full library
and imports to `audio/music.<ext>`. Use that returned path, report the track ID
in the summary, and reuse it throughout edits and re-renders. Do not replace
the random draw with your own habitual favourite. Library filenames are opaque
IDs, not mood or genre labels. Respect an explicit user choice or uploaded bed.
When the brief calls for custom music, `pitch motion music` generates an
instrumental bed from the audio direction in `direction.md` — BPM, palette,
instruments, timed arrangement, exact length — never an artist or song by name.
Never scan personal directories.

## 2. Narration — one read, cut to words

The first films recorded one clip per shot and placed each at its shot's
start. Every clip restarted the voice's intonation and left 0.5–1.2s of dead
air; fourteen restarts in forty seconds is the "robotic" sound whatever the
voice. So: **the voice is recorded once, as one continuous read, and the
picture is cut to its words.**

- **Script first**, before the shot list is final. One paragraph at a human
  pace — 1.9–2.4 words/s, 60–70 words per 30s. Headlines on screen,
  sentences in the voice. Give every beat the words its picture needs (a 3s
  demo ≈ 6–7 words, or a written pause "…"). If the film drags, revisit the
  copy and visual timing while keeping the read natural.
- **One call.** `pitch motion tts --script audio/vo.txt --voice <v> --style <s>` with
  one delivery direction for the whole read; the arc (drawing-in → proud →
  inviting) lives in phrasing and punctuation. Over 2.45 words/s is rushed
  (the audit fails at 2.7) — re-record unhurried; under 1.6 drags. Which
  service reads it is the studio's setting, not yours: on Gemini `--voice`
  is a name (Aoede, Kore, Leda, Charon) and `--style` the direction; on
  ElevenLabs `--voice` is an id from `pitch motion voices` and delivery goes
  into the script as tags. The command prints the file it wrote; that path
  is what `audio.vo` and `pitch motion align --vo` take.
- **Time it.** `pitch motion align` transcribes the read locally and aligns the
  known script to it, so every word has an onset even where a brand name was
  misheard; under 60% matched means the wrong file or text.
- **Cue and sync.** `audio: { vo: "audio/vo.wav", voStart: 0.3 }` at the top
  of `shots.js`; `cue: "step two"` on every shot, and on beats, `word-build`
  lines and `more` items that should land on a word. `pitch motion sync` prints the
  plan; `{ write: true }` starts each cued shot ~0.12s before its word, fills
  `at` / `lineAt` / `moreAt`, retimes the SFX sheet and keeps
  `shots.js.bak`. Uncued shots share their interval proportionally; the last
  shot extends if the read outruns the picture. Re-run align + sync after
  ANY change to script or cues. A beat the audit calls compressed > 1.6×
  gets more words, never a padded shot.
- Delete every per-shot `vo` / `voDur`: more than one clip is "fragmented
  narration" and fails the audit.

## 3. SFX — sound is evidence that something moved

Choose whether the film needs detailed effects, a few material sounds, or
music alone. A state change is a possible cue, not an obligation. Per
beat: did something change state? is it the beat's subject (background
motion gets nothing)? is the voice speaking (then only micro-events, 6dB
quieter)? One perfectly placed sound beats six.

**Vocabulary** (`pitch motion sfx --mode list` is the source of truth):
`tick` counters/steps · `pop` an item appearing · `click` a real control ·
`type` typing · `select` a confirm · `data` scanning/populating · `notify` a
toast · `chime` grace note · `success` completion · `camera` snapshot ·
`whoosh_soft` small travel · `whoosh_deep` **big or fast motion** (a tile
filling the frame, a scene-scale move) · `reverse` suck-in before a cut ·
`riser` build into a reveal · `impact` slam / lock-up · `subdrop` weighted
cut · `glitch` scramble/error.

**Two tiers, strictly separate.** Tier 1 signature cues — the moment the
shot is *about*: `impact`, `subdrop`, `whoosh_deep`, `riser`, `success` —
**at most ~6 per 30s, one per shot** (the build warns past that). Tier 2 micro-
texture — `tick`, `pop`, `click`, `type`, `data` only, ≤ −30 LUFS, ≥ 0.12s
apart, varied clips (a repeated identical pop sounds like a stuck button) —
up to ~10–14 per 30s. A staggered group is 3–4 pops at falling gain, never
one per item. These are ceilings, not targets; leave room for silence.

**Sync law.** Library clips carry silence before the sound (206 of 308, up
to 2.25s); the manifest measures each onset and the build subtracts it —
which is why cues go through the tool, never a hand-written `adelay`.
Transients (`pop`, `click`, `impact`) land on the beat; whooshes peak on it
(lead 0.12s / 0.22s); `reverse` starts 0.30s before; a `riser` ends on it.
A sustained sound lasts as long as its event: any cue over 1.5s needs `dur`
(audible seconds from the transient) matching the animation. Pair a
front-loaded clip with a `power4.out` move; a slow-swelling whoosh under a
snappy tween is the classic "sounds off" failure.

**Cue sheet** `audio/sfx-cues.json`: `{ "duration", "defaults": { "gainDb" },
"cues": [{ "label", "t", "event" | "clip" | "file", "dur"?, "fadeOut"?, "gainDb"?,
"lead"?, "max"?, "varied"? }] }`. A riser's `t` is its **end/payoff**, and
`dur` is its approach (defaults to at most 1.5s). For a reveal at 51.8s, use
`{ "t": 51.8, "event": "riser", "dur": 1.2, … }`; do not put the start in
`t`. Other sustained clips without `dur` fail before replacing the bus.
A `file` is a sound the manifest lacks and
`pitch motion sound` generated into `audio/generated-sfx/` — one event per
call, named by its transient and material; it still needs its `event` class
so the build knows its tier. `t` is the moment the visual event happens:
the real shot start (`pitch motion cues`) plus the factory's in-shot offset (a
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

## 4. The mix — `pitch motion mix` only

Never hand-roll it (there is no ffmpeg in your shell anyway). The tool
builds in stages and **verifies by extraction**, failing if the voice is not
clearly above the bed.

| | Narrated | Music-only |
|---|---|---|
| VO stem | compressed, limited, ~−18dB mean | — |
| Bed (`bed_db`) | −13dB → ≈ −27dB mean | −10dB → ≈ −24dB |
| Ducking | bounded sidechain: `duck` maximum 3dB continuous, 9dB otherwise; 0 disables | no automatic SFX sidechain |
| SFX trim (`sfx_db`) | 0dB | −3dB; music leads |
| Gate | voice ≥ 10dB above music-only gaps; SFX headroom | bed and mix mean ≥ −30dB; local SFX RMS ≤ bed, peaks ≤ bed + 6dB |
| Peaks / length | `alimiter` 0.95, never `loudnorm`; ≥ 1s past `__DURATION()` | same |

SFX are staged by both LUFS and peak headroom (signature peaks ≤ −9dBFS,
micro-texture ≤ −18dBFS before the mix trim). Float intermediates preserve
transients until the final limiter; raising a quiet impact by its LUFS alone
can clip its attack. Do not add a blanket boost in a music-only film.

The music-only gate compares overlapping **400ms windows every 100ms**,
ignoring silent/fading music entrances and exits. It reports every affected
range and an absolute `--sfx-db` value for a global correction. Either apply
that trim and re-mix, or fix all named cues' `gainDb` together, rebuild SFX
once, and mix. Do not subtract the suggested reduction from zero: it is a
further reduction from the current trim. Do not raise music just to mask an
oversized hit. Source files keep
their original loudness, so compare actual stems, not the nominal gain knobs.

**Scheduled breaths are musical automation, not speech ducking.** A `breath`
beat defaults to `depth: 0.35` (about −3.7dB), `dur: 0.45`, `attack: 0.15`,
`release: 0.3`. Place the hold through the payoff, then release smoothly; avoid
a deep dip that snaps back just before the impact. Explicit depths remain
creative choices. Overlaps take the deeper dip instead of multiplying.
`no_breaths: true` disables these dips; `false` re-enables them. Adjusting
`duck` changes only the narration sidechain, not these beats or the SFX.

`pitch motion check` already exports `audio/cues.json`. After a level-only
edit, run **only** `pitch motion mix`; after changing cue durations/placements,
rebuild SFX then mix. Neither needs a visual audit. Breath-only edits are read
from the current shots against the compiled labels by the mixer.

"The music is missing" → raise `bed_db` (e.g. −10) and re-run. A failing
gate means re-mix, never render. The renderer and the Export button mux
`audio/mix.wav` automatically.

The studio preview uses that same mix automatically. After a passing mix and
picture review, finish; no HTML audio wiring, extra schema lookup or visual
check is needed.
