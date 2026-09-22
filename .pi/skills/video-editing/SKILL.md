---
name: video-editing
description: Edit existing video files, including narrated product demos, silent screen recordings, interviews, presentations, camera footage and montages. Use for cuts, pacing, speech-aligned emphasis, captions, reframing, audio changes or post-processing handoffs. Choose the scenario instructions from the footage and requested outcome before planning the edit.
---

# Video editing

Make the viewer understand the intended subject at the intended moment. Choose
editing rules from the task and the footage; a software walkthrough, interview
and trailer do not use the same silence, preservation or camera policy.

## Choose the instructions

Read the applicable branch before making editorial decisions. Choose per sequence
in mixed footage; this is a reasoning choice, not a stored project category.
Carry forward the existing brief, source paths and decisions instead of asking
the user to repeat them.

| Request / footage | Read | Governing choice |
| --- | --- | --- |
| A specified trim, volume adjustment, blur or other local correction | [Targeted edit](references/targeted-edit.md) | Requested scope takes priority over a general makeover |
| Narrated software demonstration, coding tutorial or screen walkthrough | [Narrated screen demo](references/narrated-screen.md) | Spoken intent and demonstrated action jointly direct attention |
| Silent screen recording, typing, generated text or a UI process | [Silent screen recording](references/silent-screen.md) | Visible actions and state changes direct attention |
| Interview, talking head, conversation or webcam-led explanation | [Speech and people](references/speech-and-people.md) | Meaning, expression and conversational rhythm govern cuts |
| Slides, charts, documents, lecture or narrated PDF | [Presentation](references/presentation.md) | Spoken references and reading/comparison needs govern emphasis |
| Trailer, music-led montage, cinematic/generated footage, gameplay highlight or physical action | [Montage and action](references/montage-and-action.md) | The requested story, rhythm and physical continuity govern selection |

A screen/webcam composite can use narrated-screen rules for the demonstrated UI
and speech-and-people rules for the speaker. Change branches at a real change of
editorial purpose, not at each filename. If the brief is ambiguous, state the
working interpretation and ask only about choices that would materially alter it.

## Shared execution

Use `pitch video capabilities` once per session and probe the actual inputs.
Run media operations through the host commands in pi's `bash` tool. Notes use
pi's read/write/edit tools; plans use bounded host authoring commands below.
The VM has no FFmpeg, browser or network.
Sources, outputs and image evidence use workspace-relative paths.

Tool contracts:
- [Bounded authoring](references/authoring.md): create, inspect a small page and apply revision-checked patches. Read before creating or changing a plan; do not regenerate whole timelines.
- [CLI](references/cli.md): flags, preprocessing, inspection and publication.
- [Plan](references/plan.md): exact JSON fields, coverage, clip timing and effects.
- [Camera geometry and timing](references/zoom.md): coordinates, cue semantics and continuity. Read when using a camera crop or move.
- [Extensions](references/extensions.md): unsupported operations and host-tool boundaries.

`pitch demo source` supplies synchronized narration with the stopped capture;
the raw browser recording may be silent. Keep its source-time narration notes.
For an editable launch composition or deck, use its authoring skill when the
request is to edit the composition rather than process an exported video.

## Evidence, plan, review

1. **Establish what exists.** Probe duration, displayed geometry, audio tracks and
   source identity. Open an overview, then inspect unresolved moments. Read each
   returned image before using its coordinates. An overview cannot establish a
   click boundary; narrow locally where timing matters.
2. **Record editorial obligations.** Use one `edits/edit-notes.md` for source facts,
   scenario, required content/emphasis, exact phrases/actions, image evidence and
   unresolved issues. The chosen branch defines what belongs in this log. Use
   `pitch media transcribe` when speech supplies timing; check the relevant words,
   not just whole-sentence boundaries. Keep a short attention index for long work
   and update one beat/chapter at a time; do not reload/rewrite the entire log.
3. **Set pacing before camera timing.** Apply the branch's trim/speed policy.
   For a screen prepass, carry its source-time map and media-bound coverage into
   the plan. Map original → prepared → final time explicitly. Changing a speed
   invalidates downstream output timing, not unchanged source observations.
4. **Compose and validate.** Ground each distinct crop with `pitch video focus`,
   open context and crop, and use its viewport. Inspect the affected plan page,
   then apply a small revision-checked `pitch video plan --operation patch`.
   The host validates the complete candidate. Page the resulting timeline for
   affected beats; full reports remain artifacts rather than long model output.
5. **Review from the obligations, not from the list of effects you happened to
   add.** For every required subject/action, locate its final-time interval and
   inspect the rendered framing at its cue and through its hold. Include missing
   effects in the audit. Check transitions/continuity and delivery-size text.
   Use short playback or dense local frames when stills cannot resolve motion.
6. **Deliver according to evidence.** Fully decode with `pitch video verify`.
   Check speech/audio perceptually when available; technical alignment is not
   proof that a zoom refers to the right words. Report unreviewed audio or unresolved
   semantic issues explicitly. Publish the checked file under a new human-readable
   `renders/` name with its plan and a concise account of the edit.

Stop when the branch's obligations are accounted for, the reviewed output matches
them, and technical checks pass. Do not declare an edit visually correct merely
because it renders or its camera endpoints satisfy arithmetic.
