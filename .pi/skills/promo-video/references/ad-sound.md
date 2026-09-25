# Sound for an ad

In every studied ad the soundtrack does half the persuading: a voice that
never lets go, music whose sections follow the argument, and a few sounds
that act out the problem. A viewer with the sound off gets the captions. A
viewer with it on should *feel* the argument: tension in the hook, a drop on
the turn, a grin in the voice on the payoff.

This happens in two steps:
1. **The sound score**, written into direction.md before any audio call.
2. **Performing it**: the voice (Gemini 3.8 TTS), the bed (ElevenLabs
   music from a section plan, or Lyria, fitted so its drop lands on the turn
   word), the effects (layered from the curated Gakuyen pack through the
   SFX manifest, ElevenLabs only for a sound the library cannot have), a
   heavy mix.

Read the launch-video audio modules for the mechanics
([music](../../launch-video/references/audio/music.md),
[sfx](../../launch-video/references/audio/sfx.md),
[mix](../../launch-video/references/audio/mix.md)). This file is the design.

## What the references do, measured

| | Measured | Why it works |
|---|---|---|
| Voice pace | 2.75–3.68 words/s, median 3.1 | energy without gabbling; the picture changes at the same speed |
| Pauses | one 0.3s+ pause per 30–90s | breaths are edited out; there is no gap to scroll away in |
| Emphasis | the slowest words are the numbers ("40%", "$20,000", "3,000%", "365") and the last word of a punchline | the claim is the thing to remember |
| Energy | the voice changes register at least three times: hooked, then wry or indignant on the enemy, then lifted on the turn | one flat register for 30s sounds like a machine, and the viewer hears it |
| Music | one bed, arranged in sections: thin (bass out) under the hook or the enemy, full on the claim or the turn | the drop is felt as "here's the answer" |
| Drops | the bass returns on the pivot word: "I decided…", "3,000% stronger", "This is [brand]", "no-brainer" | the arrangement follows the argument, not the cuts |
| Literal sound | the mix muffled on "muffled", a ring on "forever" | the viewer hears the problem |
| SFX | (our target, heavier than the studies) layered through the whole film: a whoosh on every cut, clicks inside bursts, a riser under every build, stacked hits on the turn | the sound carries the viewer's breath from cut to cut; silence is the exception you choose |

---

## STEP 1: THE SOUND SCORE

Before recording anything, write the score. It is to the soundtrack what the
shot table is to the picture: one plan that says, for every beat of the arc,
what the voice feels, what the music does and what sound, if any, acts it
out. Without it the voice gets one generic `--style`, the bed is whatever
the library returned first, and the effects land where the cuts are. That is
the sound of a template.

### THE CRITICAL UNDERSTANDING

- **What is received:** the script, the look (editorial DTC, loud DTC,
  cinematic B2B, manifesto) and the audience.
- **What is created:** a performance. The voice is an actor with an
  objective in every line, the music is a second narrator that argues in
  sections, the effects are punctuation.
- **What happens next:** every audio call (tts, find-audio, sfx, mix) is
  read straight off this score. If a call's arguments can't be traced to a
  line in the score, the score is missing something.

### Name the voice's character

Two to five words, the person speaking, not the product: "the friend who
found the cheat code", "a tired founder, done being polite", "a calm
engineer who's seen every failure", "the older sister, dry and sure". Every
delivery choice follows from this character, so choose it for the audience
and the look, not by habit.

### Score every beat

Add this table to direction.md, one row per beat of the arc
(social-ad.md → The arc), times in film seconds from the aligned read once
it exists:

```
beat     | words (cue)           | voice: feeling → delivery                 | music section        | sound
hook     | "Here's the thing"    | conspiratorial → low, close, a half-smile | thin: pulse, no bass | —
stake    | "hours of focus"      | incredulous → lean on HOURS, slow the num | drop 1: bass enters  | subdrop on "hours"
enemy    | "headphones… worse"   | wry, a little fed up → a sigh on "worse"  | breakdown (thin)     | glitch on "worse"
problem  | "You miss your name"  | quiet, sympathetic → softer, slower       | muffled window       | muffle the mix
turn     | "So we made…"         | resolve → the voice sits up, brighter     | riser ENDS on "made" | riser → impact
reveal   | "This is Lull"        | pride → the name lands, clean, a beat     | drop 2: everything   | —
proof    | "tuned to speech"     | confident, quick → matter-of-fact         | lift: full, steady   | ticks on the list
close    | "Get your focus back" | warm invitation → a smile you can hear    | outro: hit + tail    | one hit on the logo
```

**CRITICAL GUIDELINES:**

- **The voice changes feeling at least three times.** Hook, enemy and turn
  are different people's worth of energy. Write the change down, or it will
  not happen.
- **Every drop has a word.** Name the exact word each section boundary lands
  on. "Around 12 seconds" is not a score.
- **The biggest sound moment is the emotional pivot** — usually the turn: a
  riser that ends on the pivot word, the bass slamming back, the voice
  brightening, all at once (the acne study peaks on "I decided…"). But when
  the objection is the emotional peak, it can carry the slam instead: the
  hearing study's loudest moment is a dead silence into "earplugs suck"
  (+35dB), and its reveal then *lifts* rather than slams. Either way, if the
  logo hits harder than the argument, the argument lands late.
- **Silence is a sound.** One beat in the film (usually just before the
  name) gets a `breath` dip or a `thin` window so the next thing lands. The
  hearing study uses it twice: 0.45s of dead air before the objection slam,
  and another 0.5s as a breath before the logo card. One mid-film silence is
  the norm; the pre-logo breath is optional. Everything else is wall to wall,
  with a 0.5–2s fade tail at the very end (the studies deliver 0.6–2.5s).
- **Literal sound is rare and exact.** At most one or two moments where the
  mix acts out a word ("muffled", "ringing", "noise"). More than that is a
  gimmick.

### SCORE EXAMPLES

**Loud DTC, supplement, 30s.** Character: "a gym friend who's annoyed on
your behalf". Hook shouted-close ("Men over thirty. Listen."), bass out. The
stake lands on a number, slow and heavy, with the drop under it. The enemy
("the stuff at the pharmacy") gets a scoff and a glitch. The turn ("so I
made my own") is almost a whisper, then the riser ends and the voice comes
back loud on the name. Offer read fast and grinning; one cash-register ding
on the real price.

**Editorial DTC, skincare, 20s.** Character: "the older sister, dry and
sure". Never shouts. The hook is intimate and curious; the enemy is a raised
eyebrow, not anger ("forty dollars. for water."); the turn is a smile, the
bass returning softly rather than slamming. Pops on the ingredient stickers,
no riser, a soft hit on the logo.

**Cinematic B2B, sales software, 45s.** Character: "a calm engineer who's
seen every failure". Measured and low, the energy carried by the music: a
long thin breakdown under the problem stack, a big riser into "this is
[brand]", a steady full groove under the proof with ticks on the counter.
The voice lifts once, on the result number, and never again.

**Manifesto, 60s.** Character: "an old coach, gravel and patience". Slower
(narration pace, not ad), room left between thoughts, no tighten. The music
does the build: thin for the first third, full from the midpoint pivot, a
stop dead before the last line, which is spoken over silence.

---

## STEP 2: THE VOICE (Gemini 3.8 TTS)

Narration is always Gemini 3.8 Flash TTS: the model Google recommends for
"nuanced acting" and studio-grade creative work. Always pass the provider and
model explicitly, because the studio's defaults may point elsewhere:

```sh
pitch motion tts --script audio/vo.txt --pace ad \
  --provider gemini --model gemini-3.8-flash-tts --voice <name>
```

The file is `audio/vo.wav`. Put it in shots.js as `audio.vo`. Use
`gemini-3.8-flash-lite-tts` only for throwaway auditions if cost matters.

### THE CRITICAL UNDERSTANDING: identity vs. situation

Google's voice guidance draws one line, and every choice below follows it:

- **Who is speaking is permanent.** Age, gender, timbre, texture and accent
  come from the **voice** you cast. They never go in a direction. "A
  30-year-old woman", "British", "deep male" in a style prompt makes the
  voice drift mid-read.
- **How they feel right now is situational.** Emotion, energy, pace, pitch
  and volume for one stretch of the script go in that stretch's **turn
  style**: short, like a note an actor gets between takes ("dry and
  sarcastic", "whispered urgently", "speaking rapidly").
- **What happens in a moment is an event.** A sigh, a laugh or a pause at one
  exact point goes **inline in the transcript** as a `<tag>`.
- **The words are verbatim.** The transcript is only what is spoken. Never
  write "Say this cheerfully:" or any stage direction into it. That wording
  is what made the old reads slow and flat (2.1 words/s against 2.6 for the
  same script directed properly).

### Write for the ear

Short clauses, the claim at the end of the sentence, numbers where the voice
can land on them ("…over **fifty thousand** men"). Contractions, second
person, one idea per sentence. Aim for runtime × 3 words/s, minus the silent
beats. Read it aloud in your head in the character's voice: any sentence
you'd stumble on, the model will too. For an unpolished, UGC-style read,
real disfluency helps ("Okay so, uh… I tried everything."). For a polished
ad, leave it out.

### Cast the voice

Gemini has 30 prebuilt voices, each with one defining quality. Cast from the
character in the score, not by habit, and never the default because it's
the default:

| The character | Voices (Google's descriptor) |
|---|---|
| hyped, high-energy, loud DTC | Puck (upbeat), Laomedeia (upbeat), Fenrir (excitable), Sadachbia (lively), Pulcherrima (forward), Zephyr (bright), Autonoe (bright) |
| a friend talking to a friend, editorial DTC, UGC-style | Achird (friendly), Zubenelgenubi (casual), Callirrhoe (easy-going), Umbriel (easy-going), Aoede (breezy), Leda (youthful) |
| authority, precision, cinematic B2B | Kore (firm), Orus (firm), Alnilam (firm), Iapetus (clear), Erinome (clear), Schedar (even), Charon (informative), Rasalgethi (informative), Sadaltager (knowledgeable) |
| intimate, textured, manifesto, premium | Gacrux (mature), Algenib (gravelly), Enceladus (breathy), Sulafat (warm), Vindemiatrix (gentle), Achernar (soft), Algieba (smooth), Despina (smooth) |

**Audition.** Record the hook and stake (at least 12 words; the tool refuses
less) with two candidate voices, **with no turn styles**, as `--out
audio/audition-<voice>.wav`. Google's advice is to hear the plain voice
first: the voice itself should already be close to the character before any
direction is added. Keep the one that sounds like the character, not the one
that sounds most like an advert. Two auditions, then commit; each call is
billed.

### Direct the performance: turns, events, stress

**1. Turns: `{style}` at the start of a line.** Split the script at every
change of feeling in the score (hook, enemy, turn, reveal, close; usually 4–6
turns). Open each with its direction in braces. It applies to that turn's
text until the next `{…}`. All the turns go in one request, so it is still
one continuous read with one breath and one arc.

A turn style is **a few words, 2–8**, drawn from these families:

| Family | Examples |
|---|---|
| emotion | `warm and enthusiastic`, `dry and sarcastic`, `quietly furious`, `amazed`, `tender`, `smug` |
| delivery | `conspiratorial`, `whispered urgently`, `matter-of-fact`, `like sharing a secret`, `out of breath` |
| pace | `speaking rapidly`, `unhurried`, `speaking slowly` (a proof number, a manifesto close) |
| pitch and inflection | `high pitch, cheerful and excited inflection`, `low and flat`, `rising, a question in it` |
| volume | `softly`, `loud and punchy`, `almost a whisper` |

Combine two or three: `{low and conspiratorial, speaking rapidly}`. For an
ad, add `speaking rapidly` to every turn except the one that must land slowly
(usually the number or the name): that contrast is what makes it land.

**Never in a turn style:** age, gender, accent, names, "keep the voice
consistent", or a paragraph of character backstory. Google's docs name long
style blocks as the cause of voice drift. The character lives in the cast
voice and the words, not in a biography.

**2. Events: `<tag>` inside the transcript.** For one moment, not a stretch.
Use the ones Google documents, in angle brackets, in English:

- laughter: `<laugh>`, `<chuckle>`, `<giggle>`, `<snicker>`
- breath: `<breath>`, `<exhales>`, `<sigh>`, `<phew>`
- reaction: `<gasp>`, `<groan>`, `<tsk>`, `<pff>`, `<scream>`, `<shout>`, `<cheer>`
- pause: `<short pause>`, `<long pause>`

At most two or three in a 30s ad, each where the score puts a feeling
beat: a `<sigh>` on the enemy, a `<chuckle>` on the absurd price, a `<short
pause>` before the name. Note that `tighten` shortens every pause over 0.2s,
including a `<short pause>` you asked for. If the beat matters, run
`tighten --max 0.3`, or let a `breath` dip in the mix carry it instead.

**3. Stress: capitals and punctuation.** CAPITALS stress a word ("it's
3,000% STRONGER"). A full stop is a hard stop, a comma a lilt, a dash (`--`)
a break in thought, an ellipsis a hesitation. Short fragments ("Chatter.
Calls. Keyboards.") read as a punchy list. Capitalise one or two words per
turn at most. A turn of capitals is shouting, not stress.

**`--style`** applies only to text before the first `{…}`. With every line
in a turn, leave it out.

### A directed script (audio/vo.txt)

```
{low and conspiratorial, speaking rapidly} Here's the thing. Your open office steals HOURS of focus every single week. Chatter. Calls. Keyboards. All day.
{dry and sarcastic, speaking rapidly} And we know, headphones make it worse. <sigh> You miss your name. You miss the room.
{brightening, warm and proud} So we made something better. This is Lull.
{confident and matter-of-fact, speaking rapidly} Earbuds that quiet the noise and keep the voices, with filters tuned to speech, not silence.
{excited, a smile in the voice} Hear your team. Lose the din. Get your focus back.
```

Measured with Achird: 25.8s raw, 2.59 words/s; 22.7s and 2.96 words/s after
`tighten`, inside the ad range.

### TURN EXAMPLES BY LOOK

**Loud DTC.** Voice: Puck or Fenrir.
```
{loud and punchy, speaking rapidly} Men over thirty. Listen.
{incredulous, speaking rapidly} You're paying FORTY dollars a month <pff> for chalk?
{almost a whisper} So I made my own.
{triumphant, loud} This is Forge.
{grinning, speaking rapidly} Sixty-day guarantee. Try it. Keep it or don't.
```

**Editorial DTC.** Voice: Zubenelgenubi or Aoede.
```
{dry, amused, unhurried} Forty dollars. For water.
{a raised eyebrow} That's what most serums are. <chuckle>
{warm and sure} Ours is eleven ingredients. You can read every one.
{softly, a smile in the voice} Clear skin, without the ceremony.
```

**Cinematic B2B.** Voice: Kore or Iapetus.
```
{calm and precise} Every quarter, your team loses a week to reporting.
{low and flat} Copy. Paste. Reconcile. Repeat.
{quietly confident, rising} Then you connect Ledger.
{matter-of-fact, speaking slowly} Forty HOURS back. Every month.
```

**Manifesto.** Voice: Gacrux or Algenib. Narration pace, no `speaking rapidly`, no tighten.
```
{low, gravelly, unhurried} Nobody remembers the easy miles.
{almost a whisper} They remember the ones they almost quit.
{rising, resolute} So go again.
```

### Check the take

The tool prints the duration, words/s and the model that made the take.

- **Model.** If a take comes back rushed the tool re-records once with
  `gemini-2.5-flash-preview-tts` and keeps the nearer one. That model gets no
  turns or tags, only a flattened read. If the printed model isn't
  `gemini-3.8-flash-tts`, cut words or take `speaking rapidly` off a turn and
  record again. Don't keep the flat read.
- **Pace.** `--pace ad` aims for 2.7–3.5 words/s after `tighten`. Too slow:
  add `speaking rapidly` to more turns, or cut copy. Too fast: cut copy.
  Never pad or stretch to fit the picture.
- **Performance.** Listen against the score. Each turn's change of feeling
  must be audible, the numbers must be the slowest words, and the name must
  land clean. A turn that sounds wrong: shorten or sharpen its style (one
  precise adjective beats four vague ones). A tag spoken aloud: remove it. A
  voice that drifts: the styles are too long or carry identity. One re-take
  for performance, then move on.

### Tighten, then align

`pitch motion tighten` (every pause over 0.2s shortened, original kept) →
`pitch motion align` (it ignores `{styles}` and `<tags>`) → `pitch motion
sync --write`. If a line lost its meaning without its pause, re-run `tighten
--max 0.3`. A manifesto read at narration pace is not tightened.

`audio.pace: "ad"` in shots.js: the audit expects 2.7–3.5 words/s.

---

## STEP 3: THE MUSIC (sections that follow the argument)

The bed is a second narrator: it should sound like it was scored to this
ad's argument, because it was. Generate it from the score's music column
with **Google Lyria 3.5** (the default: its takes follow an arrangement,
breakdown and drop included), or **ElevenLabs music_v2** when the length
must come out exact. Fall back to the curated library only when the user
supplied or asked for a track, or generation fails twice. Either way, the
`thin` windows, the `breath` dip and the SFX make the sections land on the
exact words.

**One bed per film, made for this film.** Every new film generates its own
bed from its own look, story and word timings. Nothing is reused across
films. Within a film, keep `audio/music.mp3` through every edit and
regenerate only when the words it is fitted to move: a new script, a
re-recorded voice, or a changed turn. A caption, colour or shot change
never needs a new bed.

### Plan the sections from the aligned read

Write this after `pitch motion align`, with real times from
`audio/vo-words.json`. Each generated section must be **at least 3s**; a
shorter beat is merged into its neighbour and made with a `thin` window.

| Section | Ends on | In the music plan | Reinforced in the mix |
|---|---|---|---|
| intro / hook | the stake word | filtered drums or a pulse, no bass | `thin` from 0 until the stake word |
| drop | the enemy | the 808/kick crashes in, full groove | the `thin` ends on the stake word; `subdrop` on it |
| breakdown | the turn word | bass and kick fall away, hats and a pad, a riser swells | a second `thin`, lower `cutoff`; a `breath` before the name |
| big drop | the last word | everything slams in, the fullest section | **`drop_at`** puts the bed's own drop on the turn word; `riser` ENDS on it + `impact` |
| outro | the film's end | stop dead on a final hit, short reverb tail | the tool fades the cut |

### Describe the sound: genre, tempo, instruments, dynamics

Both generators follow the same rule: the more detail, the more control. A
vague brief ("upbeat music for an ad") gets generic music.

- **Genre with an era, or a blend.** Not "hip-hop" but "early-90s boom-bap
  hip-hop"; not "electronic" but "2010s future bass crossed with UK garage".
  An era or a blend is what makes a bed sound chosen rather than defaulted.
- **Tempo, as a number and a feel.** "140 BPM, driving" or "a slow 72 BPM
  ballad feel". The feel words steer the groove the number alone doesn't.
- **Instruments, with one unexpected.** Name the 3–5 that define the genre,
  then add one that doesn't belong: an 80s synth in a boom-bap beat, a
  pizzicato string line over trap hats, a gospel choir stab in house. That
  one instrument becomes the brand's sonic signature. Let it carry the
  hook or the drop.
- **Dynamics, as flow between sections.** Say how each section *becomes*
  the next, not only what it contains: "the 808 and kick crash in", "fall
  away to hats and a pad", "a riser swells and swallows everything". That
  movement is what an ad's drops are made of.

Never name an artist, a song or a "sounds like": both services refuse it,
and the film must be original. Pick the palette from the look:

| Look | Palette |
|---|---|
| loud DTC | 2020s trap-pop or hard phonk, 130–150 BPM, 808s, crisp hats, bright synth stabs, big claps; unexpected: a pizzicato string riff or a cowbell hook |
| editorial DTC | late-90s French house or 70s lo-fi funk, 105–120 BPM, dry drums, muted bass guitar, Rhodes; unexpected: a vibraphone or a whistled line |
| cinematic B2B | modern hybrid-cinematic with 80s synthwave colour, 110–128 BPM, pulsing synth bass, taut strings, big toms; unexpected: a ticking clock-like marimba |
| manifesto | neo-classical build, 70–90 BPM, solo felt piano growing into strings and choir pads; unexpected: a distant brass swell or a lone cello |

### Lyria (default): one timestamped prompt

`--prompt "…"`: one line of identity (as above), then
"Instrumental only, no vocals." (Lyria sings unless told not to; the tool
adds it), then a timestamped line per section and the ending as its own:

> Energetic 2020s trap-pop for a social ad, 140 BPM and driving, punchy
> 808s, crisp hi-hats, bright synth stabs, big claps, and a playful
> pizzicato string riff as the hook; confident and cheeky, clean modern mix.
> Instrumental only, no vocals.
> [0:00 - 0:03] Intro: filtered drums and the pizzicato riff alone, no bass, tension building.
> [0:03 - 0:10] Drop: the 808 and kick crash in under the riff, full groove.
> [0:10 - 0:14] Breakdown: bass and kick fall away to hats and a soft pad; a riser swells and swallows everything.
> [0:14 - 0:28] Big drop: a half-beat of silence, then everything slams in, the fullest section, the riff doubled an octave up.
> [0:28 - 0:30] Ending: stop dead on a final hit with a short reverb tail.

```sh
pitch motion music --duration 30 --drop_at 14.2 --prompt "<the prompt above>"
```

### ElevenLabs (alternative): styles and sections

`--provider elevenlabs`, when the bed's length must be exact and the
arrangement matters less. The ElevenLabs music model takes a **composition plan**: one chunk per
section, each with its own length, its own styles to include and avoid, and
high adherence to the chunks around it. The tool builds the plan from two
things:

- **`--styles`: the bed's identity, 6–7 short styles.** They set the tone on
  the first section, and the first two (genre, tempo) anchor every later one
  so nothing drifts: `["energetic 2020s trap-pop", "140 BPM, driving",
  "punchy 808s", "crisp hi-hats", "bright synth stabs", "playful pizzicato
  string riff", "confident and cheeky"]`.
- **`--sections`: the plan above, in order.** Each has a `label`, the film
  second it ends on (`until`, the last one the film's end), `text` saying
  what enters, leaves or builds, and optional `styles` / `avoid` for that
  section alone. Put `avoid: ["808", "kick drum", "bass"]` on every section
  that must have no low end. The tool sends each `text` as a `{cue}`,
  because plain text in a section is **sung as lyrics**: the first takes
  came back with the section descriptions sung word for word. Vocals are
  kept out of every section automatically.

```sh
pitch motion music --provider elevenlabs --duration 30 --drop_at 14.2 \
  --styles '["energetic 2020s trap-pop","140 BPM, driving","punchy 808s","crisp hi-hats","bright synth stabs","playful pizzicato string riff","confident and cheeky"]' \
  --sections '[
    {"label":"Intro","until":3.1,"text":"filtered drums and the pizzicato riff alone, tension building","avoid":["808","kick drum","bass"]},
    {"label":"Drop","until":9.8,"text":"the 808 and kick crash in under the riff, full groove"},
    {"label":"Breakdown","until":14.2,"text":"bass and kick fall away to hats and a soft pad; a riser swells","avoid":["808","kick drum","bass"]},
    {"label":"Big Drop","until":27,"text":"everything slams in, the fullest section, the riff an octave up"},
    {"label":"Outro","until":30,"text":"stop dead on a final hit with a short reverb tail"}]'
```

### What the tool does with the take, measured

Neither service keeps the clock of the plan:

| | Length | Drops (asked 3.1s and 14.2s) | Vocals | Time |
|---|---|---|---|---|
| Lyria, timestamped prompt | 68s, 103s | 6.5s/19.75s, 6.75s/33.25s: breakdown then drop, late | none | ~35s |
| ElevenLabs, sections as plain text | exact | ~3.3s/~17.2s | **sung**: the section descriptions | ~6s |
| ElevenLabs, sections as `{cues}` or styles | exact | one drop only (6.75s, 10.25s), no breakdown | none | ~6s |

So the tool measures the take's low end every quarter second and finds each
real drop: the bass back after a breakdown of 2s+, or after a short gap that
opens a sustained full section. It trims the head so the first drop at or
after `--drop_at` lands exactly on it, cuts the bed to `--duration` with a
fade, and keeps the raw take beside it (`audio/music.lyria.mp3` or
`audio/music.elevenlabs.mp3`). Lyria's long takes leave room to trim;
ElevenLabs gets 5s of spare tail so the trim never leaves the film short. The trim moves every other drop earlier by the same
amount. That's why the other sections are always reinforced with `thin`
windows on their words.

**Read what it reports.** It lists every drop in film time. Then:

- A drop landed near another word in the plan (within ~0.3s): use it.
  Otherwise make that section with a `thin` window ending on the word.
- It warns that no drop could be moved onto `drop_at`, or that the take ran
  out before the film: regenerate once (a clearer breakdown with `avoid` on
  its low end, or the other provider). If the second take fails too, use the
  library.
- Listen to the fitted bed once before mixing. Takes vary even with the same
  plan. If it's wrong for the look, change the styles, not the timings. One
  regeneration at most; each call is billed.

### Or: a library bed

When the user supplied a track or asked for library music, or generation
failed twice: `pitch motion find-audio` gives a shortlist with opaque names. Choose
for the look, and when it matters hear it: `pitch media review --file
<candidate> --purpose music --brief "<the score's music column>"`. Import
only the one you use. If its strong section starts late, trim a new bed with
`pitch media ffmpeg`. A library bed has no drops of its own on your words,
so every section in the plan is made with `thin` windows. Never claim a BPM
you did not measure.

### Shape it

```js
audio: { vo: "audio/vo.wav", voStart: 0.2, pace: "ad", fx: [
  { kind: "thin", from: 0, until: "hours" },                                    // hook without bass; drop on the stake
  { kind: "thin", cue: "headphones make it worse", until: "so we made", cutoff: 350 }, // breakdown; bass back on the turn
  { kind: "muffle", cue: "you miss your name", until: "you miss the room", cutoff: 700, voCutoff: 3000 },
  { kind: "ring", cue: "all day", freq: 3400, level: -32 },
] },
```

And the silence beat, on the shot before the reveal:
`beats: [{ at: 2.9, kind: "breath", depth: 0.9, dur: 0.4 }]`.

---

## STEP 4: SOUND EFFECTS (layered, all the way through)

**The library is the default, not a fallback.** The SFX manifest
(`pitch motion sfx`) ranks the studio's pack first — the **Gakuyen Ultimate
Sound FX Pack**: 18 whooshes, 6 risers, 8 impacts, a sub boom, a tinnitus
ring and 12 single camera shutters, each measured and described with what
it is for. Every clip knows where its moment lands (`hit`: a whoosh's peak,
a swell-in impact's crest, a riser's top), and the builder aligns that to
the cue's `t`. You write `t` = the cut or the word; the sound peaks there.

ElevenLabs (`pitch motion sound`) is only for a sound the library cannot
have: the product's own foley (a case snapping shut, a can opening), a
literal ambience (office murmur). Never generate a whoosh, riser, impact
or shutter.

### Heavy by default: layer the whole film

The studio's SFX density is `heavy` (data/sfx-settings.json; a project can
set `"sfx-density": "standard"` in audio/mix-settings.json). Whooshes and
hits are not reserved for drops and glitches — they catch the viewer's
breath on every move. Build the bus in three layers:

| Layer | Where | What | Level |
|---|---|---|---|
| **Travel** | every cut, every caption that jumps, every window move | a `whoosh_soft` per cut (rotate 4–6 different clips so it never repeats); `whoosh_deep` on act changes and full-frame moves | texture: rides under the voice |
| **Punctuation** | inside bursts, on stickers, on the URL | a `camera` shutter per burst clip (alternate the -a/-b takes), pops, ticks, typing | texture |
| **Weight** | the hook frame, each interrupt, stats, the turn, the name, the close | stacked: `riser` + `reverse` ending on the word, then `impact` + `subdrop` ON it; a `deep-thud` on each black card; a `ring` after a shock line | signature |

**Stack, don't queue.** A moment is several classes on the same `t`: the
turn is a riser (ends on t) + a suck-in (ends on t) + a large impact + the
sub boom (on t) + the deep whoosh of the colour flip. Different classes at
one moment are a layer and the builder allows it; two of the SAME class
within 120ms smear and are flagged.

### Map the moments (clip ids you can pass as `clip`)

`pitch motion sfx --mode list` prints the pack's suggested layers per film
moment. The core of it:

| Moment | Layer these |
|---|---|
| the hook's first frame | `gakuyen-cinematic-hit` + `gakuyen-early-whoosh` (`align: "file"`, `dur` 1.6) + `gakuyen-camera-mech3-click` |
| a hard cut / burst clip | rotate `gakuyen-fast-whoosh`, `gakuyen-short-whoosh`, `gakuyen-quick-whoosh`, `gakuyen-short-airy-whoosh`, `gakuyen-air-swoosh`; a shutter per burst clip |
| a caption slam / punch zoom | `gakuyen-quick-intense-whoosh` |
| a black-card interrupt | `gakuyen-deep-thud` + `gakuyen-deep-low-swoosh` |
| a stat or number landing | `gakuyen-metallic-riser` into `gakuyen-dramatic-impact` |
| the problem made literal, shock | `gakuyen-high-pitch-ringing` (`dur` 1.5–3, `gainDb` −4) under a muffle |
| into the turn | `gakuyen-cinematic-riser` or `gakuyen-riser-sci-fi` (tech) + `gakuyen-suction-riser` |
| the turn / the name | `gakuyen-large-cinematics` or `gakuyen-hit-large` + `gakuyen-analog-synth-hit-deep` (`subdrop`, `dur` ~2) + `gakuyen-layered-whoosh-transition` |
| proof stills, a product shot | `gakuyen-camera-medium-shutter`, `gakuyen-flyby-whoosh` on a scroll |
| a quieter act change, emotion | `gakuyen-cinematic-hit-2`, `gakuyen-reverb-whoosh` |
| into the CTA, the URL | `gakuyen-smooth-cinematic-whoosh`, then `gakuyen-camera-shutter1-big` on the URL |

Micro events the pack lacks (`pop`, `tick`, `click`, `type`, `chime`,
`glitch`) come from the rest of the manifest by event name.

### The cue sheet

```json
{ "duration": 40, "cues": [
  { "t": 0.0,  "event": "impact",      "clip": "gakuyen-cinematic-hit", "dur": 1.2 },
  { "t": 0.0,  "event": "whoosh_deep", "clip": "gakuyen-early-whoosh", "dur": 1.6, "align": "file" },
  { "t": 0.5,  "event": "camera" },
  { "t": 1.9,  "event": "whoosh_soft", "clip": "gakuyen-fast-whoosh" },
  { "t": 1.9,  "event": "impact",      "clip": "gakuyen-deep-thud", "dur": 0.8 },
  { "t": 17.28, "event": "riser",      "clip": "gakuyen-cinematic-riser", "dur": 1.5 },
  { "t": 17.28, "event": "reverse",    "clip": "gakuyen-suction-riser", "dur": 0.9 },
  { "t": 17.28, "event": "impact",     "clip": "gakuyen-hit-large", "dur": 2.5 },
  { "t": 17.28, "event": "subdrop",    "dur": 2.2 },
  { "t": 36.9, "event": "camera",      "clip": "gakuyen-camera-shutter1-big" }
] }
```

Take every `t` from the shot cuts in `audio/cues.json` and the word onsets
in `audio/vo-words.json` — never by ear. A whoosh with no `dur` keeps 0.8s
after its peak; impacts and subdrops take a `dur` for their tail; a riser's
`dur` is its approach (at most its build length — the builder says so).

### The budget

Heavy: about 22 signature cues (impacts, subdrops, risers, deep whooshes,
rings, glitches) and 48 texture cues (soft whooshes, shutters, pops, ticks)
per 30s — one per picture change at the ad pace of 1.5/s; a 30s ad typically
lands 45–60 cues. The builder warns past
either. Then `pitch motion sfx --mode build`, and fix every warning.

---

## STEP 5: THE MIX

`pitch motion mix --duration <film> --music audio/music.mp3 --sfx
audio/sfx_bus.wav` keeps the voice 10dB+ over the bed and applies
`audio.fx`. For a loud bed start at `--bed-db -15`. The mix is **heavy**: the SFX bus is built 4dB hotter than the old sparse levels, and `--sfx-db` 0 to +3 lifts it further while the voice gate (10dB+ over the bed) still holds; if the voice feels crowded, pull a travel layer's `gainDb`, not the whole bus. The references were
delivered from −9 to −23 LUFS; platforms normalise, so the mixer's level is
right. Match their dynamics (a dense, steady voice over a bed with real
drops), not their loudness. Re-run the mix after changing `audio.fx`, the
voice, the bed or the cues.

**Listen once, all the way through, against the score.** Does the hook
sound thin and close? Does the bass come back on the stake word, not near
it? Is the turn the biggest moment? Does the voice change feeling three
times? Is there one breath of space before the name? Fix what fails, then
stop. And measure the drop: the RMS swing across the drop word should read
≥8dB — the references measure +5 to +35dB, music-led at the top of that
range. Under it, the `thin` window isn't reading as a drop.

---

## ESSENTIAL PRINCIPLES

- **Score first.** No audio call before the score is in direction.md.
- **One continuous read.** One tts call for the whole film, never one per
  shot; separate clips restart intonation.
- **Gemini 3.8, explicitly.** `--provider gemini --model
  gemini-3.8-flash-tts` on every read.
- **Identity in the voice, feeling in the turns.** Cast the voice for who
  speaks; direct each turn with a few words for how they feel. Never the
  other way round.
- **The voice is a character, not a narrator.** Name it, and let it change
  feeling at least three times.
- **The arrangement follows the argument.** Drops land on words; the
  effects follow the picture — a sound on every cut.
- **The emotional pivot is the loudest idea** — the turn, or the objection
  when that's the peak — in the voice, the bed and the effects at once.
- **Density is the feel.** Layered travel sounds carry the viewer from cut
  to cut; the stacked turn is still the loudest moment, and one chosen
  silence before the name makes it land.

**Avoid:**
- ❌ One `--style` like "energetic and professional" for the whole film
- ❌ Stage directions in the transcript ("Say this excitedly:")
- ❌ Age, gender, accent or a backstory paragraph in a turn style
- ❌ `[square]` tags (not Gemini's), invented `<tags>`, or a tag on every sentence
- ❌ Speeding up the read to fit the picture (cut words instead)
- ❌ A bed that plays flat from start to finish with no `thin` or drop
- ❌ An artist or song name in the music brief, or a vague one ("upbeat music")
- ❌ A music section under 3s, or "no bass" in the text instead of `avoid`
- ❌ Generating a whoosh, riser, impact or shutter with ElevenLabs when the pack has one
- ❌ The same whoosh clip on consecutive cuts — rotate the pack's takes
- ❌ A cut with no sound under it, or a turn that is a single hit instead of a stack
- ❌ The biggest hit on the logo instead of the turn

**Do:**
- ✅ A named character and a scored feeling for every beat
- ✅ 4–6 turns, each a few precise words, with `speaking rapidly` everywhere but the landing line
- ✅ Numbers as the slowest, heaviest words
- ✅ The bass back on the exact pivot word (`--drop_at`)
- ✅ Two auditions, one take, one performance re-take at most
- ✅ A final listen against the score before `review`
