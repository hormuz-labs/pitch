# Editorial decisions across recording types

Start from the user's purpose. A social highlight and a faithful tutorial need
different decisions.

## Camera footage, interviews, vlogs and events

- Preserve continuity of speech, expressions, gestures, movement and gaze;
  inspect both sides of cuts.
- Keep headroom and meaningful gestures. A face-only crop can hide a demonstration.
- Keep complete thoughts rather than mechanically deleting pauses/fillers.
  Do not turn qualifications into absolute claims.
- Match exposure/color conservatively; basic adjustments are not full grading.
- Review lip sync, room tone, microphone changes and pops. Relevant B-roll or
  a deliberate composition change can help distracting jump cuts.
- Stabilization needs its own analyzed operation and crop/warp review. Brightness
  does not repair focus or motion blur.

## Screen recordings, product demos and coding tutorials

- Retain prerequisite state, action and observable result.
- Log meaningful controls/text entry, address bars and nested/final links.
  Focus requested targets and otherwise unreadable interactions.
- Follow [zoom.md](zoom.md) for centering, holds, continuity and pre-trigger
  navigation departure; use [inspection.md](inspection.md)'s consolidated review.
- Keep text readable at delivery size; desktop-to-phone may need a new layout
  rather than simply cropping a desktop to a vertical frame.
- Frame controls before clicks, retain their responses and enough context to
  locate them. Shorten waits/repetition deliberately without losing the trigger
  or useful response. A revealed link is not idle footage. Signal elapsed time
  when a cut would imply an operation was instantaneous.
- Synchronize narration, cursor, UI and callouts; inspect commands with outputs.
- Code, errors, equations and diagrams need reading time; silence can be essential.
- When requested, remove notifications/sensitive details through scrolling,
  menus, cuts and zooms, checking the full affected interval.

## Mixed screen and webcam

- Choose the main story source at each moment. Keep webcam off active UI/captions.
- Align using metadata and actual sync points, not assumed shared start times.
- Overlay audio is ignored: choose primary audio, prepare additional audio or
  explicitly preprocess a synchronized mix.
- Check drift at both ends of long recordings; an initial offset does not fix it.

## Presentations, lectures, meetings and podcasts

- Distinguish summary from faithful shortening; preserve qualifications/context.
- Keep slide labels/diagrams readable and changes synchronized to discussion.
- Review speaker changes and overlapping speech; crossfades may hurt clarity.
- Remap captions/section cues using validated time, reading the transcript rather
  than relying on silence detection.

## Gameplay, sports, action and demonstrations

- Retain setup/outcome, not just a close-up of the climax.
- Inspect movement through time; widen if the subject leaves a fixed viewport.
- Speed changes resample frames; they do not create optical-flow motion.
- Preserve meaningful HUD, scores, hands, tools and motion direction.

## Social clips, promos and montages

- Establish context promptly, keep the subject in frame and give an intentional ending.
- Keep subtitles readable and away from subjects/controls/platform UI identified
  by the brief.
- Support timing with music/transitions; maintain intelligibility and inspect overlaps.
- Use prepared assets for titles/graphics/B-roll. `generated-video` can supply
  missing footage; this editing skill operates on existing files.

## Consolidated review criteria

Check meaning, action/speech/cue timing and reading time; picture/framing/text/
overlays/color/redactions throughout; intelligibility/levels/artifacts/sync;
and delivery dimensions/duration/tracks/decoding/compression/artifacts.

`pitch video verify` covers full decoding, metadata, sample peak and optional
duration. `analyze` identifies black/silence candidates. Neither establishes
narrative quality, redaction completeness, lip sync or true-peak compliance.
