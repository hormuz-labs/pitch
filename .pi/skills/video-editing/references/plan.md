# Edit plan v1

Media and plan paths resolve from the **project workspace**, not the plan's
directory. Use workspace-relative paths so plans survive worker placement.
Remote media and paths/symlinks escaping the workspace are rejected.

`pitch video validate` checks fields, input metadata, timing, geometry and
output collisions. It returns the actual frame-quantized timeline; `render`
validates again. This is a finite contract: unknown JSON keys are errors.

## Minimal plan

```json
{
  "version": 1,
  "output": {
    "path": "renders/tutorial-v1.mp4",
    "width": 1920,
    "height": 1080,
    "fps": 30
  },
  "clips": [
    {"source": "uploads/recording.mp4", "in": 2.0, "out": 12.0}
  ]
}
```

## Output

| Field | Default / meaning |
| --- | --- |
| `path` | Required new `.mp4` path under `renders/`; existing files are never replaced |
| `width`, `height` | 1920, 1080; even integers, 16–7680 |
| `fps` | 30; finite number, 1–120; fractional frame rates supported as JSON numbers |
| `crf` | 18; 0–40, lower is higher quality/larger file |
| `preset` | `medium`; libx264 presets from ultrafast through veryslow |
| `normalize_audio` | false; single-pass loudnorm aiming for −16 LUFS / −1.5 dBTP / LRA 11 |

Output is SDR H.264/yuv420p, AAC stereo 48 kHz with fast-start metadata. HDR
clips/overlays require an explicit color-managed conversion first. Clips without
audio receive silence. Rotation and non-square pixels are normalized before
composition; variable-frame-rate video is resampled to the output frame rate.

Normalization is not a mastering guarantee. Lossless FFV1/PCM intermediates
avoid repeated lossy encoding but require scratch space.

## Clips

Supply 1–100 clips in output order. Reuse a source for multiple kept ranges or
mix sources with different dimensions/frame rates.

| Field | Default / meaning |
| --- | --- |
| `source` | Required finite-duration video |
| `in`, `out` | 0 and source duration; source seconds, half-open `[in, out)` |
| `speed` | 1; 0.125–8; video and audio tempo change together |
| `fit` | `contain` preserves whole image with black padding; `cover` center-crops |
| `camera` | Optional focused composition, supersedes `fit` |
| `audio_track` | 0; zero-based position in probe's `audio_tracks`, not absolute stream index |
| `volume` | 1; linear gain, 0–8 |
| `mute`, `denoise` | false; denoise is conservative FFT **audio** denoising |
| `fade_in`, `fade_out` | 0; picture-to/from-black AND audio fades, clip-output seconds |
| `brightness` | 0; −1 to 1 |
| `contrast`, `saturation` | 1; 0–3 |
| `transition` | Optional incoming picture transition and matching audio crossfade |
| `note` | Human-readable rationale/inspection log |

Clip fades cannot overlap. Sub-frame durations are rejected. Timing is
quantized to output frames.

### Camera

Use `pitch video focus` at the **final output aspect ratio** to obtain:

```json
{
  "viewport": {"x": 0.5, "y": 0.2, "width": 0.3, "height": 0.3},
  "enter": 0.4,
  "exit": 0
}
```

This example assumes equal source/output aspect ratios. The viewport is
normalized to the displayed source. `enter`/`exit` default to 0. Both zero
means a static crop; otherwise the camera moves from full composition to the
viewport and/or back with a hold between. Their sum cannot exceed clip-output
duration. There is one destination per clip, no arbitrary keyframes or tracking.

An exit of 0.4 starts **0.4 seconds before the clip ends**, not after it. A next
clip with no camera returns to full composition even when the previous exit
was zero. Repeat the viewport with `enter: 0, exit: 0` on bridge/hold clips.

Optional `start_viewport` replaces full composition as the starting position
during `enter`. Same coordinate, aspect-ratio, bounds and 10× zoom checks apply.
It requires at least one output frame of entrance and two frames in the clip.
The first rendered frame uses `start_viewport`; the move reaches `viewport`
even when entrance spans the whole clip. Nonzero exit still returns to full
composition, not to `start_viewport`.

For a constant-scale pan, keep equal endpoint width/height, changing only x/y:

```json
{
  "start_viewport": {"x": 0.1, "y": 0.1, "width": 0.5, "height": 0.5},
  "viewport": {"x": 0.4, "y": 0.2, "width": 0.5, "height": 0.5},
  "enter": 0.6,
  "exit": 0
}
```

Set the preceding exit to 0 and copy its final viewport exactly to the next
`start_viewport`. Continue holds without entrance/exit. The renderer does not
infer adjacent camera states or stable layouts; encode observed continuity.
See [zoom.md](zoom.md#camera-continuity-on-a-stationary-page-or-scene).

### Incoming transition

On any clip except the first:

```json
{"type": "fade", "duration": 0.5}
```

Types: `fade`, `fadeblack`, `wipeleft`, `wiperight`, `slideleft`, `slideright`.
The previous tail overlaps this clip's start, with a linear audio crossfade.
The overlap must fit both clips without overlapping another transition, and
is quantized to frames. Omit for a cut.

## Timeline math

```text
clip_duration = round(((out - in) / speed) * fps) / fps
clip_start = previous_clip_end - incoming_transition_duration
output_time = clip_start + (source_time - in) / speed
```

Use the validator's `timeline`. During a transition two ranges map to the same
output interval. Split/rewrite transcript cues across removed material; never
stretch them across the cut. Clamp last cues to the returned clip end where
frame quantization changes duration.

## Image/video overlays

Top-level `overlays`, at most 50:

```json
[
  {
    "source": "uploads/webcam.mp4", "in": 1,
    "start": 2, "end": 8,
    "box": {"x": 0.72, "y": 0.65, "width": 0.25, "height": 0.30},
    "opacity": 1
  }
]
```

`box` is normalized to the **final output canvas**. The overlay fits inside
it without distortion, top-left anchored; array order is stacking order.
`in` is source seconds; start/end are final seconds. Defaults: in=0, start=0,
end=total, opacity=1. PNG/JPEG/WebP/BMP repeat; videos play once at normal speed
then disappear. Overlay audio is ignored; prepare extra audio explicitly.

## Background music / additional audio

One optional top-level `music` object:

```json
{
  "source": "audio/music.wav", "in": 0,
  "start": 0, "end": 12, "volume": 0.12,
  "fade_in": 0.5, "fade_out": 1
}
```

Defaults: in=0, start=0, end=total, linear volume=0.15, zero fades. First audio
track, played once and padded with silence if short. No automatic looping or
speech ducking. Fades are relative to this music interval. Mixing adds signals;
check gain and intelligibility. Final normalization is optional.

## Captions

Top-level `captions`, at most 10,000 final-timeline cues:

```json
[
  {"start": 0.3, "end": 2.2, "text": "Open Settings."},
  {"start": 2.4, "end": 4.8, "text": "Choose the output folder.\nThen save."}
]
```

Burned-in outlined bottom-center style scaled to output dimensions. Requires
host FFmpeg `subtitles`/libass and a font. Plain text, 1–1000 characters;
newlines work, ASS overrides (`{`, `}`, backslash) do not. Correct overlapping
or overlong cues editorially. Caption text remains editable in the plan;
custom styling and subtitle sidecars require a separate operation.

## Opaque redactions

Top-level `redactions`, at most 100:

```json
[
  {"start": 1, "end": 4, "box": {"x": 0.65, "y": 0.03, "width": 0.30, "height": 0.08}}
]
```

Solid black boxes in **final-output coordinates**, after overlays and before
captions. Pixel boundaries round outward. Boxes do not follow source motion
or camera moves: inspect the whole interval and update regions/timing.
Do not copy source-space focus boxes directly after reframing.

## Artifacts

Drafts are under `.video-work/`, fitting within 960×540; each covers the whole
plan. Final goes to `output.path`, under `renders/` for studio preview/shelf.
Each render saves a `.plan.json` snapshot when available, with normalized plan,
timeline and render settings. Inspection PNGs stay under `.video-work/`.
Intermediates are removed on normal success/failure; cancellation may leave
scratch directories. Publish only the checked final with `pitch media publish`.
