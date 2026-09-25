# Worked example: a 9:16 ad, end to end

A complete skeleton for a fictional product ("Lull", focus earbuds for open
offices), built and checked in this engine. It shows every piece together —
the frame, the caption track, footage bursts, a card, the glitch act change,
the muffle and ring, the product act and the brand card. Use its shape, not
its words: your script, pictures and sound come from your product and brief.

## The script (audio/vo.txt)

Voice character: "a friend who's been in your open office". Each `{turn}`
comes from the sound score's feeling column (see ad-sound.md → Step 2).

```
{low and conspiratorial, speaking rapidly} Here's the thing. Your open office steals HOURS of focus every single week. Chatter. Calls. Keyboards. All day.
{dry and sarcastic, speaking rapidly} And we know, headphones make it worse. <sigh> You miss your name. You miss the room.
{brightening, warm and proud} So we made something better. This is Lull.
{confident and matter-of-fact, speaking rapidly} Earbuds that quiet the noise and keep the voices, with filters tuned to speech, not silence.
{excited, a smile in the voice} Hear your team. Lose the din. Get your focus back.
```

Recorded with Gemini (voice Achird, the commands below), tightened and
aligned. No outside figure appears, so there is no `evidence` shot; a film
that cites one adds it after the stake (see social-ad.md).

## direction.md — the shot table (excerpt)

```
id        | cue (spoken)            | picture                                  | source                | caption            | sound
hook      | (opens)                 | black card                               | engine                | HERE'S THE THING   | —
office    | Your open office        | 6 open-plan clips, mono, flash cuts      | Pexels #… ×6          | STEALS HOURS       | room tone
din       | Chatter                 | 5-clip burst, 0.16s each                 | Pexels #…             | —                  | glitch ticks
all-day   | All day                 | the signal wave, frequency rising        | engine                | ALL DAY (rgb)      | ring 3.4kHz
objection | And we know             | black card, glitch in, glitch on "worse" | engine                | HEADPHONES … WORSE | glitch hit
muffled   | You miss your name      | 4 cuts: calling across, a turning head   | Pexels #… ×3          | YOU MISS YOUR NAME | whole mix muffled
turn      | So we made              | the product close, pushing in            | brand packshot        | —                  | breath before the name
reveal    | This is Lull            | the pair floating                        | brand cut-outs        | —                  | music enters
inside    | with filters tuned      | exploded view                            | brand part renders    | —                  | —
life      | Hear your team          | 6 warm team/desk clips                   | Pexels #… ×5          | —                  | —
payoff    | Get your focus back     | the pair floating, captions dark on light| brand cut-outs        | GET YOUR FOCUS BACK| —
brand     | —                       | logo + URL on black                      | brand logo            | —                  | pop, tail
```

## shots.js (after `pitch motion sync --write` set the durations)

```js
// A 9:16 social ad for a fictional product (Lull, focus earbuds).
window.SHOTS = {
  format: "9:16",
  brand: { bg: "#0B0B0C", ink: "#FFFFFF", accent: "#7CF2C8", font: '"Helvetica Neue", Arial, sans-serif' },
  audio: {
    vo: "audio/vo.wav", voStart: 0.4, pace: "ad",
    fx: [
      { kind: "thin", from: 0, until: "hours" },
      { kind: "thin", cue: "headphones make it worse", until: "so we made", cutoff: 350 },
      { kind: "ring", cue: "all day", freq: 3400, level: -32 },
      { kind: "muffle", cue: "you miss your name", until: "you miss the room", cutoff: 700, voCutoff: 3000 },
    ],
  },
  motion: { exit: "none", drift: false, cutDur: 0.3 },
  grade: { grain: 6 },
  captions: {
    // No subtitles tier. Every phrase lands in a new place, size and entrance.
    style: { size: 0.11, weight: 800, pos: "upper", stack: "word", enter: "pop" },
    phrases: [
      { cue: "Here's the thing", pos: "center", align: "center", shadow: false, stack: "replace", size: 0.2, enter: "cut" },
      { cue: "steals hours", pos: "top", align: "left", words: ["steals", { text: "hours", fx: ["accent", "big"] }] },
      { cue: "every single week", y: 0.6, x: 0.09, align: "right", size: 0.065, enter: "rise" },
      { cue: "All day", pos: "center", align: "center", size: 0.24, words: [{ text: "all", fx: "rgb" }, { text: "day", fx: "rgb" }] },
      { cue: "headphones make it worse", pos: "upper", align: "right", shadow: false, words: [{ text: "headphones", scale: 0.55, weight: 500 }, "make", "it", { text: "worse", fx: ["big", "glitch"] }] },
      { cue: "You miss your name", pos: "lower", align: "left", words: ["you", "miss", "your", { text: "name", fx: "blur" }] },
      { cue: "Get your focus back", pos: "top", align: "center", color: "#0B0B0C", shadow: false, enter: "rise" },
    ],
  },
  shots: [
    { id: "hook", type: "card", dur: 1.85 },
    { id: "office", type: "footage", dur: 4.55, cue: "Your open office", look: "mono", push: [1, 1.05], flash: "#fff", every: 0.38,
      clips: [{ src: "assets/footage/office-1.webm" }, { src: "assets/footage/office-2.webm", in: 0.5 }, { src: "assets/footage/office-3.webm" },
              { src: "assets/footage/office-4.webm" }, { src: "assets/footage/office-5.webm" }, { src: "assets/footage/office-6.webm" }] },
    { id: "din", type: "footage", dur: 2.05, cue: "Chatter", look: "mono-hard", every: 0.16,
      clips: [{ src: "assets/footage/office-2.webm" }, { src: "assets/footage/office-3.webm", in: 1 }, { src: "assets/footage/office-1.webm", in: 2 },
              { src: "assets/footage/office-2.webm", in: 3 }, { src: "assets/footage/office-3.webm", in: 2 }] },
    { id: "all-day", type: "signal", dur: 1, cue: "All day", amp: [0.28, 0.34], freq: [2, 4.5] },
    { id: "objection", type: "card", dur: 3.4, cue: "And we know", cut: "glitch", cutDur: 0.25, beats: [{ at: 2.7, cue: "worse", kind: "glitch", dur: 0.3 }] },
    { id: "muffled", type: "footage", dur: 3.7, cue: "You miss your name", look: "cool", shade: 0.3, every: 0.9,
      clips: [{ src: "assets/footage/name-call.webm" }, { src: "assets/footage/name-call.webm", in: 1.4 }, { src: "assets/footage/turn-head.webm" }, { src: "assets/footage/empty-desk.webm" }] },
    { id: "turn", type: "footage", dur: 3.25, cue: "So we made", bg: "#EEF0F3", fit: "contain", push: [1.1, 1.2], every: 0.8,
      clips: [{ src: "uploads/lull-left.png" }, { src: "uploads/lull-right.png" }, { src: "uploads/lull-case.png" }, { src: "uploads/lull-left.png", focus: [0.5, 0.3] }] },
    { id: "reveal", type: "float", dur: 5.5, cue: "This is Lull", bg: "#EEF0F3",
      items: [{ src: "uploads/lull-left.png", w: 340, x: 0.34, y: 0.55, rot: -14 }, { src: "uploads/lull-right.png", w: 300, x: 0.66, y: 0.5, rot: 10, depth: 0.7 }] },
    { id: "inside", type: "exploded", dur: 3.45, cue: "with filters tuned", bg: "#E9ECF1",
      parts: [{ src: "uploads/parts/tip.png", w: 300 }, { src: "uploads/parts/filter.png", w: 170 }, { src: "uploads/parts/core.png", w: 260 }, { src: "uploads/parts/loop.png", w: 320 }] },
    { id: "life", type: "footage", dur: 2.9, cue: "Hear your team", look: "warm", every: 0.5,
      clips: [{ src: "assets/footage/team-laugh.webm" }, { src: "assets/footage/desk-flow.webm" }, { src: "assets/footage/high-five.webm" },
              { src: "assets/footage/headphones-off.webm" }, { src: "assets/footage/window-light.webm" }, { src: "assets/footage/team-laugh.webm", in: 1.2 }] },
    { id: "payoff", type: "float", dur: 3.2, cue: "Get your focus back", bg: "#EEF0F3", push: [1, 1.06],
      items: [{ src: "uploads/lull-left.png", w: 300, x: 0.35, y: 0.66, rot: -10 }, { src: "uploads/lull-right.png", w: 260, x: 0.66, y: 0.62, rot: 12, depth: 0.7 }] },
    { id: "brand", type: "logo-sting", dur: 3.2, bg: "#0B0B0C", src: "assets/harvested/logo.png", tag: "lull.example" },
  ],
};
```

The project types `signal`, `exploded` and `float` are the files in
[recipes.md](recipes.md), copied into `js/shots/` and `css/shots/`.

## The commands, in order

```sh
pitch motion scaffold --format 9:16                    # shell + starter shots.js in 9:16
pitch motion tts --script audio/hook.txt --out audio/audition-Achird.wav --pace ad \
  --provider gemini --model gemini-3.8-flash-tts --voice Achird   # audition two voices on the plain hook, no turns
pitch motion tts --script audio/vo.txt --pace ad --provider gemini --model gemini-3.8-flash-tts --voice Achird
pitch motion tighten                                   # breaths out: pauses over 0.2s shortened
pitch motion align
pitch motion stock --mode search --query "open plan office, people at desks, overhead light" --orientation portrait
pitch motion stock --mode get --pick 4 --name office-wide
pitch motion footage --src uploads/stock/office-wide.mp4 --name office-1 --in 2 --dur 2 --focus 0.5,0.4
# … the other clips, then write shots.js with cues …
pitch motion sync --write                              # durations from the words
pitch motion check                                     # captions resolved, footage loaded
pitch motion music --duration 38.05 --drop_at 16.5 --prompt "<identity line + timestamped sections from the plan>"
                                                       # Lyria; its drop lands on "So we made"
pitch motion sound --prompt "Trailer riser, rising filtered noise, ending on a sharp cut" --duration 2.2 --influence 0.5 --out audio/generated-sfx/turn-riser.mp3
pitch motion sound --prompt "Short digital glitch, crunchy bit-crushed stutter" --duration 0.5 --influence 0.7 --out audio/generated-sfx/glitch.mp3
# … one call per distinct sound in the score, then audio/sfx-cues.json with "file" on each cue
pitch motion sfx --mode query --event "pop"               # fallback only: a generated take wrong twice
pitch motion sfx --mode build
pitch motion mix --duration 38.05 --music audio/music.mp3 --sfx audio/sfx_bus.wav
pitch motion review
pitch motion audit
```

`check` must report every caption phrase resolved and no footage issue;
`review` shows the exact frames the export will; `audit` passes with
`audio.pace: "ad"`.
