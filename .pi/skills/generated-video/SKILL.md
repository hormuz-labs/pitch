---
name: generated-video
description: Generate footage that does not exist — establishing shots, textures, metaphors, abstract transitions, B-roll — with video_generate (Gemini Omni). Read this before generating anything; it says when generated footage is right, when it is wrong, how to write the prompt, and how to get a clip into a film without paying twice.
---

# Generated video

`video_generate` invents a clip nobody filmed: ~10 seconds, 16:9 or 9:16,
360p to 4k, **with its own audio**, ~30s to generate at 360p, billed to the
user whether or not you keep it. Everything else in the studio renders
something that exists.

## Right tool

A shot with no source in the world or the product: an establishing shot, a
texture a title sits on, a metaphor the narration makes ("the tide going
out"), an abstract transition, B-roll the user cannot film.

## Wrong tool — this matters more

**Never generate the product.** The model invents plausible UI — buttons that
do not exist, copy nobody wrote, a nearly-right logo — and a film showing
fictional software is worse than none. The product's UI, pages and dashboards
come from `motion_*` or a real recording; its logo from `motion_recon` and its
screens from `motion_screenshot`; charts and numbers from the deck builder with figures you
can source; anything uploaded from the upload. Never generate a person who is
meant to be real. If your prompt describes a screen, stop.

## The prompt is the craft

Write a shot in a treatment, in this order: **subject** (one thing),
**action** (what changes over ten seconds — a still-looking shot looks
broken), **camera** (push in, locked-off wide, handheld tracking, overhead),
**lens and light** (35mm, shallow depth, backlit, one practical lamp), **mood
and grade**. There is no negative-prompt field: say "no text, no logos, no
people" in the prompt. Ask for text in frame only if you will check it —
generated lettering is usually misspelled; add titles afterwards.

> A single glass marble rolling slowly across a dark walnut desk, left to
> right. Locked-off macro, 60mm, shallow depth of field, one warm practical
> light from the right, deep shadows. Calm and deliberate. No text, no
> logos, no people.

## Cost discipline

Draft at 360p. Look at it (`media_probe`; pull a still with `media_ffmpeg`
if needed). Refine with `continues` — pass the clip path and make the prompt
the *change* ("same shot, slower push, colder light"). Only then re-generate
at 1080p. One clip, look, refine — never three variations to pick from.

## Into the film

The clip is an ordinary MP4 in `renders/` and the media tools own it from
there. Its audio will fight your mix: strip it with `media_ffmpeg({ args:
['-i','renders/gen-01.mp4','-an','-c:v','copy','renders/gen-01-mute.mp4'],
out: 'renders/gen-01-mute.mp4' })` unless the ambience *is* the sound design.
Trim to the beat you need; match frame rate to the rest of the timeline (a
filter, not a concat). In a launch film a generated clip is a source for a
shot, not something concatenated onto the render — see `launch-video`.
`media_publish` only when the finished thing is the deliverable.

Say once, plainly, which shot is generated: "the opening establishing shot
is generated; everything from 0:08 is your real product".
