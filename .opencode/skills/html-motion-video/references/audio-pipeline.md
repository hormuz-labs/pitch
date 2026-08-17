# Audio Pipeline — Voiceover, Music, SFX via Gemini + FFmpeg Mixdown

All generation requires `GEMINI_API_KEY` in the environment (user-provided).
Check `test -n "$GEMINI_API_KEY"` first; if unset, ask the user to export it.
**Never** print, log, commit, or embed the key anywhere (including generated HTML).

Target layout:

```
audio/
├── vo_<label>.wav     # one voiceover clip per scene label
├── music.wav          # full-length instrumental bed
├── sfx/               # copies of the assets/sfx/ files this video uses (see §3)
├── cues.json          # [{label, time}] exported from the page's __CUES()
└── mix.wav            # final mixed track (muxed into the MP4)
```

---

## 1. Voiceover — Gemini TTS (`scripts/tts.mjs`) — GENERATED FIRST

VO is generated **before any scenes are built** (SKILL.md Phase 3): write the
storyboard copy, generate every clip with a scene-specific `--style`, measure
the printed durations, and derive scene durations from them
(`scene_duration = vo_duration + 1.2s` air, min 2.5s) into `js/timing.js`.
Scenes are then built to fit the audio — never the other way around.

The script auto-finds `GEMINI_API_KEY` in the environment or the nearest
`.env` walking up from the CWD (the repo root has one).

Generate **one clip per scene**, named by timeline label, so each can be placed
exactly and re-generated individually after copy edits:

```bash
node scripts/tts.mjs --voice=Aoede \
  --style="alluring, confident, sleek, captivating female product-launch narrator, medium-slow pace" \
  --text="Meet the Digital Dirham. Money, reimagined." \
  --out=audio/vo_hero.wav
```

Voice selection is part of the **audio persona** decided in `direction.md`
(see creative-direction.md Axis 8). Default to a female voice unless the brand
or user suggests otherwise, and match the *delivery register* to the brand:

| Brand persona | Voice | Style prompt add-ons |
|---|---|---|
| Sleek tech launch | Aoede or Kore | "alluring, confident, sleek, captivating narrator" |
| Premium / luxury | Kore or Leda | "warm, measured, intimate, unhurried" |
| Upbeat consumer / creator | Aoede or Callisto | "energetic, charming, smiling, bright" |
| Dev tools / technical | Kore | "dry, precise, matter-of-fact, quietly confident" |
| Fintech / enterprise trust | Kore or Leda | "warm, credible, steady, professional" |
| Male (if brand/user calls for it) | Charon or Fenrir | "measured, authoritative" |

Then vary the per-scene style string across the arc (hook = drawing-in,
reveal = proud, CTA = inviting) — never one style for all clips.

Rules:
- The **style instruction is half the quality** — always describe pace, emotion,
  and register in `--style` (the script prepends it as a spoken-style
  direction the model interprets without reading aloud). You can also inline
  direction in the text: "Say with a short pause before the product name: …".
- Note each clip's printed duration — it feeds `js/timing.js`. If a clip runs
  long, prefer tightening the copy over letting the scene balloon.
- Regenerate a clip until it sounds right before moving on; TTS output varies
  slightly between runs.
- `gemini-2.5-pro-preview-tts` = higher quality, slower/pricier — use for the
  final pass if the flash model sounds flat.

## 2. Background music — shared library FIRST, then Lyria

**Step 1 — check the curated shared library `assets/music/`.** Use only music
beds placed there intentionally (and SFX in `assets/sfx/`). Never scan home,
Downloads, or other personal directories. Pick the most plausible approved bed
— filenames containing "background"/"music"/a genre; ignore obvious SFX
(click, whoosh, pop, notification — those belong in §3). Copy it into the project
(`cp assets/music/<file>.mp3 audio/music.mp3`) and **name the chosen file when
presenting results** so the user can correct the pick.

**Step 2 — only if the curated library has nothing suitable**, generate
with Lyria or download a royalty-free bed matching the direction.md audio
persona.

Lyria RealTime streams instrumental music over a live WebSocket session via the
`@google/genai` SDK (`npm i @google/genai`). Minimal capture-to-file pattern:

```js
import { GoogleGenAI } from "@google/genai";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: "v1alpha" });
const chunks = [];
const session = await ai.live.music.connect({
  model: "models/lyria-realtime-exp",
  callbacks: { onmessage: (m) => {
    const d = m.serverContent?.audioChunks?.[0]?.data;
    if (d) chunks.push(Buffer.from(d, "base64"));
  }},
});
await session.setWeightedPrompts({ weightedPrompts: [
  { text: "minimal cinematic electronic, warm synth pads, soft pulse, modern tech launch, no drums first 8 bars", weight: 1.0 },
]});
await session.setMusicGenerationConfig({ musicGenerationConfig: { bpm: 110, temperature: 1.0 } });
await session.play();
await new Promise(r => setTimeout(r, (VIDEO_SECONDS + 10) * 1000)); // capture duration + pad
await session.stop();
// Lyria outputs raw 16-bit PCM, 48kHz, STEREO:
writeFileSync("audio/music.pcm", Buffer.concat(chunks));
execSync(`ffmpeg -y -f s16le -ar 48000 -ac 2 -i audio/music.pcm audio/music.wav`);
```

Prompt by vibe (instrumental only — never prompt for vocals):

| Vibe | Prompt |
|---|---|
| Enterprise/fintech | "minimal cinematic electronic, warm analog pads, subtle pulse, confident, 100–115 bpm" |
| Consumer app | "upbeat indie electronic, bright plucks, four-on-floor, optimistic, 118–124 bpm" |
| Dramatic reveal | "cinematic hybrid trailer, low strings, slow build, sparse percussion" |

Practical notes:
- Trim to length and cut on a musical phrase:
  `ffmpeg -i music.wav -ss 2 -t <video_dur> -af "afade=t=in:d=0.5" music_cut.wav`
  (skip the first ~2s while the model warms into the groove).
- Set `bpm` so a beat lands every 0.5s at 120bpm — then nudge scene durations
  to multiples of the beat for free audio-visual sync.
- **Fallback (never block on Lyria):** if the model is unavailable on the
  user's key/region, download a royalty-free bed (Pixabay Music, YouTube Audio
  Library) matching the same vibe description and continue.

## 3. Sound effects

Gemini has no dedicated SFX model, so use a small curated kit. **Check only the
curated `assets/sfx/` library first** (provenance in `assets/sfx/SOURCES.md`).
Never inspect personal directories. Fill gaps from Pixabay SFX / freesound.org
(CC0 filter; preview CDN MP3s are fine — trim, fade, and normalize to
≈ −14 LUFS / TP −2 with ffmpeg before adding):

| File | Used on | Cue |
|---|---|---|
| `whoosh.mp3` | scene transitions | at each scene label − 0.15s |
| `swoosh-soft.mp3` | gentle camera moves, calm transitions | with the move's midpoint |
| `riser.mp3` | build into the hero scene or product reveal | hero label − 1.5s (it's ~1.7s) |
| `impact-boom.mp3` | logo/hero landing, color-slam hook, hard chapter cut | exactly at the landing beat |
| `bubble-pop.mp3` | elements dropping into UI — icon drops, chip appearances, fantasy-drop landings | per landing; pitch-ladder (`asetrate` ±5–10%) when several land in sequence |
| `count-tick.mp3` | counters ticking up/down, rapid list/odometer steps | per step for the first 3–5 steps, then stop or thin to every 2nd–3rd step |
| `chime-ding.mp3` | success state, task complete, CTA accent | at the resolved frame |
| `universfield-new-notification-*.mp3` | notification-style moments | at the badge/toast appearance |
| `click.mp3` / `mouse-click.mp3` | cursor presses | at the squash frame |
| `typing.mp3` / `keyboard.mp3` | typing loops (keep low, −18dB or lower) | under typing only while keys land |
| `dragon-studio-pop-*.mp3` | generic pop alternative | interchangeable with bubble-pop |

Export cue times from the page itself (labels → seconds):

```bash
node -e '
import("playwright").then(async ({chromium}) => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto("file://" + process.cwd() + "/page.html");
  await p.waitForFunction("window.__READY === true");
  console.log(JSON.stringify(await p.evaluate("window.__CUES()"), null, 2));
  await b.close();
})' > audio/cues.json
```

**SFX choreography (studied from strong openers):** sound marks *events*, not
scenes. A drop sequence gets one pop per item, landing on the exact frame each
item settles; a counter gets ticks that track its cadence (and stop before the
final value, which gets silence or a single `chime-ding`); a hook word-slam
gets `impact-boom` on the color flip and nothing else nearby. Leave ≥ 0.15s
between SFX or they smear into noise.

Discipline: **max ~6 SFX per 30 seconds.** Skip the tick on most staggers;
over-SFX'd videos read as cheap template renders.

## 4. Mixdown — Step-by-Step with Intermediate Files (MANDATORY approach)

Single-pass mega `filter_complex` chains (sidechaincompress + multiple amix +
loudnorm in one command) have **silently failed** in practice — the music
attenuation didn't apply and nothing errored. Build intermediate files and
verify each by measurement instead.

**Target levels (measured means, not filter settings):**
- VO: dense **~−18dB mean** (compress + boost: `acompressor=threshold=-21dB:ratio=4:makeup=1.8,volume=+4dB`)
- Music bed: **~−28 to −30dB mean**. Commercial beds are hot masters (~−14dB
  mean), so attenuate by −16 to −18dB. Don't over-attenuate to −38dB — that
  sounds lifeless.
- Contrast: **12–15dB** between VO sections and music-only gaps.
- SFX: −10 to −14dB.
- **Never apply `loudnorm` to the final mix** — it normalizes the whole stream
  and pulls quiet music back up to voice level, destroying the contrast. Catch
  peaks with `alimiter=level=disabled:limit=0.95` instead.

### Step A: Unified full-length VO track (`audio/vo_full.wav`)
**Critical:** always set `dropout_transition=0` in `amix` — the default (2)
attenuates the remaining audio whenever a clip drops out.

```bash
ffmpeg -y \
  -i audio/vo_scene1.wav -i audio/vo_scene2.wav -i audio/vo_scene3.wav \
  -filter_complex "\
    [0:a]aresample=48000,aformat=channel_layouts=stereo,adelay=300|300[v0]; \
    [1:a]aresample=48000,aformat=channel_layouts=stereo,adelay=5300|5300[v1]; \
    [2:a]aresample=48000,aformat=channel_layouts=stereo,adelay=10800|10800[v2]; \
    [v0][v1][v2]amix=inputs=3:dropout_transition=0:normalize=0[vo_out]" \
  -map "[vo_out]" -ar 48000 audio/vo_full.wav
```

VO `adelay` = (scene label time + 0.3–0.5s) × 1000; verify no clip overlaps
the next (`clip_start + clip_duration + 0.3s < next_clip_start`). Mono inputs
need the delay per channel (`ms|ms`).

### Step B: Quiet music bed as its own file
`asetpts` resets timestamps after `atrim`. Trim to `CONTENT_DURATION + 1.5`
so the mix extends ≥ 1.0s past the video (capture muxes with `-shortest`; a
short mix truncates the video).

```bash
ffmpeg -y -i music.wav -af "aresample=48000,aformat=channel_layouts=stereo,atrim=0:<dur+1.5>,asetpts=PTS-STARTPTS,volume=-17dB" audio/music_bed.wav
```

### Step C: Mix bed + VO (+ SFX bus if used)

```bash
ffmpeg -y -i audio/music_bed.wav -i audio/vo_full.wav -filter_complex \
  "[1:a]acompressor=threshold=-21dB:ratio=4:makeup=1.8,volume=+4dB[vo]; \
   [0:a][vo]amix=inputs=2:dropout_transition=0:normalize=0, \
   afade=t=in:d=0.3,afade=t=out:st=<dur-1.5>:d=1.4,alimiter=level=disabled:limit=0.95[out]" \
  -map "[out]" -ar 48000 audio/mix.wav
```

SFX (whooshes/impacts) can be pre-mixed into their own bus with `adelay` +
`volume=-10dB..-14dB` and added as a third `amix` input.

### Step D: Verify by extraction (MANDATORY before rendering)
Windowed `-ss -t` volumedetect on the fly is unreliable — extract to files:

```bash
ffmpeg -y -i audio/mix.wav -ss <gap_t> -t 2 /tmp/gap.wav
ffmpeg -y -i audio/mix.wav -ss <vo_t>  -t 3 /tmp/vo.wav
ffmpeg -i /tmp/gap.wav -af volumedetect -f null -   # expect ~−30 to −35dB mean
ffmpeg -i /tmp/vo.wav  -af volumedetect -f null -   # expect ~−18 to −19dB mean (≥12dB above gap)
```

If gap and VO measure within a few dB of each other, the VO is masked —
re-mix before rendering.

### Muxing
`scripts/capture.mjs` auto-muxes `audio/mix.wav` from the CWD during render
(run it from inside the project folder). If muxing manually:

```bash
ffmpeg -y -i ../../renders/<project>-launch.mp4 -i audio/mix.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest ../../renders/<project>-final.mp4
```

**Verify sync:** watch the result — each VO line begins just after its scene's
visuals enter, music sits clearly under speech, and the last 1.5s is a clean
music fade with no orphaned SFX.
