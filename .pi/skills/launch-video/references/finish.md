# Critique and finish

The builder is the worst judge of its own film: it sees what it meant, not what
is on screen. There is no second critic here, so each round you become one.
Look at the frames **before** re-reading `direction.md`, and judge the sheet,
not the intention.

## A round

1. **Measure.** One `pitch motion audit` of the whole film; read both sheets
   it writes (a frame a second, and `look.jpg`, the moments to judge). Then
   one `pitch motion review --times '[…]'` around each signature transition
   and each morph or match; `pitch motion look --at` names a frame's elements.
2. **List the problems, ranked,** each with its timestamp, in `critique.md`:
   biggest first. End the list with **ship** or **one more pass**.
3. **Fix the biggest first.** Batch fixes that touch different shots, then
   re-check only the affected shots (`--shots`, plus `--times` on the changed
   transition).
4. **Re-check every earlier item** as fixed, partly fixed or still there, and
   look for anything the fixes broke.

`critique.md` is the ledger: per round, what was found, what changed, and the
numbers before and after (audit notes, still stretches, contrast). It is what
lets a later round, or a person, see the film converge.

## What to look for

On the sheets, in this order:

- **Sound off:** does a stranger understand what the product does by the end?
- **The signature moments:** are they there, do they land as planned, and is
  one worth replaying?
- **The eye:** in each shot, name what it lands on first, second and last. A
  shot where everything arrives together, where something appears and only
  then moves, or where the frame freezes, is not finished. Does each arrival
  land on its beat?
- **Joins:** do the elements make each join, with the frame never moving as
  a page? Does each cut morph or match, or read as an accidental restart?
- **Frame one:** a finished composition, good enough as a thumbnail, never a
  word halfway through flying in.
- **Sameness:** the same layout or text entrance in neighbouring shots; web-page
  type (a small kicker over a big headline) where the film needed a picture.
- **Reading:** essential text at 4.5:1 contrast or better, stable while read,
  large enough on a phone.
- **Brand:** the ground and colours match recon; 3D grounds match by pixel.

Defects that pass every automatic check and still get films rejected:

- A card or panel that goes blank between states: crossfade its contents in place.
- An overlay that drifts off its anchor because its parent has a slow push:
  give the overlay the same push.
- A label that names the wrong thing, often one tween targeting two variants.
- Rows and lists with unequal spacing or ragged left edges.
- A dark or empty first image, or a lone element on an empty field.
- A click that lands beside its button: sample the frame of the click.
- A logo that is not the product's file: a redrawn or approximated mark.

## The audit's numbers

The audit counts changed pixels every 0.25s: a continuous move counts several
times, a small UI change may not count at all. Its still-stretch and event-rate
notes never fail a film, but each flagged stretch is a question: is the viewer
still reading? If not, the eye has nowhere to go; give it the next thing, on
the next beat. ❌ items (rendering errors, non-determinism, a shot off its word
or beat) are broken and must be fixed.

## Done

The film is done when the latest round says ship:

- no frozen stretch beyond what reading needs, and every new thing lands on
  its beat or word;
- frame one is a finished composition;
- essential text meets 4.5:1 contrast; nothing collides with or travels
  through other text;
- the ground and brand colours match recon, including in 3D;
- a stranger understands it with the sound off;
- set beside the references (or the principles, without any), it does not look
  weaker.

Then mix (`references/audio.md`).
Report the actual runtime, the critique rounds in one line each, what you
measured, and what still needs a person to watch or listen to. Then stop. The
user exports the MP4: do not render a review copy, and run the paid film review
(`pitch media review --purpose film`) only when the user asks.

## Edits

A cosmetic change keeps timing. Retiming an action updates the cues and sound
that depend on it. Re-check only what the change touched; an audio-only edit
needs `pitch motion mix`, not a visual audit.
