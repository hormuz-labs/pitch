# Custom shot types — when the engine lacks a look

Lifted out of SKILL.md: most films never add a type, and this used to be read
into every one of them.

Add `js/shots.custom.js` defining `window.ProjectShotFactories` (schema.md
"Custom shot types"). `window.ShotKit` gives you `h`, `qs`, `splitChars`,
`mixedLine`, `rng`, `EASE`. `references/effects-catalog.md` is a pattern library for this: text treatments,
counters, card deals, match cuts — re-implemented as a `mount`/`animate` pair.

Invariants for any factory:
1. Everything on the returned timeline — no CSS animations/transitions, no
   bare `gsap.to`, no `gsap.ticker`, no `Math.random()` (use `rng(seed)`).
2. Selectors scoped to the shot's `el`.
3. **Anti-flicker:** no infinite `yoyo` on opacity, brightness, glow or
   `box-shadow`. Light sweeps are one-shot accents, max 2–3 per film.
4. No `filter: blur()` on background-clipped text; `display: inline-block` on
   any `-webkit-background-clip: text` element.
5. Null tween targets crash the build — guard optional elements.
6. Text swaps stay on the timeline (`tl.set(...)`), never in callbacks.
7. **Time everything as fractions of `D`** (`D * 0.4`), never absolute
   seconds. A shot lasts exactly its `dur` — the compiler pins the next cut
   there and compresses a longer factory timeline to fit (the audit reports
   it; > 1.6× fails). With narration, `dur` comes from the words, so a
   factory hard-coded to 3s will be rushed in a 1.7s cue interval.
