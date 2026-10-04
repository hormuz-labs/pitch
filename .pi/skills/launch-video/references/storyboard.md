# Brief, idea and storyboard

Everything here goes in `direction.md` before any animation. The storyboard is
where a film is won: a weak plan built carefully is still a weak film.

## The brief

A few lines each:

- **For** — the product or feature, and the one thing the viewer should take away.
- **Watching** — who the viewer is and what they care about.
- **Then** — what they should do at the end.
- **Length and frame** — approximate runtime, `SHOTS.format`.
- **Brand** — the ground the film is set on (with the reason, if it is dark).
- **Sound** — the voice and its character (music only if the user asked); the bed, its tempo and drop from `pitch motion beats`.
- **Material** — uploads, screenshots, the site's own video frames, icons, and
  reference notes (`references/reference-video.md`).

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
transition". One of them is the moment someone would replay: the mechanism
made into a picture they have not seen before, landing on the biggest hit in
the music. If you cannot name three, or none would be replayed, the idea is
not there yet; a clean film without one is a slideshow.

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

| t | on screen | effect | for | leaves by | carries into next |
|---|---|---|---|---|---|

- **t** — the spoken words the row lands on, or bars of the bed (`bar 5`,
  `bar 7.3`) where no one speaks; these become the shots' `cue`s.
- **on screen** — the complete visible state, and the order the eye takes
  through it: what arrives first, what it leads to, what lands last. Under a
  spoken line, a picture of what it says; its key words arrive as said (`captions`).
- **for** — what the moment does for the viewer. A row without one goes.
- **leaves by** — the join: becomes the next thing, makes room, leaves piece
  by piece, pushes in, cuts on a match.
- **effect** — the library effects the row is built from (`references/effects.md`).
- **carries into next** — the object or match that crosses, or "new chapter".

Strong launch films change composition every 1.4–3.5s, and most of those
changes happen inside a continuous scene (pieces leaving, one becoming the
next, the camera moving on), not at a cut. A row is a composition; a new
shot is a new scene, and a bar of music is not a shot. A row lasts what it has to show and read — about
0.6s plus 0.3s per essential word, rounded to whole beats — counting every
word visible in the state and each internal state of a busy shot.

Show screens cropped to what matters, never the site's crowded layout as the
film's; familiar tools appear as their real marks (`pitch icons search`).

## Critique it before building

There is no second person here, so read the storyboard as the viewer, not as
its author. Cover the "for" column and read only "on screen":

- With the sound off, does a stranger know what the product does by the end?
- Do the three signature moments exist in the table, at the right weight, and
  would someone replay one?
- In every row, where does the eye land first, second and last, and what moves
  it there? On which beat does each new thing arrive?
- Does every row leave by something its elements do, and does each cut
  morph or match?
- Does anything on screen fail `facts.md`?
- Would the frame at t=0 make a good thumbnail?

Fix what fails in the table, then build.
