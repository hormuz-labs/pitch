# Sound for a social ad

In every studied ad the soundtrack does half the persuading: a voice that
never lets go, music whose sections follow the argument, and a few sounds
that act out the problem. Read the launch-video audio modules for the
mechanics ([music](../../launch-video/references/audio/music.md),
[sfx](../../launch-video/references/audio/sfx.md),
[mix](../../launch-video/references/audio/mix.md)); this file is the design.

## What the references do

| | Measured | Why it works |
|---|---|---|
| Voice pace | 2.75–3.68 words/s, median 3.1 | energy without gabbling; the picture changes at the same speed |
| Pauses | one 0.3s+ pause per 30–90s | breaths are edited out; there is no gap to scroll away in |
| Emphasis | the slowest words are the numbers ("40%", "$20,000", "3,000%", "365") and the last word of a punchline | the claim is the thing to remember |
| Music | one bed, 90–150 BPM, arranged in sections: thin (bass out) under the hook or the enemy, full on the claim or the turn | the drop is felt as "here's the answer" |
| Drops | the bass returns on the pivot word: "I decided…", "3,000% stronger", "This is [brand]", "no-brainer" | the arrangement follows the argument, not the cuts |
| Literal sound | the mix muffled on "muffled", a ring on "forever" | the viewer hears the problem |
| SFX | few and structural: a riser into the drop, an impact on it, glitches on insults, pops on stickers, a click on the URL | nothing sounds on every cut |

## The voice

**Write for the ear.** Short clauses, the claim at the end of the sentence,
numbers where the voice can land on them ("…over **fifty thousand** men").
Contractions, second person, one idea per sentence.

**Choose the voice.** ElevenLabs gives a real choice: `pitch motion voices
--search "confident american male"` (or "warm female narration", "young
conversational", "deep documentary") and pick by the brief's audience, not
the default. The project's configured voice is the default when the brief
says nothing. Gemini voices: pick a name and describe the delivery in
`--style`.

**Direct the delivery** (ElevenLabs `eleven_v3`, the default model):

- Audio tags in the script steer each line: `[excited]`, `[confident]`,
  `[serious]`, `[whispers]`, `[curious]`, `[sarcastic]`, `[laughs]`. One tag
  per sentence at most; they are never spoken, and `pitch motion align`
  ignores them.
- CAPITALS stress a word ("it's 3,000% STRONGER"); an ellipsis gives a beat
  before a reveal ("…this is Pitch.").
- `--stability 0.3–0.45` for a modulated, human read (lower = more
  expressive); `--expressiveness 0.3–0.5`; `--speed 1.0–1.1`. Never use speed
  to rescue an overlong script — cut words.
- Gemini: `--style "fast, confident and conversational; lean on every number;
  punchy, no pauses between sentences"`.

**Tighten, then align.** `pitch motion tts --pace ad` → `pitch motion
tighten` (every pause over 0.2s shortened; the original kept) → `pitch
motion align` → `pitch motion sync --write`. Listen-check in the preview: if
a line lost its meaning without its pause, re-run `tighten --max 0.3`.

`audio.pace: "ad"` in shots.js: the audit expects 2.7–3.5 words/s.

## The music: sections that follow the argument

Plan the arrangement from the aligned read, in film seconds, before
choosing or generating a bed:

| Section | Where | Sound |
|---|---|---|
| hook | 0 → end of the hook line | thin: drums or a pulse without bass, or a filtered loop |
| drop 1 | the stake or claim word | full: kick + bass enter |
| breakdown | the enemy / the problem's worst moment | bass out, sparse (a `thin` window) |
| turn / drop 2 | the pivot word ("so I decided", "this is…", "ends today") | the biggest moment: a riser ends here, the bass slams back |
| lift | mechanism and proof | full and steady under the voice |
| outro | the close | cut or fade to a tail after the last word |

Two ways to get it:

1. **Generate it** — `pitch motion music --duration <film> --prompt "…"`
   (ElevenLabs), describing sound and the timed arrangement, never an artist:
   > Energetic modern trap-pop instrumental for a social ad, 140 BPM, punchy
   > 808s, crisp hi-hats, bright synth stabs. 0–3.2s: filtered drums only, no
   > bass. 3.2s: full drop, 808 and kick enter. 14–21s: breakdown, bass and
   > kick out, only hats and a pad. 21.4s: riser ends, the biggest drop,
   > everything in. 21.4–40s: steady full groove. 40–43s: stop dead after a
   > final hit, 1.5s reverb tail.
   Put the section boundaries on the aligned words. One call per film.
2. **Shape a library bed** — `pitch motion find-audio`, choose a steady track,
   then make the sections in the mix: `thin` windows for the breakdowns (the
   bass slams back when each ends), a `breath` beat of `depth` 0.9 just before
   the turn, a riser SFX ending on the pivot word.

```js
audio: { vo: "audio/vo.mp3", voStart: 0.2, pace: "ad", fx: [
  { kind: "thin", from: 0, until: "here's the thing" },          // hook without bass; drop on the stake
  { kind: "thin", cue: "the skincare industry", until: "I got tired of it", cutoff: 350 },
  { kind: "muffle", cue: "they make music muffled", until: "conversations", cutoff: 700, voCutoff: 3000 },
  { kind: "ring", cue: "forever", freq: 3600, level: -32 },
] },
```

## Sound effects

Library first (`pitch motion sfx --mode query --event
"riser,impact,subdrop,glitch,whoosh_deep,reverse,pop,click"`); ElevenLabs for
what it lacks (`pitch motion sound --prompt "…" --duration …`, one sound per
call):

| Moment | Sound |
|---|---|
| into a drop / the turn | a riser or reverse swell that ENDS on the word, then a sub impact |
| a window shrinking out of full-bleed | a short whoosh |
| glitch cuts, insults, "wrong" | a digital glitch, 0.2–0.4s |
| stickers, counters, list items | soft pops or ticks (micro-events) |
| a price or a count landing | a cash-register ding or a hard click |
| the URL or the search bar | keyboard clicks and a final click |
| the brand card | one hit, then the tail |

Signature sounds stay under ~6 per 30s (the builder enforces it); micro pops
and ticks can carry a list.

## The mix

`pitch motion mix --duration <film>` keeps the voice 10dB+ over the bed and
applies `audio.fx`. For a loud bed start at `--bed-db -15`. The references
were delivered from −9 to −23 LUFS; platforms normalise, so the mixer's level
is right — match their dynamics (a dense, steady voice over a bed with real
drops), not their loudness. Re-run the mix after changing `audio.fx`, the
voice or the bed.
