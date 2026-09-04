# Archived references

These documents describe the earlier **hand-built multi-file pipeline**
(`js/scenes/sceneN.js`, `js/master.js`, cursor and focus controllers, bridge
transitions). Videos are now `shots.js` shot lists compiled by `../../engine/`,
so nothing here is a workflow instruction any more.

They remain as a pattern library for one purpose: writing a project-local
shot type in `js/shots.custom.js` when a beat needs something the engine lacks.
Lift an idea (a text treatment, a counter, a card deal, a match cut) and
re-implement it as a `mount`/`animate` factory on the returned timeline. The
determinism rules in `engine/schema.md` still apply to anything you borrow.
