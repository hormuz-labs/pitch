# Source, plan and author

1. Explore the product independently with `pitch motion inspect <url>` and its
   returned links; use the product-research skill when unfamiliar with it.
   `pitch motion recon <canonical-url>` saves brand identity. Read those tokens,
   but design the scene yourself: a site's dense grid or dashboard is not the
   film layout. Use icon-library for familiar tools, and capture a real product
   detail only when needed (`pitch motion screenshot --url <url> --out <file>`).
2. Explore candidates from the skill's effect inventory before locking the
   storyboard. Compare their notes and frame strips; use `references/continuity.md`
   to plan connections between scenes.
3. For a narrated film, complete `references/audio/narration.md`'s script and
   recording steps before the shot table. Write a short `direction.md`:
   audience takeaway, visual idea, included content, treatment, chosen motion
   language/references and sound choice, then
   `id | focal visual/action | essential copy | duration | connection`.
   Describe the complete visible state; derive narrated shot timing from the read.
4. Before adapting selected implementations, read `references/effects.md` and
   `pitch effects show <id> --source`.
   Cite `lab` only for inspected implementations, with a distinct effect ID per shot.

## Implementation

- Query `pitch motion schema` for only the types/sections being used. Read
  common fields once; custom shots need `--section "custom shot types"`.
- `pitch motion scaffold` supplies the shell and a placeholder opener. Replace
  it with the treatment. Custom types live in `js/shots/<type>.js`, their styles
  in `css/shots/<type>.css`, registered with
  `Object.assign(window.ProjectShotFactories ||= {}, { "<type>": ... })`.
- Save complete shots and `pitch motion check` to keep the live preview running.
  Keep animation on the returned timeline, selectors scoped to the shot, and
  state changes in `tl.set`. Free-running animations and one-way callbacks break
  seeking. Repeats/stagger count: `.6D + .3D` with `repeat: 1` ends at `1.2D`.
- Compose for playback size, not a full-screen editor. Isolate useful product
  detail and remove unnecessary copy instead of enlarging every label.
- Make targeted edits instead of rewriting existing files. Batch decided
  commands with `&&`; reuse schema and reference material already in context.
  For invalid arguments, follow the tool's returned help. If host infrastructure
  is unavailable, report the blocker; do not fabricate measurements or results.
