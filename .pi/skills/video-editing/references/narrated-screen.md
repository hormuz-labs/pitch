# Narrated screen demo

The viewer should look at the control, text or result while hearing the relevant
intent. Start with the narration and real UI progression, then design the camera.
A few attractive zooms are not sufficient coverage of a tutorial.

## Continuity governs the whole edit

The finished walkthrough must feel like one continuous demonstration. Camera,
cursor, scroll position, UI state and narration must agree across every join.
Keep `output.continuous_camera: true` from the prepass starter plan. It rejects
camera jumps between clips, a cropped opening, and transitions/internal fades
used to conceal a mismatch. It cannot prove pixel/action continuity: review that.

Carry the previous framing into the next clip; continue a hold or move smoothly
from its exact endpoint using `start_viewport`. Do not restart a zoom at a cut or
speed boundary. Keep camera motion at a readable pace with eased starts/stops.
Idle removal is invisible time compression, not permission for jump cuts: compare
the outgoing/incoming UI, cursor and scroll position and play through each splice.
Trim within a stable state while preserving approach/action/response. If no seamless
join exists, retain and continuously accelerate the silent nonessential interval
instead of skipping it; keep speech, pointer gestures and scroll at natural speed.
Do not paper over discontinuity with a crossfade, wipe, black frame or frozen duplicate.

## Build the attention map before choosing camera clips

Read the transcript and inspect the screen. In the single edit-notes log, create
one row for each distinct instructional reference or consequential interaction:

| ID | Exact phrase / action | Source cue and uncertainty | Visible target / evidence | Decision | Hold through | Final-time review |
| --- | --- | --- | --- | --- | --- | --- |

Inventory the whole requested sequence: orientation, navigation/history, scrolling, toggles,
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

**A failed prepass is not a completed prepass.** Recover the reported tool/transport
failure and obtain the prepared source, map and coverage before planning. Do not
silently fall back to hand-cutting the original or discard coverage to get a render.
Protect the measured speech/action ranges separately, not the entire span between
them: a five-second explanation followed by twelve seconds waiting for a click
does not justify a seventeen-second protected hold.

Run `pitch video analyze` and inspect every silent interval of two seconds or more,
including the gaps between narration and the next input. Classify each as task
input/scroll, response progress, required reading, or idle. Autoplay advertisements,
unrelated thumbnails, blinking carets and decorative animation are not task progress.
If these defeat the pixel-static detector, pass the inspected source-time spans as
`reviewed_idle` with a reason to `preprocess` (see [CLI](cli.md)). The host still
preserves audio and protected ranges, with boundary handles. Never classify active
typing, chat streaming, relevant video playback or scrolling as idle. Review short
playback or dense local frames through the interval; endpoints alone are insufficient.
Do this before camera timing; rerun from the original and remap if an idle span was missed.

Keep silent typing and streamed output continuous. Accelerate their interior,
typically 2–4×, while retaining recognizable first/last input, submission, first
response and completed result. Speech stays at 1×. Small changing text counts as
activity. Do not replace a progressing field/response with a completed frame.
Keep deliberate pointer approaches, presses and navigation gestures at 1×; split
those from accelerated typing/loading interiors so the cursor does not dart
across the screen after retiming. Review the actual pointer motion in output.

Protect each scroll from its start through its settled destination as `kind: "scroll"`;
protect pointer approaches/presses as `kind: "interaction"`. Both stay continuous
at 1×, including wheel/trackpad, keyboard scrolling and tool-driven smooth scroll.
Show the travel, not only the before/after positions. Keep enough frame context to
see the direction and destination. Do not crop a moving target out of view or cut
out the scroll as a shortcut to the result.

## Camera continuity and navigation

Read [the shared camera reference](zoom.md). Prefer stable holds and same-scale pans between
nearby stable targets. Center the meaningful field/control, retaining its label,
cursor approach and relevant context. A code passage may need successive views
of its signature, annotations and explanation rather than one long top-of-page crop.

Show the navigation control while it is named and activated. For each page/tab or
major layout change, measure the trigger and **first destination frame** separately.
The destination must arrive at full composition, not inherit the preceding crop.
Return smoothly to wide before that first frame and remain wide through the native
page transition. If there is insufficient time after the click, begin the return
earlier while keeping the trigger visible, or use a wider composition for that
whole action. Never fix an inherited crop with an abrupt reset/cut. Give the new
layout a readable orientation hold (usually 0.5–1s) before a new, separately grounded
focus. A stable panel update
can retain framing only when the control, change and result all stay visible.
Saved URL events/tool return times are hints, not measured arrival timestamps.
Inspect the rendered last old-page frame, first new-page frame and next focus.

## Acceptance

Audit every attention-map row against the rendered timeline, including rows with
no new camera effect. At minimum check the approach before the cue, framing at
the identifying words/action, and departure after its hold. Use additional motion
evidence for uncertain pans or navigation. Review both silence pacing and the
spoken-target association. Record unresolved rows as unresolved; do not report
global success from two passing zooms in a longer walkthrough. Before publication,
also play through every edit/speed/camera join and account for every >=2s silent
interval in the output, every navigation arrival, every scroll, and a visible
cursor approach/press on each demonstrated page. A
passing decode does not satisfy these checks. An absent pointer is a capture gap;
do not claim it was shown or synthesize a mouse path from click coordinates alone.
