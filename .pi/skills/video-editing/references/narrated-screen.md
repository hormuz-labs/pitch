# Narrated screen demo

The viewer should look at the control, text or result while hearing the relevant
intent. Start with the narration and real UI progression, then design the camera.
A few attractive zooms are not sufficient coverage of a tutorial.

## Build the attention map before choosing camera clips

Read the transcript and inspect the screen. In the single edit-notes log, create
one row for each distinct instructional reference or consequential interaction:

| ID | Exact phrase / action | Source cue and uncertainty | Visible target / evidence | Decision | Hold through | Final-time review |
| --- | --- | --- | --- | --- | --- | --- |

Inventory the whole requested sequence: orientation, navigation/history, toggles,
text entry, submission, streamed/generated response, cited links, code details,
new-session controls and later results. These are examples to look for, not a
fixed set of mandatory effects. Add rows when the subject changes within a
sentence: “summaries and source links” can require two views.

Every row receives one of these decisions:
- **Focus/pan:** the subject needs clearer emphasis or larger text.
- **Hold existing crop:** the subject is already dominant and readable in the
  current focused composition; give the crop and hold interval.
- **Full composition:** orientation or a relationship across distant regions
  requires it; explain what would be lost in a crop.
- **Unavailable/contradictory:** the claimed result is not visible or the action
  failed. Report the mismatch; do not zoom at an unrelated substitute.

For a request to add/fix zooms, each visible, specific instructional target should
normally get a focus or an existing focused hold. “Readable at full frame” alone
does not satisfy a request for deliberate emphasis. Broad introduction/closing
claims can stay wide with a reason. Do not zoom to every spoken noun or repeat an
identical move every time the same target is mentioned.

## Choose the semantic cue

- **Name an existing control/result:** use the onset of the words that identify
  it, not the start of an introductory sentence. “Our workspace organizes your
  past conversations in the sidebar” shifts attention when “past conversations”
  begins, not when “our workspace” begins and not after “sidebar” finishes.
- **Explain then act:** emphasize the target as its intent is spoken and hold
  through the later gesture. Record the real speech/action gap; camera framing
  alone does not make a delayed gesture simultaneous.
- **Act then explain:** keep the action visible when it occurs; retain/revisit the
  result when named. Do not pair the action with unrelated earlier words merely
  to manufacture an earlier camera deadline.
- **Reveal a result:** it must exist in the pixels when emphasized. If the
  narration anticipates a later result, show the real progression and flag the
  mismatch or make an explicitly justified synchronization edit.

For each new focus, aim for the camera to settle just before or as the identifying
phrase starts (roughly 0–0.15s of lead in output time is a useful initial target).
This is an editorial tolerance, not ASR accuracy. Verify the chosen words and
view the actual approach: an accurate timestamp attached to the wrong phrase is
still a failed zoom. If already focused, hold; a new approach is unnecessary.

Use `camera.cue.speech` for the specific phrase in prepared-source seconds.
Include `action` only for a measured action belonging to that same emphasis.
The backend settles by the earlier supplied cue; it cannot decide whether those
two events belong together. Omit action when discussing an already-visible result.
Split a cued speech clip from silent acceleration, continuing its crop without
an extra entrance. Use the full phrase/work/reading interval for departure.

## Pacing

Before editorial cuts, run `pitch video preprocess` on the synchronized source.
Supply known narration, typing/streaming envelopes and required reading spans
with `protect`. Keep its media-bound coverage. The automatic cut gate is jointly
quiet and visually unchanged, not “the transcript has no words.”

Keep silent typing and streamed output continuous. Accelerate their interior,
typically 2–4×, while retaining recognizable first/last input, submission, first
response and completed result. Speech stays at 1×. Small changing text counts as
activity. Do not replace a progressing field/response with a completed frame.
Keep deliberate pointer approaches, presses and navigation gestures at 1×; split
those from accelerated typing/loading interiors so the cursor does not dart
across the screen after retiming. Review the actual pointer motion in output.

## Camera continuity and navigation

Read [the shared camera reference](zoom.md). Prefer stable holds and same-scale pans between
nearby stable targets. Center the meaningful field/control, retaining its label,
cursor approach and relevant context. A code passage may need successive views
of its signature, annotations and explanation rather than one long top-of-page crop.

Show the navigation control while it is named and activated. Do not omit its
emphasis just to obey a universal “zoom out before every click” rule. If the
destination breaks the crop, widen/cut to context at the layout change, then focus
the result when it is discussed. A stable panel update can retain framing. Check
trigger and destination together; avoid a blind tight crop across a layout change.

## Acceptance

Audit every attention-map row against the rendered timeline, including rows with
no new camera effect. At minimum check the approach before the cue, framing at
the identifying words/action, and departure after its hold. Use additional motion
evidence for uncertain pans or navigation. Review both silence pacing and the
spoken-target association. Record unresolved rows as unresolved; do not report
global success from two passing zooms in a longer walkthrough.
