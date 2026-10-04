# SaaS text animations

Twenty-one headline animations built on the text moves SaaS launch videos
lean on in After Effects and motion design: blur in by word, fade up
characters, tracking in, decoder, typewriter, 3D flip, linear wipe, light
sweep, scroll-read highlight, kinetic slam, word drum, text cube, inline media
pills and marquee tape. They are original DOM implementations of those ideas;
no preset files, expressions or numbers are copied.

| Effect | Idea | Theme |
|---|---|---|
| `blur-rise-words` | Blur In by word | dark |
| `fade-up-characters` | Fade Up Characters | light |
| `mask-line-reveal` | Slide Up by line with track matte | light |
| `tracking-in` | Tracking In Long | dark |
| `typewriter-caret` | Typewriter, plus select-and-retype | light |
| `decoder-scramble` | Decoder Fade In | dark |
| `word-rotator` | Rolling word swap | light |
| `word-wheel` | 3D word drum with weighted turns | light |
| `text-cube-rotate` | Words on a rolling 3D prism | dark |
| `highlight-sweep` | Marker highlight with track matte | dark |
| `reading-highlight` | Scroll-read paragraph highlight | dark |
| `inline-media-pill` | Media pills opening inside a headline | light |
| `flip-in-3d` | 3D Flip In Rotate X | dark |
| `spring-pop-words` | Pop / bounce in by word | light |
| `kinetic-slam` | Kinetic type slams with camera shake | dark |
| `shine-sweep` | CC Light Sweep | dark |
| `strike-replace` | Strikethrough, then replace | light |
| `number-roll` | Odometer counter with motion blur | light |
| `focus-pull` | Lens blur rack focus | dark |
| `gradient-wipe-reveal` | Linear Wipe with feather | light |
| `marquee-bands` | Crossing marquee tape | dark |

## Palette

Every page starts with the same tokens: `--bg`, `--surface`, `--ink`,
`--muted`, `--accent`, `--accent-2` (plus `--on-accent`, and `--positive` /
`--negative` where a page needs meaning). Everything else is derived with
`color-mix()`; colours used by canvas or GSAP colour tweens are resolved from
the same tokens at load. Changing those six values re-brands the effect. The
default is a neutral house look (warm paper or ink, a signal-orange accent),
not a brand.

## Motion rules

The curves are the Flow set (`effects/flow-easing`), named by their Flow
coordinates in each page.

- **Entrances** that move a thing that is still invisible may start fast
  (Flow quintOut / expoOut). Opacity always starts from rest: it is a separate
  soft tween, or the whole tween uses `softOut` (0.2,0,0,1).
- **Exits** may accelerate away, but opacity eases out to zero
  (`power2.inOut` or a smoothstep), so nothing vanishes at full speed.
- **Overshoot** uses a damped spring or a true back function, which come to
  rest with zero velocity. A four-point bezier "back" is still moving on its
  last frame, so it is not used for anything that has to land still.
- **Nothing reflows by accident.** Measured layouts (rotator widths, decoder
  boxes, caret, drum radius) are built after `document.fonts.load`. Authored
  lines keep inline pills from re-wrapping words.
- **Seek-safe and looping.** Everything is a function of `t`; every effect
  starts and ends on an empty stage.

## Verification

Each effect is rendered at 30fps and checked frame by frame. The pop check
looks for single-frame spikes. The easing audit flags any move whose first
or last frame carries more than 40% of that move's peak speed, which is
what an abrupt start or stop looks like. The deliberate exceptions are the
kinetic slam's impacts, the decoder's glyph ticks and the typewriter's
keystrokes.

## Sound

Every effect calls `fx.sfx([...])` with cues in the film cue-sheet format
(`{ t, event, clip?, dur?, align?, label }`, the vocabulary of
`.pi/scripts/launch-video/sfx.mjs`).

The sounds are the **Pitch SaaS pack**: 29 clips generated with ElevenLabs
(`eleven_text_to_sound_v2`) for these effects. The set covers glitch accents,
deep sub-heavy whooshes, crisp clicks and key presses, typing, a decode
scramble, an odometer roll, a data stream, a shimmer, network pings, a layer
lift, a particle swarm, risers and impacts. Its spec, with every prompt, is
`.pi/scripts/launch-video/data/sfx-packs/pitch-saas.json`. To regenerate it:

```sh
node scripts/sfx-generate-pack.mjs --pack=pitch-saas
node scripts/sfx-add-pack.mjs --pack=pitch-saas
```

Generation only fills missing files, so re-runs spend no credits. Effect
renders prefer this pack. Signature moments name their clip, such as the
decoder's scramble, the odometer roll, the shimmer, pings and the particle
swarm; other cues pick from the pack with variety. The sub-drop is Gakuyen's
analog synth hit, because the model rendered every generated drop as a drone.

`node effects/render.mjs` builds the cues through the film SFX planner. The
planner places each sound by its measured hit, levels it, and refuses smeared,
overlong or badly levelled cues. The build muxes the result into `render.mp4`
and writes `sfx.m4a` (the preview plays it) and `sfx.json` (the cue sheet a
film reuses, offset by the shot's start) beside the page. Each cue was checked
in isolation; clicks and pings land within 10ms of their beat.

Previews play sound by default once the browser allows it, which takes one
click on the page. In the FX review app, any click in the review UI starts
the current preview. In the gallery grid, the card under the pointer plays.
