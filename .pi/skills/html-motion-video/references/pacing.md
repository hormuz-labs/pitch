# Pacing — why films feel lazy, and the reference that doesn't

The studio's philosophy in one line: **something new happens on screen at
least every ~1.2 seconds, and nothing ever just sits there.** A shot is an
entrance, a second act, and an exit — never an entrance followed by a hold.
`motion_audit` measures this; this note explains what it is measuring and
where the numbers come from.

## The reference: "Product Explainer animation — Replit" (37.5s)

Measured with ffmpeg (scene detection at 0.12, per-second mean frame
difference, 2 fps contact sheet):

| | Reference | Our short-launch film (before) |
|---|---|---|
| Length | 37.5s | 34.1s |
| Hard cuts | **1** | 5 |
| Distinct on-screen events | ~34 (one every ~1.1s) | 6 (one every ~5.7s) |
| Longest stretch with nothing new | ~1.5s | 4.75s |
| Shots that are entrance-then-hold | 0 | 6 of 6 |
| Persistent stage layer | yes (warm orange blur blobs, always drifting) | none |
| Text arrival | word by word, accent keyword pops | whole line, once |
| Layering | 3–6 elements overlapping per beat | 1 element per shot |

What the reference actually does, beat by beat:

1. **0–4s, the problem as a pile.** A browser window slides in, code types
   into it, then error toasts land one after another (five in ~2s), each
   slightly rotated, overlapping. The headline "Coding stops you from
   *launching* your startup?" assembles **word by word** on top of the pile.
2. **4–6s, the turn.** The pile blows away; "From now it **WON'T!**" — the
   accent word lands last and biggest, with a scale kick.
3. **6–10s, the reveal.** "Introducing / Replit" builds; orange squares
   drift in behind. "Give your *ideas* / Give your *design* / **LIFE!**" —
   three lines replacing each other every ~1s, sparkles punctuate LIFE.
4. **10–22s, the product.** The real UI enters **tilted in 3D**, a prompt is
   typed live, panels slide in, a preview pane appears, "Tweak your
   *changes*" and "When the website is *ready!*" are captions over UI that
   keeps changing (typing, panel swaps, zooms).
5. **22–32s, the payoff.** The finished site on a laptop, "That's it!",
   confetti-like sparkles, "You just gave / *life* to your idea", then "Bring
   thoughts into reality with Replit" — every line assembles word by word.
6. **32–37s, the mark.** The logo animates in and holds for the end card;
   the stage keeps drifting even here.

Nothing is cut. Elements **exit** (fly, scatter, scale away) while the next
ones **enter**, on one continuous stage. The energy comes from *density and
layering*, not from speed: individual moves are 0.3–0.6s with expo/back
eases; there are simply many of them.

## Why our film was lazy — the mechanics

- **Narration set the durations, one clip per shot.** Six VO lines → six
  5–6s shots (`dur = voDur + 0.8`), each clip a fresh TTS call that restarts
  its intonation, each followed by ~1s of dead air. Measured on the first
  re-narrated film: 14 clips, 14 restarts, 0.5–1.2s of silence after every
  line — the "robotic" sound. The fix is structural: record the WHOLE script
  as one read (one breath, one arc), time its words (`align.mjs`), and cut
  the picture to them (`cue` + `sync.mjs`). The same film re-cut that way:
  one 31s read, 15 shots averaging 2.1s, every shot landing 0.1–0.2s before
  its word, no silence longer than a 0.6s breath.
- **Every factory was entrance-then-hold.** All motion finished in 0.5s; the
  remaining 4.5–5.8s was the compiler's slow drift.
- **Drift fooled the old audit.** A 4.5% scale over 5s changed enough pixels
  per second to pass the static-hold check, so a film that held still for
  85% of its runtime passed the gate.
- **No stage.** Solid backgrounds with one element centered in 1920×1080 of
  empty space. The reference never has empty space: blobs, sparkles, the
  pile, the previous element leaving.

## The engine's answer (use all of it)

| Reference trope | Engine feature |
|---|---|
| Warm drifting stage | `ambient: { kind: "blobs", color: "accent" }` (top level) |
| Word-by-word type with the accent word landing last | `word-build`, or `reveal: "words"` + `accent: true` on `word-cut` / `color-punch` |
| Lines replacing each other every ~1s | `word-build.lines`, `overlay-type.lines` |
| Chaos pile of toasts/windows, then blown away | `pile` |
| Notifications stacking | `device-notif.more` |
| Elements leaving as the next arrive | `motion.exit` / `shot.exit` (`up`, `scale`, `scatter`) |
| A kick on the beat, a flash, a shake | `beats: [{ kind: "kick" | "flash" | "shake" }]` |
| Caption swapping over the same visual | `beats: [{ kind: "swap", text }]` |
| Live UI with a target and a click | `ui-frame` with `focus` + `cursor` (+ `cursor.then`) |
| Number rolling | `stat-counter` |
| Scramble decode, physics scatter, path fly-in | custom factory + ScrambleTextPlugin / Physics2DPlugin / MotionPathPlugin (registered by the compiler) |

## The numbers the gate enforces

| Rule | Limit | Why |
|---|---|---|
| Shots | 8–16 | Fewer means ideas are being stretched, not cut |
| Average shot length | ≤ 3.4s (aim 1.5–2.8s) | The reference averages ~1.1s per event |
| Type / brand beat | ≤ 3.2s | Longer than that, no second act can save it |
| `ui-frame` | ≤ 6s | And it needs a `focus` or `cursor` |
| Narration | one continuous read, every shot `cue`d, drift −0.35…+0.15s | Per-shot clips fail the audit |
| Longest quiet stretch (drift and ambient off) | ≤ 1.5s | The philosophy, measured |
| Events per second (whole film) | ≥ 0.7 | Floor; good films run 2–4 |
| Hook | first shot ≤ 3s | The first 3 seconds are designed, not held |

When a shot fails, the fix is one of: add a beat, add a line, add `more`, add
a pile item, add a cursor — or cut the shot. Never lengthen.
