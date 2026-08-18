# SFX Library Provenance

All files are cleared for use in renders. Sources and licenses:

| File | Use | Source | License |
|---|---|---|---|
| `bubble-pop.mp3` | elements dropping/landing in UI (icon drops, chip appearances) | [freesound 824189](https://freesound.org/people/5287430/sounds/824189/) (preview CDN, trimmed) | CC0 |
| `count-tick.mp3` | per-step ticks while numbers count up/down, rapid list staggers | [freesound 683048](https://freesound.org/people/13200806/sounds/683048/) (preview CDN) | CC0 |
| `riser.mp3` | 1.7s build into a hero scene or big reveal | [freesound 511861](https://freesound.org/people/8698658/sounds/511861/) (preview CDN, trimmed) | CC0 |
| `impact-boom.mp3` | logo/hero landing, hard chapter cut accent | [freesound 648729](https://freesound.org/people/8698658/sounds/648729/) (preview CDN, trimmed) | CC0 |
| `chime-ding.mp3` | success state, task complete, CTA accent | [freesound 571513](https://freesound.org/people/2226836/sounds/571513/) (preview CDN) | CC0 |
| `swoosh-soft.mp3` | soft camera moves / gentle transitions (calmer than `whoosh.mp3`) | [freesound 742833](https://freesound.org/people/5287430/sounds/742833/) (preview CDN, trimmed) | CC0 |
| `click.mp3`, `mouse-click.mp3` | cursor clicks | pre-existing library | — |
| `dragon-studio-pop-402324.mp3` | generic pop | pre-existing library (freesound 402324) | CC0 |
| `keyboard.mp3`, `typing.mp3` | typing loops | pre-existing library | — |
| `soundreality-whoosh-end-384629.mp3` | long whoosh tail | pre-existing library (freesound 384629) | CC0 |
| `universfield-new-notification-040-493469.mp3` | notification | pre-existing library (freesound 493469) | CC0 |
| `whoosh.mp3` | scene transitions | pre-existing library | — |
| `good night brothers.mp3` | ? (audit before use) | pre-existing library | — |

New files added 2026-08-15 were trimmed/faded and loudness-normalized
(≈ −14 LUFS, TP −2) with ffmpeg from the freesound preview MP3s above.

---

## Bulk library — `assets/1000+UR.FASTEDITOR SFX/`

Added 2026-08-18. A free SFX bundle from the UrFastEditor YouTube channel
(~938 files). **Do not use it directly.** It mixes genuinely good cinematic
material (whooshes, impacts, risers, subdrops, UI clicks) with ripped
game/anime/meme audio (Minecraft, Mario, Valorant, One Piece, TF2), weapon
foley, and novelty gags — none of which is ours to license to a client, and all
of which is wrong for a product film.

The usable subset is curated automatically:

- `.opencode/skills/html-motion-video/scripts/sfx-index.mjs` scans both this
  pack and `assets/sfx/`, measures every file (duration, **transient onset**,
  integrated loudness), classifies it into a motion-event class, and drops
  everything on the ban list.
- Output: `.opencode/skills/html-motion-video/references/sfx-index.json`
  — currently **310 clips across 17 event classes** out of 938 files.
- Query and mix through `scripts/sfx.mjs`; design rules in
  `references/sfx-design.md`.

### Known defect in this folder

`count-tick.mp3` measures **−70 LUFS** — effectively silent. It needs ~36dB of
boost to reach its class target, so anywhere it was used as a counter tick it
contributed nothing audible. The indexer flags it and auto-pick now refuses it;
replace it with a real tick sample when one is sourced.

### Pruned 2026-08-19

Removed outright — permanently unusable, so no future re-index can want them
back (140MB freed, 648MB → 508MB):

| Removed | Size | Why |
|---|---|---|
| `230 mixed sound effcts/` (incl. `100 famous…`, `faaaaaah/`) | 65MB | meme/game-rip dump — Minecraft, Mario, One Piece, fart gags |
| `336 SFX/memes/` | 48MB | same |
| `336 SFX/GUN SFX/` | 4MB | weapon foley |
| `450 cinematic sound effects/horror & tension/` | 8MB | wrong register for a product film |
| `336 SFX/ELEMENT/` (fire, water, subway, train) | 17MB | ambience beds, not event SFX |

All five are on the indexer's ban list, so they contributed **0 of the 308**
indexed clips. Verified after deletion: manifest resolves 308/308 and the SFX
bus rebuilds byte-identically.

**Deliberately kept** — currently unused but *policy-legal*, so a future
re-index with different duration/loudness thresholds could pull them in:
`Subdrop Low`, `Subdrop Low+Hi`, `Swoosh packs 1–2`, `Cinematic Whoosh pack 4`,
`Buttons`, `Epic Cinematic Trailer Impact`, `Dramatic Horn Transitions`,
`05WATER RISER` (~66MB total). These were filtered by thresholds, not by taste.

### Vendored 2026-08-19 — `assets/sfx-lib/` is now the committed library

`scripts/sfx-vendor.mjs` copies only the clips the manifest indexes into
`assets/sfx-lib/<event>/`, transcoding WAV → Opus 96k on the way:

- **114.7 MB → 8.8 MB (13x)** across 308 clips — 216 WAVs transcoded, 92
  already-compressed files copied as-is (re-encoding lossy→lossy stacks
  artifacts for no real gain).
- Small enough to commit normally. **No Git LFS needed**, and the worker no
  longer needs the raw packs at all.
- The raw packs are now gitignored. They are the SOURCE; `assets/sfx-lib/` is
  the derived artifact. To rebuild: `sfx-index.mjs` then `sfx-vendor.mjs`.

Transparency verified by measurement, not assumption: mean integrated-loudness
delta across all 308 clips was **−0.03 dB**, and the Agent 4 SFX bus rebuilt
from the vendored library measures **mean −25.8 dB / peak −0.4 dB — identical
to the pre-vendor build**, with the final mix still passing its contrast gate at
12.8 dB.

Two regressions were found and fixed during vendoring, both worth knowing:

1. **Flattening `trust` changed clip selection.** Setting every vendored clip to
   the same trust removed the curated-library preference, so auto-pick silently
   chose different sounds for every unpinned cue (the bus came out 6.4 dB
   quieter). The vendor now preserves each clip's original trust.
2. **Vendoring broke pinned `clip` references.** Ids change when files move, so
   every cue sheet written before vendoring lost its pins. Clips now carry
   `sourceId` + `origin`, and `sfx.mjs` resolves a pin against those too.
