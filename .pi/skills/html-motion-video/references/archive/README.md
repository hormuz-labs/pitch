# Archived reference

`effects-catalog.md` is a pattern library from the earlier hand-built pipeline,
kept for one purpose: writing a project-local shot type in `js/shots.custom.js`
when a beat needs something the engine lacks. Lift an idea — a text treatment,
a counter, a card deal, a match cut — and re-implement it as a `mount`/`animate`
factory on the returned timeline.

Nothing here is a workflow instruction. `architecture.md` and
`scene-transitions.md` used to sit beside it and were deleted: they described
the dead multi-file pipeline (`js/scenes/sceneN.js`, `js/master.js`) down to an
`index.html` that contradicted the current one, and the engine owns scene
transitions now (`cut`, `motion.exit`). Nothing referenced either of them.

The determinism rules in `motion_schema({ section: "rules" })` still apply to
anything you borrow.
