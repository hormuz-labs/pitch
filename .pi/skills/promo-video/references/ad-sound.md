# Sound for an ad

In every studied ad the soundtrack does half the persuading: a voice that
never lets go, music whose sections follow the argument, and a few sounds
that act out the problem. A viewer with the sound off gets the captions. A
viewer with it on should *feel* the argument: tension in the hook, a drop on
the turn, a grin in the voice on the payoff.

This happens in two steps:
1. **The sound score**, written into direction.md before any audio call.
2. **Performing it**: the voice (Gemini TTS), the bed (library, shaped into
   sections), the effects (library manifest), the mix.

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
| SFX | few and structural: a riser into the drop, an impact on it, glitches on insults, pops on stickers, a click on the URL | nothing sounds on every cut |

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
- **The biggest sound moment is the turn**, not the logo. A riser that ends
  on the pivot word, the bass slamming back, the voice brightening, all at
  once. If the reveal hits harder than the turn, the argument lands late.
- **Silence is a sound.** One beat in the film (usually just before the
  name) gets a `breath` dip or a `thin` window so the next thing lands. Only
  one: the ad is otherwise wall to wall.
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

There is no music generator in this pipeline. The bed comes from the curated
library, and the **drops are made in the mix**: a steady track, cut into
sections by `thin` windows, `breath` dips and SFX that hit on the words. It
is how an editor cuts library music to a spot, and when it's done to the
score it sounds scored.

### Plan the sections from the aligned read

| Section | Where | Made with |
|---|---|---|
| hook | 0 → the stake word | `thin` from 0: the bass out, a pulse |
| drop 1 | the stake or claim word | the `thin` window ends there, the bass slams back; `subdrop` on the word |
| breakdown | the enemy / the worst moment | a second `thin` window, lower `cutoff` for a darker room |
| silence beat | just before the name | a `breath` beat, `depth` 0.9 |
| turn / drop 2 | the pivot word | a `riser` that ENDS on the word + an `impact`; any `thin` window ends here too |
| lift | mechanism and proof | nothing: full and steady under the voice |
| outro | after the last word | the bed trimmed to end on a phrase, or one hit and its tail |

### Choose the bed

`pitch motion find-audio` gives a shortlist with opaque names. Choose for
the look: steady and driving for DTC, wide and building for B2B and the
manifesto. When it matters, hear it: `pitch media review --file <candidate>
--purpose music --brief "<the score's music column>"`. Import only the one
you use. If its strong section starts late, trim a new bed with `pitch media
ffmpeg` so the full groove is under drop 1. Never claim a BPM you did not
measure.

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

## STEP 4: SOUND EFFECTS (punctuation, not wallpaper)

Only the curated manifest. Query every event the score names in one call:

```sh
pitch motion sfx --mode query --event "riser,impact,subdrop,glitch,whoosh_deep,reverse,pop,click,tick,chime"
```

The vocabulary: `riser`, `reverse`, `impact`, `subdrop`, `glitch`,
`whoosh_deep`, `whoosh_soft`, `pop`, `tick`, `click`, `type`, `data`,
`select`, `notify`, `chime`, `success`, `camera`.

| Moment | Sound |
|---|---|
| into a drop / the turn | `riser` or `reverse` that ENDS on the word, then `impact` or `subdrop` on it |
| a number landing | `subdrop` under it, or a hard `click` |
| a window shrinking out of full-bleed | `whoosh_soft` |
| glitch cuts, insults, "wrong" | `glitch`, 0.2–0.4s |
| stickers, counters, list items | `pop`, `tick` (micro-events) |
| the URL or the search bar | `type`, then a final `click` |
| a result, a success | `chime` or `success` |
| the brand card | one `impact`, then the tail |

Signature sounds stay under ~6 per 30s and one per shot (the builder
enforces it); micro pops and ticks can carry a list. Write
`audio/sfx-cues.json`, `pitch motion sfx --mode build`, and fix every
placement warning. When a moment has no fitting sound in the manifest, leave
it silent. That is better than the wrong sound.

---

## STEP 5: THE MIX

`pitch motion mix --duration <film> --music audio/music.mp3 --sfx
audio/sfx_bus.wav` keeps the voice 10dB+ over the bed and applies
`audio.fx`. For a loud bed start at `--bed-db -15`. The references were
delivered from −9 to −23 LUFS; platforms normalise, so the mixer's level is
right. Match their dynamics (a dense, steady voice over a bed with real
drops), not their loudness. Re-run the mix after changing `audio.fx`, the
voice, the bed or the cues.

**Listen once, all the way through, against the score.** Does the hook
sound thin and close? Does the bass come back on the stake word, not near
it? Is the turn the biggest moment? Does the voice change feeling three
times? Is there one breath of space before the name? Fix what fails, then
stop.

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
- **The arrangement follows the argument.** Drops land on words; nothing
  sounds on every cut.
- **The turn is the loudest idea**, in the voice, the bed and the effects at
  once.
- **Restraint is craft.** One literal sound, one silence, a handful of
  signature effects. What's left out is what makes the rest hit.

**Avoid:**
- ❌ One `--style` like "energetic and professional" for the whole film
- ❌ Stage directions in the transcript ("Say this excitedly:")
- ❌ Age, gender, accent or a backstory paragraph in a turn style
- ❌ `[square]` tags (not Gemini's), invented `<tags>`, or a tag on every sentence
- ❌ Speeding up the read to fit the picture (cut words instead)
- ❌ A bed that plays flat from start to finish with no `thin` or drop
- ❌ A whoosh on every cut, a pop on every caption
- ❌ The biggest hit on the logo instead of the turn

**Do:**
- ✅ A named character and a scored feeling for every beat
- ✅ 4–6 turns, each a few precise words, with `speaking rapidly` everywhere but the landing line
- ✅ Numbers as the slowest, heaviest words
- ✅ The bass back on the exact pivot word
- ✅ Two auditions, one take, one performance re-take at most
- ✅ A final listen against the score before `review`
