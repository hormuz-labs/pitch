# Brief, idea and storyboard

Everything here goes in `direction.md` before any animation. The storyboard is
where a film is won: a weak plan built carefully is still a weak film.

## The brief

A few lines each:

- **For** — the product or feature, and the one thing the viewer should take away.
- **Watching** — who the viewer is and what they care about.
- **Then** — what they should do at the end.
- **Length and frame** — approximate runtime, `SHOTS.format`.
- **Brand** — colours, type and logo from `recon/brand-tokens.md`, and the
  ground the film is set on (with the reason, if it is dark).
- **Facts** — `facts.md`; the only source for anything on screen.
- **Material** — uploads, screenshots, the site's own video frames, icons.
- **References** — the notes from `references/reference-video.md`, if any.

When a consequential fact or file is missing and the site cannot give it, ask
once (logo files, the real numbers, a product recording). Otherwise decide and
keep going; delegated direction is yours.

## The idea comes from the mechanism

A film looks generic when its maker understood the product thinly. Start from
what the product does, not from a look:

| The product… | A film can show… |
|---|---|
| turns an input into an output | the input travelling in and leaving changed |
| collects scattered things | many things converging into one ordered result |
| finds something | the search narrowing, the find landing |
| replaces a painful step | the old way stalling, then the same step done in one move |
| connects tools | the product's object passing between their marks |
| scales | one becoming many, close becoming wide |
| answers a question | the question cut directly to its answer |

Then choose the **carried object**: something the product actually works with
(a file, message, card, row, cursor, its mark) that can cross scenes and change
role. Write where it starts, what it becomes, and where it leaves. A film may
change subject between chapters; never invent an ornament to fill a gap in
the chain.

## Signature moments

Name three moments a viewer would describe afterwards, in plain words and
without effect names: "the invoice folds itself into the email", not "a morph
transition". If you cannot name three, the idea is not there yet.

## Show the directions

For a new film, unless the user has already described it or handed you the
decision ("you decide", "Let Pitch choose", "just make it"), let them choose
between two or three directions before you storyboard one. Most users cannot
name the film they want; they can recognise it.

- Each direction is a different idea from the mechanism, not the same idea in
  three palettes. Every one uses the brand's measured colours and type.
- Give each one a still of its **opening frame**: a static page at the film's
  size, `directions/<a|b|c>.html` (the stills land on the asset shelf), using the brand fonts and colours from
  recon, then capture them all in one call:
  `pitch motion screenshot --html directions/a.html --out directions/a.png --width 1920 --height 1080 && …`.
  Look at each still; it has to be a frame you would be proud to open on.
- Ask with one `ask_user` question: per direction, `label` is the idea in a
  few plain words, `hint` one line on what the viewer sees, `image` its still,
  and `details` its three signature moments. Write for someone who is not a
  motion designer: no craft words (kinetic, glow, cinematic, slam). Put your pick first with the reason
  in `intro`, then end the turn.

The chosen still is frame one's target; the others stay in `directions/` and
are not built.

## The storyboard

One table:

| t | on screen | for | leaves by | carries into next |
|---|---|---|---|---|

- **on screen** — the complete visible state, including what leads.
- **for** — what the moment does for the viewer. A row without one goes.
- **leaves by** — how it exits: becomes the transition, cuts on a match,
  pushes in, clears.
- **carries into next** — the object or match that crosses, or "new chapter".

Strong 30-second launch films turn over about 12–15 compositions, each on
screen 1.4–3.5s; that turnover is much of why they feel alive. It is a
description, not a quota. Each row's length comes from what it has to show and
read: about 0.6s plus 0.3s per essential word, plus a beat for the eye to land.
A sequence of single words can run faster; a number, an unfamiliar name or a UI
action needs longer. Count every word visible in the state, not just the new
ones, and count each internal state of a busy shot separately.

Composition, row by row:

- What leads fills the frame; vary close, wide, overhead and full-frame type.
- Read the column of layouts top to bottom: two neighbouring rows with the same
  layout is one too many.
- Show the product's own screens cropped to what matters, never a whole
  interface at thumbnail size, and never the site's crowded layout as the film's.
- Familiar tools appear as their real marks (`pitch icons search`).

## Critique it before building

There is no second person here, so read the storyboard as the viewer, not as
its author. Cover the "for" column and read only "on screen":

- With the sound off, does a stranger know what the product does by the end?
- Do the three signature moments exist in the table, at the right weight?
- Does every row leave by something, and does each cut either carry or match?
- Does anything on screen fail `facts.md`?
- Is any row decoration: motion that shows nothing changing?
- Would the frame at t=0 make a good thumbnail?

Fix what fails in the table, then build.
