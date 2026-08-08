#!/bin/bash
set -euo pipefail

URL="${1:-http://localhost:8080/}"
FPS="${2:-24}"
DURATION="${3:-50}"
OUTDIR="${4:-$(dirname "$0")/../workdir}"

OUTDIR="$(cd "$OUTDIR" 2>/dev/null && pwd || echo "$OUTDIR")"
mkdir -p "$OUTDIR"

FRAME_DIR="/tmp/pitch-frames-$$"
PRORES="$OUTDIR/pitch-launch-prores.mov"
DELIVERY="$OUTDIR/pitch-launch-4k.mp4"

echo "=== Pitch Launch 4K Capture ==="
echo "URL:       $URL"
echo "FPS:       $FPS"
echo "Duration:  ${DURATION}s"
echo "Frames:    $(( DURATION * FPS ))"
echo "Output:    $OUTDIR"
echo ""

# ── Cleanup handler ──
cleanup() {
  echo ""
  echo "Cleaning up browser..."
  agent-browser close 2>/dev/null || true
}
trap cleanup EXIT

# ── Step 1: Launch browser at 4K ──
echo "[1/4] Launching browser at 3840x2160..."
agent-browser close 2>/dev/null || true
sleep 1
agent-browser open
agent-browser set viewport 3840 2160
agent-browser navigate "$URL"
sleep 3

# Get CDP WebSocket URL
CDP_URL=$(agent-browser get cdp-url)
if [ -z "$CDP_URL" ]; then
  echo "ERROR: Failed to get CDP URL"
  exit 1
fi

# ── Step 2: Capture frames ──
echo "[2/4] Capturing $(( DURATION * FPS )) frames..."
mkdir -p "$FRAME_DIR"

# Python with the `websockets` package. Override with CDP_PYTHON, e.g. point it
# at a venv: CDP_PYTHON=/path/to/venv/bin/python3 ./capture-4k.sh ...
PYTHON="${CDP_PYTHON:-python3}"

"$PYTHON" "$(dirname "$0")/capture-frames.py" \
  "$CDP_URL" "$FRAME_DIR" "$FPS" "$DURATION"

# ── Step 3: Encode ProRes master ──
echo "[3/4] Encoding ProRes 422 HQ master..."
rm -f "$PRORES"

ffmpeg -y -r "$FPS" -pattern_type glob -i "$FRAME_DIR/frame-*.jpg" \
  -c:v prores_ks -profile:v 3 \
  -pix_fmt yuv422p10le \
  -vendor ap10 \
  -bits_per_mb 8000 \
  "$PRORES" 2>&1 | tail -5

echo "ProRes master: $(ls -lh "$PRORES" | awk '{print $5}')"

# ── Step 4: Encode H.265 delivery ──
echo "[4/4] Encoding H.265 delivery..."
rm -f "$DELIVERY"

ffmpeg -y -i "$PRORES" \
  -c:v libx265 \
  -crf 15 \
  -preset medium \
  -pix_fmt yuv420p \
  -tag:v hvc1 \
  -b:v 20M \
  -maxrate 25M \
  -bufsize 40M \
  -colorspace bt709 \
  -color_primaries bt709 \
  -color_trc bt709 \
  -movflags +faststart \
  "$DELIVERY" 2>&1 | tail -5

echo ""
echo "=== Done ==="
echo "ProRes master: $PRORES ($(ls -lh "$PRORES" | awk '{print $5}'))"
echo "H.265 delivery: $DELIVERY ($(ls -lh "$DELIVERY" | awk '{print $5}'))"

# Cleanup frames
rm -rf "$FRAME_DIR"
