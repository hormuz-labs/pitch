# 4K Video Capture Pipeline

Captures a GSAP-animated DOM site at full 4K (3840×2160) with
frame-accurate timeline control, producing a ProRes editing master
and a compressed H.265 delivery file.

## Quality Problem

Before this pipeline, recordings suffered from three quality losses:

| Loss stage | Source | Fix |
|------------|--------|-----|
| Temporal aliasing | Chrome screencast caps at ~400 frames (~20s at 20fps), then stops | Capture each frame independently via CDP `Page.captureScreenshot` |
| Compression artifacts | Screencast frames are JPEG → VP8 WebM → re-encode | Save as JPEG quality 100 directly, then encode to ProRes once |
| Frame offset | `syncLoop` runs on `requestAnimationFrame` overwriting `MASTER_TL.time()` with real clock time, shifting all frames 3+ seconds ahead | Freeze `requestAnimationFrame` before stepping through timeline |

## How It Works

```
┌─────────────┐    Page.captureScreenshot (JPEG q100)
│ Chrome CDP  │ ──→  frame-00000.jpg
│ 3840×2160   │ ──→  frame-00001.jpg
│             │ ──→  ...
│             │ ──→  frame-01199.jpg
└──────┬──────┘
       │ MASTER_TL.time(t) for each frame
       │ requestAnimationFrame frozen (no syncLoop interference)
       ▼
┌──────────────┐    ffmpeg concat demuxer
│ ProRes 422 HQ├──→ pitch-launch-prores.mov  (1.6 GB, 265 Mbps)
└──────┬───────┘
       │ ffmpeg libx265 CRF 15
       ▼
┌──────────────┐
│ H.265 delivery├──→ pitch-launch-4k.mp4  (11.5 MB, 1.9 Mbps)
└──────────────┘
```

## Files

| File | Role |
|------|------|
| `capture-4k.sh` | Orchestrator — launches browser, runs capture, encodes both outputs |
| `capture-frames.py` | CDP WebSocket client — freezes syncLoop, steps timeline, saves JPEG frames |

## Usage

```bash
# Default: localhost:8080, 24fps, 50s, outputs to workdir/
./scripts/capture-4k.sh

# Custom
./scripts/capture-4k.sh http://localhost:3000 30 60 /path/to/output
```

## Requirements

- `agent-browser` (`npm i -g agent-browser`)
- Python 3 + `websockets` (`pip install websockets`)
- ffmpeg with `libx265` and `prores_ks`

## Timing

At ~12 fps capture speed, a 50-second animation at 24 fps (1200 frames)
takes ~100 seconds to capture, plus ~35 seconds to encode ProRes and
~50 seconds to encode H.265. Total: ~3 minutes.

---

## Playwright Comparison

**Playwright** records video using Chrome's screencast (`Page.startScreencast`),
which sends JPEG frames over the CDP at a maximum of ~10 fps with a
hard frame limit (~400 frames, ~40 seconds of video). The output is a
single WebM file with baked-in VP8 compression — you cannot recover
the per-frame quality lost during capture.

| Dimension | Playwright screencast | This pipeline (CDP screenshot) |
|-----------|----------------------|--------------------------------|
| Frame rate | ~10 fps, capped | Full 24 fps, any rate |
| Max duration | ~40s (frame limit) | Unlimited |
| Per-frame quality | Lossy JPEG (Chrome internal) | JPEG quality 100 |
| Output format | VP8 WebM (more loss) | ProRes 422 HQ → H.265 |
| Speed | Real-time (50s animation = 50s capture) | ~2× real-time (50s → 100s) |
| Frame accuracy | None (screencast timestamps) | Exact `MASTER_TL.time(t)` |
| File size for 50s 4K | ~1.3 MB WebM | 1.6 GB ProRes / 11.5 MB H.265 |

**Trade-off**: Playwright is faster (real-time) but capped at ~10 fps
with VP8 loss. This pipeline takes ~2× real-time but captures every
frame at JPEG quality 100 with exact timeline positioning, then encodes
to a proper mezzanine codec (ProRes) for editing.

For this project, the quality difference between the WebM screencast
and the ProRes master was substantial — the screencast showed visible
banding in gradients, blockiness in dark areas, and the ~40s duration
limit cut off the last two scenes entirely.
