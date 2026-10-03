# The effects library

`pitch effects` holds 444 studied motion pieces: type, logos, icons,
buttons, cursors, devices, counters, charts, cards, transitions, each a
working page with notes on how it is built. Films are built from it. A move
invented from nothing is the fallback, for a job no effect does.

## Choosing, in the storyboard

Search for what has to happen on screen, not for a look: `pitch effects
search "title rises through a mask"`, `--family text` for a row's words,
`--family icons` for an icon that does something. Each search returns six
candidates and one contact sheet of their frames; run every row's searches in
one shell call, read the sheets together, and write the chosen id in each row.
Edits reuse the ids already in `direction.md`.

- Every row's words arrive through a `text` effect, and no effect repeats in
  the next row; across a film, use the range.
- Effects combine: a text effect over a device effect, a counter inside a card.
- An effect's id is your note. Never put it in front of the user.

## Porting, in the build

`pitch effects show <id>` gives `port` (how it becomes a shot type), `adapt`
(what to change) and `caveats`; only now read its `page`, and rebuild it as
`js/shots/<type>.js`:

| In the effect | In the film |
|---|---|
| `fx.timeline({ duration })` | the timeline `animate(el, s, D)` returns; times become fractions of `D` placed on `s.beatTimes` |
| `fx.rng(seed)` | `ShotKit.rng(seed)` |
| `fx.register({ seek(t) })` | a proxy `{ t }` tweened on the timeline, drawn in `ShotKit.frameHook` |
| `fx.wait(promise)` | `ShotKit.ready(promise)` |
| placeholder copy, colours, fonts, images | `facts.md`, the brand tokens, the product's own screens |
| its loop and exit | the exit becomes the join to the next shot, or goes |

Keep what makes the move (its eases, staggers, overshoot, timing ratios);
change everything that is content. Selectors are scoped to `el`.
