# Silent screen recording

Use visible intent, action and state change as the timeline. Do not invent speech
anchors or a transcript to make the camera API convenient.

1. Inspect the start state, first input, completed input, submission, first useful
   response, progress/streaming and result. Record the target, observed time range,
   framing and intended hold in the edit-notes log.
2. Run the screen prepass with known typing/streaming and required reading spans
   protected. Keep its remaining coverage. Silence by itself is expected here and
   cannot justify removing the demonstrated process.
   Recover failed preprocessing before making a plan. Protect measured scrolling
   as `kind: "scroll"` and approaches/presses as `kind: "interaction"`; retain the
   whole action at 1×. Inspect gaps with no task progress: autoplay ads/caret blink
   can fool pixel-static detection. Use evidence-backed `reviewed_idle` in the
   prepass for those gaps, never for input, scroll, streaming or useful reading.
3. Accelerate continuous typing/loading/streaming interiors, leaving first/last
   states and the result understandable. Avoid an apparent instant result when
   duration matters; retain progress context or label acceleration if appropriate.
   Keep pointer approaches and clicks at 1×; accelerate the work between them,
   not the pointer travel. Check motion after retiming.
4. Focus before first input or the meaningful click, then hold through completion.
   Use `camera.delay` plus `enter` to place the move in clip-output time, or split
   move/hold clips when needed. `camera.cue` requires speech, so do not populate
   it with a fabricated timestamp for a silent source.
5. New pages/tabs and major layouts must arrive wide. Return smoothly before the
   first destination frame, holding the trigger in view; hold wide for orientation,
   then refocus. A menu or stable panel can retain its crop when all context fits.

Keep `output.continuous_camera: true`. The entire demonstration should be continuous:
carry framing across clips and speed changes, preserve cursor/scroll/UI state at
each splice, and play through the joins. No abrupt camera resets or jump cuts to
completed actions. When idle cannot be trimmed with a seamless state match, retain
and accelerate its nonessential interior instead. Crossfades/wipes do not repair
broken action continuity.

Review every required action and the transitions between them. A complete video
decode does not establish that a brief menu choice or first generated line survived
acceleration at a readable pace. Add speech, captions or music only if requested
or clearly part of the agreed treatment.
