---
name: demo-video
description: Prepare and record one continuous real product walkthrough, demonstrating actions while narrating. Use this for a live-site walkthrough even when uploaded PDFs or images are reference or supporting material. If the requested video presents those files or is built primarily from their content, read asset-demo instead. Also supports narrated PDF/image slideshows. Hands stopped footage to video-editing for post-processing.
---

# Demo recording

Choose from the requested video's subject, not merely from which files are attached.
Use this skill when a live product is the main subject. An uploaded PDF or image may
still supply facts, a script, brand guidance, requirements, or supporting visuals.
If the video should present those files themselves or be built chiefly from their
content, stop and read `asset-demo` instead.

Capture a truthful **intent → visible action → verified result**. Each specific
claim needs visible evidence; tool success alone does not prove the intended
state. Generated code proves generation, not correctness or production readiness.
Report contradictions between the script and actual source; never manufacture
supporting footage. Camera moves and final editing belong to the shared editor.
Capture complete gestures, scrolling and native page transitions so the final
walkthrough can remain continuous. Verify cursor visibility in the synchronized
source (the raw master is cursorless); a jump to a scrolled destination is
incomplete visual evidence.

## Choose the instructions

Route from the current request, not a permanent project category. Load only the
references needed for this sequence; carry forward the supplied brief and decisions.

| Request | Read / do next |
| --- | --- |
| Edit an existing video: length, pacing, camera, audio or look | Go straight to the [video-editing scenario router](../video-editing/SKILL.md); reuse the selected source or saved plan |
| Capture a real app workflow | [Browser workflow](references/browser-workflow.md) |
| Capture prepared PDFs/images, with or without a reviewed storyboard | [Documents and storyboards](references/documents-storyboards.md) |
| Mixed app/document walkthrough | Read the relevant capture references by sequence; lead with the app when documents support its workflow, or documents when they are the main content |
| Raw-only capture | Use the applicable capture branch, then return the synchronized source in step 5 below |

For any new or resumed capture, also read [shared capture mechanics](references/capture-mechanics.md).
A document-only recording does not need the app workflow. Mixed sequences share
one take; switching references does not start a new recording.

## Capture lifecycle

1. **Set scope before recording.** Ask with `ask_user` only if consequential
   workflow/depth choices remain open: quick tour, one complete workflow, or setup
   and first run. Offer the product's own workflows when known, then end the turn
   and wait. Skip settled/delegated choices. Do not ask about voice, pacing, zooms
   or look, or ask once recording starts. Choose one audience takeaway and the
   smallest sequence that proves it. Runtime follows coverage unless explicitly
   exact or capped; preserve required content and useful reading holds.
2. **Prepare using the chosen branch.** The context supplies URL, voice, uploads
   and sometimes a script. Preserve a supplied script's content, order and tone;
   split at complete thoughts and add connective words only where needed. Approved
   storyboard narration has the stricter verbatim rules in the document reference.
   Keep a short ledger of intended phrases/subjects, planned actions, expected
   visible changes and evidence of success. Establish the starting state before capture.
3. **Start once, demonstrate, verify.** Use `pitch demo record-start` in the
   prepared browser; the branch explains initial navigation. Capture runs in real
   time, including while you think. Keep one continuous take through navigation,
   inspection and recoverable errors. Follow the branch's speech/action or page
   rhythm; update the ledger with observed results and gaps.
4. **Stop once at the end.** After the final visible result and closing narration,
   call `pitch demo record-stop`; it waits for the last speech. Check that capture
   actually stopped: a first missing-page warning can leave it live. Complete
   missing pages when possible; if genuinely impossible, call stop again and report
   the gap. Never end a turn with capture running.
5. **Prepare the synchronized source.** `pitch demo source` creates a new uncut
   `recording/source-*.mp4` with narration/SFX and source-time narration beats.
   Raw-only requests receive that returned source and its beats, without an edit.
   `recording/demo.webm` alone may have no narration. Otherwise continue below.

## Editing handoff

Read the [video-editing scenario router](../video-editing/SKILL.md) before making
cut or camera decisions. Narrated app sequences use its
[narrated-screen branch](../video-editing/references/narrated-screen.md); narrated
documents use its [presentation branch](../video-editing/references/presentation.md).
Mixed footage uses each policy for its sequence. The selected branch owns
preprocessing and pacing: do not apply screen dead-time cuts unconditionally to
static slides, whose silent reading/comparison holds may be required content.

Carry the brief, source path/beats, approved storyboard where present, and ledger
into the editor's notes. For each distinct subject or intended emphasis, include:

- The **exact identifying phrase or action intent**, visible target and evidence.
  Split notes when a sentence changes subjects; a whole-sentence start is not a
  universal cue. In “Our workspace keeps past conversations in the sidebar,”
  identify “past conversations,” not automatically “Our workspace.”
- Related action times **only when known from evidence**, with their timebase and
  uncertainty; otherwise mark unknown for source inspection. Do not substitute a
  tool return time or invent an action for an already-visible result.
- Required completion, narration, reading/comparison holds; known input/response
  boundaries; complete scroll intervals; navigation trigger and observed arrival
  separately; cursor visibility on each page; baked-in callouts; missing or
  contradictory results. Separate actual speech/action spans from idle gaps.

These are capture facts and intentions, not camera commands. The editor measures
phrase timing from the synchronized source, resolves any action timing, maps
through retiming and chooses framing/holds under its scenario rules. Preserve real
speech/action gaps in the notes; a zoom cannot make a late gesture simultaneous.
The shared editor owns rendering, review and publication.

## Resume or replace

If context says capture is LIVE and the request is to finish, inspect the current
state and continue that take. Stop when complete, when the user asks, or on an
irrecoverable browser failure; use the shared mechanics for recoverable errors.
For a replacement, inspect the saved footage first: record again only when required
actions/content are missing or capture failed. Prepare the corrected route, then use
`pitch demo record-start --retake-reason "<specific missing step or failed capture>"`.
Previous raw footage/state is archived under `recording/takes/`; do not repeat an
unchanged failing approach or use a new take for inspection.
