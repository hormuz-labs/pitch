# SFX Design — sound as motion, not decoration

Read this with `audio-pipeline.md` (which owns VO, music and the final mix).
This file owns **sound effects**: what to play, exactly when, how loud, and how
often.

The library is large (900+ files) and only partly usable. **Never browse it
directly.** Everything usable is measured and classified in
`data/sfx-index.json` and queried through the `motion_sfx` tool.

```js
motion_sfx({ mode: "list" })                                   // the event vocabulary
motion_sfx({ mode: "query", event: "pop", max: 0.6 })          // candidates, measured
motion_sfx({ mode: "build", cues: "audio/sfx-cues.json", duration: 70.4 })
```

---

## 1. The prime rule: sound is evidence that something moved

A motion graphic without sound design reads as a slideshow with music over it.
The fix is not "more sounds" — it is **a sound for each real state change, and
silence everywhere else**.

Three questions per beat, in order:

1. **Did something change state?** (appeared, moved, landed, completed,
   incremented) → it earns a sound.
2. **Is it the beat's subject, or background?** Subject gets the sound.
   Background moving at the same time gets nothing — otherwise the mix turns to
   mush and nothing feels important.
3. **Is the VO speaking?** If yes, only micro-events (`tick`, `pop`, `click`,
   `type`) are allowed, and 6dB quieter. Impacts and risers wait for a gap.

A scene with one perfectly-placed sound beats a scene with six.

---

## 2. Event vocabulary

These names are the contract between the storyboard, the cue sheet, and the
manifest. Use them in `direction.md` and in the boundary ledger.

| Event | Sounds like | Use it for |
|---|---|---|
| `tick` | dry, tiny, no tail | counter digits rolling, progress steps, rapid list staggers |
| `pop` | short round transient | an icon/chip/card **appearing**, per-item stagger accents |
| `click` | mechanical, dry | the cursor pressing a real control |
| `type` | key clatter | typewriter text, prompt entry, terminal beats |
| `select` | soft confirm | option chosen, item selected, toggle flipped |
| `data` | digital, granular | agent "thinking", scanning, dashboard populating |
| `notify` | small bright ping | toast/badge arriving, status update |
| `chime` | tonal, decaying | gentle positive punctuation, brand grace note |
| `success` | resolved, warm | task complete, deploy green, generation finished |
| `camera` | shutter | snapshot beat, freeze-frame |
| `whoosh_soft` | light air | element travel, card slides, lateral pans |
| `whoosh_deep` | body + low end | **big/fast motion** — full-frame expansions, scene-scale camera moves |
| `reverse` | rising suck-in | pre-roll **into** a cut or reveal |
| `riser` | sustained build | tension into a hero reveal or stat slam |
| `impact` | transient + tail | logo lock-up, headline slam, hard chapter cut |
| `subdrop` | low weight | weighted scene change, under a cut |
| `glitch` | digital tear | scramble-text decode, error/edge beat |

**Standing preference: fast or large motion takes `whoosh_deep`, not
`whoosh_soft`.** Soft whooshes are for small elements travelling a short
distance. A tile that expands to fill the frame, a camera that flies across the
stage, a scene-scale slide — all `whoosh_deep`.

---

## 3. Sync law — the part everyone gets wrong

### 3a. Place the transient, not the file

Library clips carry digital silence before the sound starts. In this library
**218 of 323 clips do**, up to 2.2 seconds — and the core `impact-boom.mp3`
carries 410ms. Schedule such a file "at the beat" and the audience hears it
almost half a second late.

The manifest measures `onset` for every clip, and `sfx.mjs build` subtracts it
automatically. **This is why cues go through the tool and not through a
hand-written `adelay`.**

### 3b. Different events align differently

| Event class | What lands on the beat | Placement |
|---|---|---|
| `pop` `tick` `click` `select` `notify` | the transient | at the beat |
| `impact` `subdrop` | the transient | **exactly** on the landing frame |
| `whoosh_soft` `whoosh_deep` | the **peak** | starts *before* the beat (lead 0.12s / 0.22s) |
| `reverse` | the peak, at the cut | starts 0.30s before |
| `riser` | its end | start = beat − clip length |
| `glitch` | the transient | on the state change |

`sfx.mjs` applies the class lead by default; override per cue with `lead`.

### 3c. A cue lasts as long as its event, not as long as its file

Sustained sounds — typing, data chatter, long whooshes, risers — must be
trimmed to the length of the thing they describe. A keyboard clip that runs
8.7s under a 2.6s typing animation keeps clattering after the text has landed,
and it reads as sloppy immediately.

Set `dur` on the cue, measured in **audible seconds from the transient**, so it
matches the animation length you read off the timeline:

```json
{ "label": "s1-type", "t": 2.35, "event": "type", "dur": 2.6 }
```

`sfx.mjs` trims from the clip's own onset and applies a short fade-out
(`fadeOut` overrides it), so the cut is inaudible. It warns if `dur` is longer
than the clip actually has.

Rule of thumb: **any cue over ~1.5s needs an explicit `dur`** unless its natural
decay is the point (an impact tail, a chime ringing out). One-shot transients —
pop, tick, click — never need one.

### 3d. Motion and sound must agree on the easing

A whoosh under a `power4.out` move — fast start, long settle — should be a clip
whose energy also front-loads. Pairing a slow-swelling whoosh with a snappy
tween is the most common "it sounds off but I can't say why" failure. Query with
`--max` to keep travel sounds no longer than the tween they cover.

---

## 4. Levels

The SFX bus is built at these per-class targets (`sfx.mjs` normalizes each clip
from its measured LUFS, so a quiet and a hot source land at the same place):

| Class | Target |
|---|---|
| `tick` | −34 LUFS |
| `pop` `click` `type` `data` | −30 to −32 |
| `select` `notify` `chime` `camera` | −27 to −29 |
| `whoosh_soft` `reverse` `glitch` | −27 to −28 |
| `success` `riser` `whoosh_deep` | −24 to −26 |
| `impact` `subdrop` | −20 to −21 |

Against a VO at ≈−18dB mean, this keeps every micro-event audible but
subordinate, and lets impacts punctuate without ducking the voice.

**Verify after mixing, don't assume:** `motion_mix` does this
automatically — it extracts real VO windows and real music-only gaps, measures
both, and fails the build if the narration is not clearly above the bed.

---

## 5. Density budget — two tiers

"Can every small motion have some level of sound?" Yes — but only if you split
sound into two tiers and keep them strictly separate. Sounding everything *at
the same level* is precisely what makes a video read as a cheap template: with
no hierarchy, the ear stops believing any of it.

### Tier 1 — signature cues (loud, meaningful)

The moments the scene is **about**: the tile expanding, the counter landing, the
deploy going green, the logo locking up, a real chapter cut.

- **~6 per 30s.** `sfx.mjs build` warns past this. This budget is a gate.
- **One per scene**, occasionally two. These carry `impact`, `subdrop`,
  `whoosh_deep`, `riser`, `success`.

### Tier 2 — micro-texture (quiet, supporting)

Small state changes that benefit from a *presence* rather than an event: a chip
arriving, a row highlighting, a counter step, a toggle flipping.

- Allowed **freely, up to ~10–14 per 30s**, on top of Tier 1.
- **Only** `tick`, `pop`, `click`, `type`, `data`, and only at **≤ −30 LUFS**
  (the class defaults already sit here — do not raise them).
- **Vary the clip every time.** `varied` is on by default for exactly this;
  the same pop twice in a row reads as a stuck button, which is worse than
  silence.
- **≥ 0.12s apart.** Closer than that they smear into a single mushy noise
  instead of reading as distinct events.
- They must never trigger the ducker or compete with a VO word. If a micro cue
  is audible *as a sound* rather than felt as texture, it is too loud.

### Rules that hold across both tiers

- **Staggered groups count as one cue, not N.** Eight cards arriving get 3–4
  `pop`s across the stagger at falling volume, never eight at equal level.
- **Never sound every element of a group.** Sound the first, the last, and one
  in the middle; the ear fills in the rest.
- **Sound the subject, not the background.** If three things move at once, only
  the one the beat is about gets a sound.
- Silence is a tool. One deliberately silent scene makes the next impact land.

---

## 6. Recipes — motion → sound

Each is a cue-sheet fragment. `t` is the moment the *visual* event happens;
the tool handles onset and lead.

### Counter / number count-up
Tick per digit change is too busy above ~8 steps. Tick the first few, then let
it run, and resolve the landing.

```json
{ "label": "stat-ticks",  "t": 12.40, "event": "tick", "gainDb": -2 },
{ "label": "stat-ticks2", "t": 12.62, "event": "tick", "gainDb": -4 },
{ "label": "stat-ticks3", "t": 12.84, "event": "tick", "gainDb": -6 },
{ "label": "stat-land",   "t": 13.60, "event": "impact" }
```

### Text reveal (per-word / per-char stagger)
Do **not** sound every character. Sound the line, not the letters.

```json
{ "label": "headline-in",  "t": 4.20, "event": "whoosh_soft", "max": 0.9 },
{ "label": "headline-set", "t": 4.55, "event": "pop", "gainDb": -3 }
```

For a **scramble/decode** headline use `glitch` at the start and `select` at the
moment it resolves to real words.

For a **typewriter** beat use one `type` clip covering the typing span, then a
`click` on the return/submit.

### Icon / card / chip popping in
```json
{ "label": "chip1", "t": 8.10, "event": "pop" },
{ "label": "chip3", "t": 8.34, "event": "pop", "gainDb": -4 },
{ "label": "chip6", "t": 8.58, "event": "pop", "gainDb": -7 }
```
`varied` defaults on, so repeated `pop` cues pull *different* clips — identical
pops in a row sound like a stuck button.

### Tile / panel expanding to fill frame (large motion)
The signature two-layer move: travel + arrival.

```json
{ "label": "tile-expand", "t": 21.80, "event": "whoosh_deep" },
{ "label": "tile-land",   "t": 22.35, "event": "impact", "gainDb": -3 }
```

### Cursor click on a real control
```json
{ "label": "cta-click",   "t": 63.20, "event": "click" },
{ "label": "cta-confirm", "t": 63.45, "event": "success" }
```
Only where a `ui-frame` shot has a `cursor`. No cursor, no click sound.

### Scene cut with weight
```json
{ "label": "s4-cut", "t": 34.00, "event": "subdrop" }
```
Use on **2–3 boundaries per film at most** — the ones that are genuine chapter
changes. Every cut having a whoosh is the single clearest sign of template
sound design.

### Reveal preceded by a build
```json
{ "label": "hero-build",  "t": 2.90, "event": "riser" },
{ "label": "hero-reveal", "t": 2.90, "event": "impact" }
```
The riser is placed so it *ends* at 2.90 and the impact lands on it.

### Agent working / parallel processing
```json
{ "label": "agents-run",  "t": 40.10, "event": "data" },
{ "label": "task-done-1", "t": 42.30, "event": "notify", "gainDb": -3 },
{ "label": "task-done-2", "t": 43.05, "event": "success" }
```

---

## 7. Cue sheet format

`audio/sfx-cues.json` in the project folder:

```json
{
  "duration": 70.4,
  "defaults": { "gainDb": 0 },
  "cues": [
    { "label": "cold-open", "t": 0.80, "event": "whoosh_deep" },
    { "label": "logo-land", "t": 2.90, "event": "impact" },
    { "label": "pick-one",  "t": 9.20, "event": "click",
      "clip": "urfasteditor/450 cinematic sound effects/Clicks/Click_04.wav" }
  ]
}
```

Per-cue fields: `t` (required), `event` **or** `clip`, `dur` (audible seconds —
trim a sustained sound to its event), `fadeOut`, `gainDb` (offset in dB),
`lead` (override the class lead), `max` (cap clip length when auto-picking),
`targetLufs`, `align: "file"` (opt out of onset correction — rarely right),
`varied: false` (allow reusing a clip already used).

Cue times come from the shot start times (sum the `dur`s in `shots.js`, or
run `motion_cues` — hard cuts mean they agree) plus the in-shot offsets
each factory animates (see `engine/js/factories.js`: e.g. `stat-counter`
lands at ~`0.1 + min(2.2, D*0.55)`, a `ui-frame` cursor presses at
`cursor.at + 0.82`) — **not** from watching the draft and guessing.

---

## 8. Banned

- **Meme, game-rip, franchise, weapon, gore and bodily-function audio.** The
  indexer filters these out; never reach around it into the raw folders. They
  are wrong for a product film and not ours to license to a client.
- **A whoosh on every transition.** See §5.
- **Sounding every item of a stagger.**
- **Sounds under a VO sentence louder than −28 LUFS**, other than a deliberate
  chapter impact placed in a breath gap.
- **Looping/ambient beds in the SFX bus** — that is the music bed's job, and the
  indexer excludes drones and ambiences for this reason.
- **Hand-written `adelay` chains.** Use `sfx.mjs build`; it corrects onsets,
  reports what it placed, and fails loudly instead of silently dropping a cue.

---

## 9. Checklist (add to Checklist B before final render)

- [ ] Every state change that carries meaning has a sound; nothing else does
- [ ] Fast/large motion uses `whoosh_deep`; small travel uses `whoosh_soft`
- [ ] Cue times taken from the real shot starts (`motion_cues`, or the summed `dur`s) + the factory's in-shot offsets, not eyeballed
- [ ] `motion_sfx` build ran clean — no `⚠` density or placement warnings
- [ ] ≤ ~6 Tier-1 signature cues per 30s; each scene has one
- [ ] Tier-2 micro-texture stays ≤ −30 LUFS, ≥0.12s apart, varied clips
- [ ] Every sustained cue (>~1.5s) has a `dur` matching its animation
- [ ] Repeated events pull varied clips (no identical pop twice in a row)
- [ ] SFX bus measured 10–14dB under VO by extraction, not assumed
- [ ] At least one scene is deliberately silent
- [ ] `audio/sfx_bus.wav` extends ≥1.0s past `CONTENT_DURATION`
