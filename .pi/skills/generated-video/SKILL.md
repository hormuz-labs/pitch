---
name: generated-video
description: Generate footage that does not exist — establishing shots, textures, metaphors, abstract transitions, B-roll — with the video_generate tool (Gemini Omni). Read this before generating anything: it says when generated footage is the right answer and when it is the wrong one, how to write a shot prompt, and how to get a clip into a film without paying for it twice.
---

# Generated video

`video_generate` makes a clip that has never been filmed. One call, one
prompt, one file in your workspace. It is the only tool in the studio that
invents footage; everything else renders something that already exists.

- **~10 seconds** per clip, **16:9 or 9:16**, 360p / 720p / 1080p / 4k.
- **It generates its own audio** — ambience, foley, sometimes speech.
- Roughly **30 seconds to generate at 360p**, longer as resolution climbs.
- Every clip is billed to the user, and a 1080p clip you throw away costs
  the same as one you keep.

## When this is the right tool

Reach for it when the shot has no source in the real world and no source in
the product:

- an establishing shot — a city at dawn, a desk before anyone arrives
- a texture or backdrop a title sits on
- a metaphor the narration is making — "the tide going out", "a lock opening"
- an abstract transition between two product sections
- B-roll the user does not have and cannot film

## When it is the wrong tool — this matters more

**Never generate the product.** The model invents plausible-looking UI:
buttons that do not exist, copy nobody wrote, a logo that is nearly right.
A film that shows fictional software is worse than no film, and the user
will not always notice before their customers do.

| The shot is | Use |
|---|---|
| the product's own UI, pages, dashboards | `motion_*` (launch film) or `demo_*` (real recording) |
| the product's logo, brand marks, screenshots | `motion_harvest` — the real asset |
| a chart, a number, a claim | the deck builder, from figures you can source |
| a person who exists, a customer, a founder | nothing — do not generate people who are meant to be real |
| anything the user uploaded | the file they gave you |

If you catch yourself writing a prompt that describes a screen, stop: that is
the wrong tool for that shot.

## Writing the prompt

The prompt is the whole craft. Write it like a shot in a treatment, not like
a search query. Cover, in this order:

1. **Subject** — one clear thing. Two is already a crowd.
2. **Action** — what changes over the ten seconds. A shot where nothing
   happens looks like a broken still.
3. **Camera** — the move and the framing: slow push in, locked-off wide,
   handheld tracking, overhead.
4. **Lens and light** — 35mm, shallow depth of field, backlit, overcast,
   single practical lamp.
5. **Mood and grade** — muted, high-contrast, warm, clinical.

There is **no negative-prompt field**. Say what you do not want in the prompt
itself: "no text, no logos, no people".

> A single glass marble rolling slowly across a dark walnut desk, left to
> right. Locked-off macro shot, 60mm, shallow depth of field, one warm
> practical light from the right, deep shadows. Calm and deliberate. No text,
> no logos, no people.

Ask for text in the frame only if you are prepared to check it: generated
lettering is usually misspelled. Prefer to add titles yourself afterwards.

## Cost discipline

1. **Draft at 360p.** It is fast and cheap, and it tells you whether the
   composition and the motion are right — which is what usually goes wrong.
2. **Look at it.** `media_probe` it, and read a frame if you need to
   (`media_ffmpeg` can pull a still).
3. **Refine with `continues`**, not from scratch: pass the clip path you
   generated and make the prompt the *change* you want ("same shot, slower
   push, colder light"), rather than describing the whole shot again.
4. **Only then re-generate at 1080p** with the prompt you settled on.

Do not generate three variations and pick one. Generate one, look, refine.

## Getting the clip into the film

The clip lands wherever you asked, usually `renders/`. It is an ordinary MP4
from that point on, so the media tools own the rest:

- **Its audio will fight your mix.** A generated clip arrives with its own
  ambience. If the film has a music bed or narration, strip it:
  `media_ffmpeg({ args: ['-i','renders/gen-01.mp4','-an','-c:v','copy','renders/gen-01-mute.mp4'], out: 'renders/gen-01-mute.mp4' })`.
  Keep it only when the ambience *is* the sound design for that beat.
- **Trim to the beat you need** — ten seconds is almost always longer than
  the cut wants.
- **Match the film.** Check `media_probe` against the rest of the timeline:
  a 24 fps generated clip dropped into a 30 fps film needs a filter, not a
  concat.
- **In a launch film**, a generated clip is a source, not a shot type. Put it
  on screen through the engine's video shot rather than concatenating it onto
  the render — see `html-motion-video`.
- `media_publish` when the finished thing is what the user asked for. Do not
  publish a raw generated clip as the deliverable unless generating it *was*
  the request.

## Telling the user

Say plainly that a shot is generated, once, in your summary — "the opening
establishing shot is generated; everything from 0:08 is your real product".
Users care about the difference and should never have to ask.
