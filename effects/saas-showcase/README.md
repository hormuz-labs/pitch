# SaaS showcase moments

Fifteen hero-grade product moments for SaaS films. Each is a complete, polished
beat rather than a single property tween: an interaction with a payoff.

| Effect | Moment | Theme |
|---|---|---|
| `command-palette` | ⌘K → filter → arrow keys → Enter → toast | dark |
| `ai-stream-answer` | thinking shimmer, token streaming with a glowing caret, chart build | dark |
| `product-tilt-reveal` | product window flattens from a 64° lean under a bloom | dark |
| `beam-border-card` | constant-speed light beam around a card border | dark |
| `particle-text-form` | particles spiral into the headline, resolve to crisp type | dark |
| `integration-orbit` | depth-sorted orbiting integrations with data pulses | dark |
| `pricing-toggle` | cursor flips Monthly→Yearly, prices roll like an odometer | light |
| `kanban-drag` | card lifts, leans with velocity, reflows columns, springs home | light |
| `spotlight-grid-reveal` | flashlight cursor reveals the page, then the lights come up | dark |
| `chart-scrub` | area chart draws on, a hairline scrubs with a live tooltip | dark |
| `cursor-flythrough` | glossy 3D pointer swoops in, banks, hovers, clicks, flies off | light |
| `shape-wipe-transition` | accent disc wipe between two scenes and back | light → dark |
| `step-progress` | onboarding stepper: fills, sprung checks, panel handover | light |
| `exploded-ui-layers` | product screen splits into labelled 3D layers and reassembles | dark |
| `network-globe` | dotted planet, routes drawing on between cities, live counter | dark |

Colours come from six palette tokens at the top of each page, and the motion
rules (soft opacity onsets, exits that ease to zero, overshoots that land at
rest, Flow curves) are the same as in `saas-text/README.md`. Further craft rules:

- Every frame is a function of time. Use GSAP timelines with derived state
  painted in a timeline `onUpdate`, or a pure `draw(t)`. Cursors, typing,
  token streams and drags are computed, never stepped, so a backward seek or
  a loop restart is exact.
- Motion is physical. Cursors travel eased, sideways-bowed paths. A dragged
  card's tilt comes from its velocity. Toggles and drops settle on springs
  with a single overshoot.
- Nothing reflows by accident. Streamed tokens, price digits and list rows
  are laid out up front. Any reflow is an intended height tween.
- Every effect starts and ends on its opening frame.

Verification: each was rendered at 30fps, diffed frame by frame for jumps and
run through the easing audit (no move may start or stop at more than 40% of
its peak speed). Each was also reviewed on a contact sheet, and re-branded
with only the six tokens changed to prove the palette drives everything.

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
