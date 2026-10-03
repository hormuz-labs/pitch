# Critique and finish

The builder is the worst judge of its own film: it sees what it meant, not what
is on screen. There is no second critic here, so each round you become one.
Look at the frames **before** re-reading `direction.md`, and judge the sheet,
not the intention.

## A round

1. **Measure.** One `pitch motion audit` of the whole film (timeline validity,
   seek determinism, narration alignment, still stretches, notes) and one
   `pitch motion review --per_shot 2 --times '[0, …]'`: frame one, plus a few
   moments just before, during and after each signature transition and each
   carry or match. Read each sheet once.
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
- **The signature moments:** are they there, and do they land as planned?
- **Joins:** does each carried object land on its handoff box? Does each cut
  carry or match, or does it read as an accidental restart?
- **Frame one:** a finished composition, good enough as a thumbnail.
- **Sameness:** the same layout in neighbouring shots; web-page type (a small
  kicker over a big gradient headline) where the film needed a picture.
- **Reading:** essential text at 4.5:1 contrast or better, stable while read,
  large enough on a phone.
- **Brand:** the ground and colours match recon; 3D grounds match by pixel.

Defects that pass every automatic check and still get films rejected:

- A wipe that splices two titles into one word: the outgoing title leaves
  before the wipe, the incoming one enters after it.
- A card or panel that goes blank between states: crossfade its contents in place.
- Text travelling through other text during a move: fade out, then in at the
  destination.
- An overlay that drifts off its anchor because its parent has a slow push:
  give the overlay the same push.
- A label that names the wrong thing, often one tween targeting two variants.
- Rows and lists with unequal spacing or ragged left edges.
- A dark or empty first image, or a lone element on an empty field.
- Motion bolted onto a finished shot (pulses, kicks, shakes) that shows nothing.
- A click that lands beside its button: sample the frame of the click.
- A logo that is not the product's file: a redrawn or approximated mark.

## The audit's numbers

The audit samples every 0.25s and counts a pair of samples with enough changed
pixels as an event. That is not a semantic event: a continuous move counts
several times, a small but important UI change may not register. Its notes
(still stretches, event rate) never fail a film. For a flagged stretch, ask:

- Is the viewer reading, anticipating or taking in a payoff? Keep it.
- Has the action finished and attention gone nowhere? Tighten the shot, change
  its composition, or develop the idea.

A frozen screen reads as a stall, and strong films rarely hold still longer
than reading needs. Never add a pulse, shake, flash or extra word just to move
the count. ❌ items (rendering errors, non-determinism, narration contract) are
broken and must be fixed.

## Done

The film is done when the latest round says ship:

- no frozen stretch beyond what reading needs;
- frame one is a finished composition;
- essential text meets 4.5:1 contrast; nothing collides with or travels
  through other text;
- the ground and brand colours match recon, including in 3D;
- a stranger understands it with the sound off;
- set beside the references (or the principles, without any), it does not look
  weaker.

Then sound (`references/audio.md`; narration was recorded before building).
Report the actual runtime, the critique rounds in one line each, what you
measured, and what still needs a person to watch or listen to. Then stop. The
user exports the MP4: do not render a review copy, and run the paid film review
(`pitch media review --purpose film`) only when the user asks.

## Edits

A cosmetic change keeps timing. Retiming an action updates the cues and sound
that depend on it. Re-check only what the change touched; an audio-only edit
needs `pitch motion mix`, not a visual audit.
