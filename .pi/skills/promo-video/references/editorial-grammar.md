# Editorial grammar for a cinematic manifesto promo

This is a transferable study of the supplied reference, not a request to reuse
its footage, words, voices, score, logos, or exact edit. The measured reference
is 127.27 seconds, 1920×1080, 16:9, and approximately 60 fps.

## Reference signature

The film behaves like a spoken visual essay. Human observation and craft are
intercut with macro nature, particles, eyes, circles, scientific diagrams,
archives, exploration, and cosmic scale. The brand appears only after the thesis
has resolved. Picture illustrates associations rather than narrating every noun.

| Reference span | Editorial job |
|---|---|
| 0:00–0:11 | Low-light human hook, first question, particle/circle ignition |
| 0:11–0:19 | First acceleration: monochrome spectacle and flash-cut fragments |
| 0:19–0:35 | Grounded inquiry: making, observing, nature, people, short copy |
| 0:35–0:43 | Second acceleration: particles, organic macro, diagram overlays |
| 0:43–0:50 | Near-black graphic bridge; tiny type and thin-line construction |
| 0:50–1:03 | Eye/organism/particle motif chain with a rapid peak near its end |
| 1:03–1:16 | Cosmic rise, wonder, and saturated magenta/blue energy |
| 1:16–1:19 | Abrupt black reset, then one oversized keyword over archival image |
| 1:19–1:44 | Exploration montage: digital, lunar, human, technical overlays |
| 1:44–1:57 | Reflective human/cosmic payoff, ending on Earth-scale imagery |
| 1:57–2:07 | Black field, logo, short imperative, production credit, audio tail |

Borrow the alternation of pressure and release, not these exact timestamps.
Scale phases proportionally to the requested runtime and omit phases that do not
serve the thesis.

## Picture and composition

- Base palette: black, charcoal, silver, desaturated teal, and pale skin tones;
  reserve one luminous accent family such as violet/magenta for discovery peaks.
- Favor a single readable silhouette, face, hand, eye, object, or phenomenon per
  frame. Use deep negative space and occasional letterboxing inside the canvas.
- Move between scales: microscopic → human → planetary. Connect them with a
  shared form or motion, especially circles, irises, rings, spheres, and tunnels.
- Mix tactile footage with designed abstraction. Thin white diagrams, orbits,
  labels, and measurement marks may sit over footage, but should feel authored
  for the subject rather than like a generic HUD pack.
- Let monochrome archival imagery contrast with contemporary color footage.
  Use grain, halation, chromatic separation, or scan texture as a coherent layer,
  not a different filter on every shot.
- Do not show a literal product screen merely because the brand is technical.
  Include it only if the thesis reaches a real action or result.

## Typography

- Most copy is one short spoken fragment in a small, bold or medium white sans,
  centered with generous black around it. It acts as a thought marker, not
  subtitles for every line.
- Use sentence case for questions and connective phrases. A single uppercase
  keyword may become nearly frame-wide at the structural reset.
- Reveal text cleanly or with a restrained one-frame/chromatic echo. Hold long
  enough to read at playback size. Avoid typewriter animation and paragraph cards.
- End cards are quieter and smaller than the montage: logo, one-line imperative,
  then optional production credit, each separated by black and an audio tail.

## Rhythm, motion, and transitions

- Reflective shots commonly hold 2–5 seconds. Acceleration bursts may contain
  3–8 flashes or whole-frame changes across roughly 0.4–1.2 seconds, followed by
  a stable landing. Constant rapid cutting destroys the contrast.
- Cut on a spoken stress, musical attack, or completed movement. Let room tone,
  score, or a riser bridge unrelated pictures so the idea remains continuous.
- Prefer hard cuts, match cuts, black/white flash frames, dip-to-black, and
  occasional additive particle or light transitions. Avoid a menu of wipes.
- Match by form, direction, or scale: iris → planet, hand-held insect → organic
  macro, circular instrument → orbit, tunnel → pupil. Preserve the focal point
  across the cut so the eye does not search.
- Use slow pushes, parallax, particulate drift, and line drawing during holds.
  Save shake, zoom punches, chromatic splits, and dense strobing for brief peaks.
- Treat flashes as an accessibility risk. Keep them sparse, avoid sustained
  high-contrast flicker, and replace any effect that makes the sequence hard to
  watch or fails the studio's checks.

## Audio architecture

The reference waveform is nearly continuous and dense, with a pronounced energy
dip/reset around 60% of runtime and a gradual fade through the final 8%. Its
measured master is about -8.4 LUFS integrated, 5 LU loudness range, and reaches
approximately +1 dBTP. Those are observations, not targets: do not reproduce
the true-peak overs or crush the mix to match perceived loudness.

- Build around an intelligible spoken essay. Use natural pauses and allow a few
  visuals to land without new words; avoid wall-to-wall slogan copy.
- Choose a cinematic bed with an evolving low foundation, restrained pulse,
  rising harmonic or textural layers, and a real final tail. Keep spectral room
  for the voice rather than simply lowering a busy master.
- Use sub impacts, reverse swells, soft whooshes, granular textures, and one or
  two bright transient signatures at structural turns. Do not sound every cut.
- Duck and trim through the launch audio mixer. Verify the actual mix; keep true
  peaks within the delivery limit and treat the end-card fade as part of the film.

## Originality and review

- Preserve the user's facts and brand voice. Write an original thesis and source
  original or cleared media; similarity should live in pacing, composition,
  motif logic, and sound architecture.
- On the settled-frame review, verify a clear focal subject, controlled palette,
  readable micro-copy, coherent motif recurrence, and a quiet end card.
- Sample each acceleration burst at multiple times. Confirm that flashes resolve
  into intentional images, the focal point remains stable, and transitions do
  not become random stock montage.
- If the film still works with shots shuffled, the argument is too weak. Fix the
  spoken progression or motif handoffs before adding more effects.

## Building it here

- **Frame**: `format` 16:9, as the reference.
- **The spoken subtitles**: the reference builds each thought word by word in
  small, centred white type ("What" → "What we're looking for" → "…how
  everything works"), cleared when the thought ends. That is the `captions`
  track with `stack: "line"`:
  `style: { stack: "line", size: 0.03, weight: 500, case: "none", align: "center", pos: "center", margin: 0.25, shadow: false }`.
  Caption the thesis sentences, not every word; one word per thought may take
  `fx: "accent"` in the film's single accent colour.
- **The giant keyword** at a structural reset: one phrase with `size` 0.2–0.28,
  `weight` 800, `case: "upper"`, `enter: "blur"` (or `fx: "glitch"` over
  archival grain), `hold` 1–1.5s. Two or three in a film, never more.
- **Footage**: licensed or public-domain archival and stock through
  [footage.md](footage.md); `look: "mono"` or `"mono-hard"` for archive
  against colour for the present; montage bursts as `footage` `clips` at
  0.1–0.15s with a one-frame `flash`; holds of 2–5s with `push` 1 → 1.06.
- **Match cuts on the motif**: prepare both clips with `--focus` on the shared
  form (the iris, the planet, the ring) so it lands in the same place of the
  frame, then cut hard.
- **Thin-line diagrams** (orbits, labels, measurement marks): a project type
  drawing SVG with DrawSVG on the timeline; the `signal` recipe in
  [recipes.md](recipes.md) is the pattern for a canvas line.
- **Sound**: the voice as one continuous read (or a documented collage of
  cleared speech); a bed with a real breath at ~60% of the runtime (a `breath`
  beat, `depth` 0.8+); an optional `ring` under the most tense line.
- **End card**: `logo-sting` with the brand's own logo on black, then a
  `card` with the imperative as a caption phrase, then the audio tail.
