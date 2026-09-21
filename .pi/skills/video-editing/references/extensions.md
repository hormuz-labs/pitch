# Advanced operations and tool boundaries

The shared workflow covers many video genres. Its version-1 backend implements
trims, ordering, retiming, contain/cover, one-destination camera moves, selected
transitions, clip fades, basic color/audio treatment, image/video overlays,
one additional audio track, burned-in captions and timed opaque boxes.

## When an operation is missing

1. Identify it precisely and check `pitch video capabilities` and relevant host
   command help.
2. Prefer reproducible preprocessing through `pitch media ffmpeg` for a supported
   FFmpeg operation. Paths and output stay in the workspace; write a new asset.
   Record the arguments in edit notes. Do not run local scripts/FFmpeg or install
   tools in the VM.
3. Probe and inspect the derived asset. Document duration, geometry, color and
   alignment changes, then use it in the ordinary plan.
4. If no host tool supports the operation, state the specific limitation. The
   studio agent cannot extend its own server or invent unsupported plan fields.

## Capabilities needing dedicated implementations

| Capability | Evidence/implementation needed |
| --- | --- |
| OCR anchors | Timestamped source boxes, uncertainty, pixel verification |
| Cursor/events | Actual positions/events with coordinate/time transforms |
| Object/face tracking | Timestamped boxes, loss handling, reviewed keyframes |
| Arbitrary camera paths | Validated timed viewports, bounded interpolation |
| Stabilization | Analysis and transform passes, crop/warp review |
| Advanced audio | Alignment/drift, ducking, multitrack mixing, measured loudness |
| Advanced color | Explicit metadata and color-managed HDR/SDR transforms |
| Generative edits | Actual model, explicit source/output, temporal review |
| NLE interchange | Defined format and tested mappings for effects/media |

Do not claim these happened because an edit plan rendered. Pitch's separate
generation/export tools may cover particular requests; use their documented
contracts, then inspect the actual result.

## Pi migration

The supplied OpenCode/DaVinci guide and Python engine now run through pi's
`pitch video` host actions. The engine is server-owned, not copied into project
workspaces. Host execution supplies FFmpeg, cancellation, metering and optional
render-tier placement; returned relative PNG paths work with pi's image-capable
`read`. Transcription uses shared host whisper.cpp rather than faster-whisper.
A text-only model can apply explicit numeric edits but cannot independently
establish visual target coordinates.
