# Silent screen recording

Use visible intent, action and state change as the timeline. Do not invent speech
anchors or a transcript to make the camera API convenient.

1. Inspect the start state, first input, completed input, submission, first useful
   response, progress/streaming and result. Record the target, observed time range,
   framing and intended hold in the edit-notes log.
2. Run the screen prepass with known typing/streaming and required reading spans
   protected. Keep its remaining coverage. Silence by itself is expected here and
   cannot justify removing the demonstrated process.
3. Accelerate continuous typing/loading/streaming interiors, leaving first/last
   states and the result understandable. Avoid an apparent instant result when
   duration matters; retain progress context or label acceleration if appropriate.
   Keep pointer approaches and clicks at 1×; accelerate the work between them,
   not the pointer travel. Check motion after retiming.
4. Focus before first input or the meaningful click, then hold through completion.
   Use `camera.delay` plus `enter` to place the move in clip-output time, or split
   move/hold clips when needed. `camera.cue` requires speech, so do not populate
   it with a fabricated timestamp for a silent source.
5. Keep new-state orientation visible after navigation. A menu or changing panel
   may use a stable crop; a different layout may need full context.

Review every required action and the transitions between them. A complete video
decode does not establish that a brief menu choice or first generated line survived
acceleration at a readable pace. Add speech, captions or music only if requested
or clearly part of the agreed treatment.
