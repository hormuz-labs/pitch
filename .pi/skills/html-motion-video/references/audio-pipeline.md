# Audio Pipeline — Bed, Narration, Mix

Sound effects have their own reference (`sfx-design.md`); this file owns the
music bed, optional narration, and the final mixdown. Every command runs from
inside the project folder.

Target layout:

```
audio/
├── music.mp3         # the chosen bed (or whatever the studio copied in)
├── vo.wav            # the ONE continuous narration read (optional)
├── vo.txt            # the exact script spoken (written by motion_tts)
├── vo-words.json     # word timeline of the read (motion_align)
├── sfx-cues.json     # cue sheet (see sfx-design.md)
├── sfx_bus.wav       # built by motion_sfx
└── mix.wav           # final track — the renderer muxes this
```

---

## 1. Music bed — the curated library first

**The studio's Music picker and the agent read the same folder:
`../../assets/music/`.** If the user picked a bed, it is already in `audio/`.
Otherwise:

```bash
ls -t ../../assets/music/*.mp3            # or motion_find_audio
cp "../../assets/music/<file>.mp3" audio/music.mp3
```

- Pick by the audio persona in `direction.md` (Axis 8). `musicTimestamp.json`
  next to the beds lists beat times and strengths — nudge shot `dur`s so hard
  cuts land on strong beats.
- Name the chosen file when you present results so the user can correct it.
- Never scan personal directories. Only if the library has nothing suitable,
  ask the user to drop a bed into the studio's picker (it imports files from
  their Downloads folder into the library).

## 2. Narration — a decision, not a default; then ONE read, cut to words

Narration is chosen in `direction.md` Axis 8. Kinetic 20–30s films are usually
stronger music-only with on-screen copy; demo-heavy or explanatory films earn
a voice.

**The rule that changed everything: the voice is recorded once, as one
continuous read, and the picture is cut to its words.** The first films did
the opposite — one TTS call per shot, placed at each shot's start. Every clip
restarted the voice's intonation from zero and left 0.5–1.2s of dead air
before the next one; fourteen restarts in 40 seconds is the "robotic" sound,
no matter how good the voice is. A single read keeps one breath and one arc,
and Gemini's prosody flows across sentences the way a human read does.

### 2.1 Write the script (before the shot list is final)

One paragraph, read at a **human pace: 1.9–2.4 words/s → 60–70 words for a
30s film**. Headlines on screen, sentences in the voice. Give every beat the
words its picture needs: a 3s product demo needs ~6–7 words spoken over it
(or a written pause — "…" — where the picture carries), a punch word needs
one. The voice never sprints: if the film feels slow, add a second act to
the picture, don't add speed to the read. Save it as `audio/vo.txt`.

### 2.2 Record it — one call

```js
motion_tts({ script: "audio/vo.txt", voice: "Aoede",
             style: "warm, confident, unhurried; natural conversational pace with a real breath between sentences; one continuous flowing read" })
// → audio/vo.wav (measured: ~36s, 80 words, ~2.2 words/s) + audio/vo.txt
```

- ONE delivery direction for the whole read. The arc (drawing-in → proud →
  inviting) lives in the copy's phrasing and punctuation.
- Voices: Aoede (bright), Kore (warm/precise), Leda (sleek), Charon (deep
  male). Models: `gemini-2.5-flash-preview-tts` (default — measured the most
  continuous: 4 breaths ≤ 0.35s in a 30s read), `gemini-3.1-flash-tts-preview`
  (more expressive, longer sentence breaks), `gemini-2.5-pro-preview-tts`.
- Over 2.45 words/s the read is rushed (the audit fails at 2.7) — re-record
  unhurried. Under 1.6 it drags — ask for a natural conversational pace.
- `GEMINI_API_KEY` is read from the environment or the repo `.env`
  automatically. Never print or embed it.

### 2.3 Time the words

```js
motion_align()      // audio/vo.wav + audio/vo.txt → audio/vo-words.json
```

Local whisper.cpp transcribes the read (≈3s for 30s of audio) and the known
script is aligned to it, so every script word gets an onset even where the
recogniser misheard a brand name. It prints the word timeline and the
breaths; under 60% matched fails (wrong file or wrong text).

### 2.4 Cue the picture and sync

```js
audio: { vo: "audio/vo.wav", voStart: 0.3 },        // shots.js, top level
{ id: "step2", type: "remix-photo", dur: 2.4, cue: "step two", … }
beats: [{ cue: "magic", kind: "flash" }]              // lands on the word
lines: [{ cue: "you want", parts: […] }, { cue: "editing", parts: […] }]
```

`motion_sync()` prints the plan; `motion_sync({ write: true })` retimes
`shots.js` so each cued shot starts ~0.12s before its word, fills beat `at`
/ `lineAt` / `moreAt`, re-times `audio/sfx-cues.json`, and keeps a
`shots.js.bak`. Shots between two cues share the interval proportionally;
the last shot is extended if the read would outrun the picture. Then
`motion_cues` → `motion_sfx` (rebuild) → `motion_mix` → `motion_audit`.

Re-run align + sync after ANY change to the script or a cue. If a shot gets
squeezed (the audit says a factory was compressed > 1.6×), give that beat
more words — never pad the shot.

Delete every per-shot `vo`/`voDur`. More than one is "fragmented
narration" and fails `motion_audit`.

## 3. Mixdown — the `motion_mix` tool only

**Do not hand-roll the mixdown** (the VM has no ffmpeg anyway). The tool
builds it step by step with intermediate files (single-pass `filter_complex`
chains have silently dropped the music attenuation before) and then *verifies
by extraction*, failing if the narration is not clearly above the bed.

```js
motion_mix({ duration: <__DURATION()>, music: "audio/music.mp3", sfx: "audio/sfx_bus.wav" })                    // narrated film
motion_mix({ duration: <__DURATION()>, music: "audio/music.mp3", sfx: "audio/sfx_bus.wav", music_only: true })  // music-only film
```

The read is placed once at `audio.voStart` (from `shots.js`), or per
`vo_map`. Under a continuous read the bed is ducked gently (~3dB) rather
than deeply — there is no gap for it to come back in — and the gate still
verifies the voice sits ≥10dB (typically ~20dB) above the bed under speech.

### What it does, and the numbers it uses

| Stage | Narrated film | Music-only film |
|---|---|---|
| VO stem | compressed, limited, ~−18 dB mean | — |
| Bed attenuation (`bed_db`) | **−13 dB** default → bed ≈ −27 dB mean | **−10 dB** default → bed ≈ −24 dB mean |
| Ducking | sidechain keyed off VO, attack 8 ms, release 320 ms (`duck`, default 9 dB) | none |
| Frequency carve | gentle dips at 800 Hz and 2.4 kHz in the bed | none |
| SFX bus | folded in 10–14 dB under the voice | folded in under the bed's peaks |
| Gate | VO windows ≥ **10 dB** above music-only gaps | mix mean ≥ −30 dB (bed audible) |
| Peaks | `alimiter=limit=0.95` — never `loudnorm` on the final mix | same |
| Length | ≥ 1.0 s past `__DURATION()` (the renderer muxes with `-shortest`) | same |

If a client says "the music is missing", raise `bed_db` (e.g. `-10`) and
re-run; the gate tells you which knob to turn. If it fails, re-mix — never
render a failing mix. The tool's report is the measurement; there is no
ffmpeg in your shell to second-guess it with.

## 4. Muxing

`capture.mjs` (and the studio's Export button) mux `audio/mix.wav` from the
project folder automatically on a full render. Watch the result once:
narration starts just after each shot's cut, the bed sits under it, the last
second is a clean fade with no orphaned SFX.
