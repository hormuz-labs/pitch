#!/usr/bin/env python3
"""
Capture each frame of a GSAP animation as lossless JPEG frames
via Chrome DevTools Protocol.

Usage:
  python3 capture-frames.py <cdp-url> <output-dir> [fps=24] [duration=50]

Connects to a running Chrome, stops the animation sync loop,
then steps through each frame by setting MASTER_TL.time() and
capturing a screenshot.

Dependencies: websockets (pip install websockets)
"""

import asyncio
import websockets
import json
import base64
import os
import sys
import time
import urllib.request


async def capture():
    cdp_url = sys.argv[1]
    out_dir = sys.argv[2]
    fps = float(sys.argv[3]) if len(sys.argv) > 3 else 24
    duration = float(sys.argv[4]) if len(sys.argv) > 4 else 50
    os.makedirs(out_dir, exist_ok=True)

    # Resolve page target from browser CDP
    port = cdp_url.split(":")[2].split("/")[0]
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json") as resp:
        targets = json.loads(resp.read())

    page = None
    for t in targets:
        if t["type"] == "page" and (t.get("url", "").startswith("http://localhost")
                                     or t.get("url", "").startswith("http://127.0.0.1")):
            page = t
            break
    if not page:
        for t in targets:
            if t["type"] == "page":
                page = t
                break
    if not page:
        print("ERROR: No page target found", file=sys.stderr)
        sys.exit(1)

    ws_url = page["webSocketDebuggerUrl"]
    print(f"  Page: {page.get('url', 'unknown')}", flush=True)

    total_frames = int(duration * fps)
    start_wall = time.time()

    async with websockets.connect(ws_url, max_size=50 * 1024 * 1024) as ws:
        # Enable Page domain
        await ws.send(json.dumps({"id": 1, "method": "Page.enable"}))
        await ws.recv()

        # Ensure 4K viewport
        await ws.send(json.dumps({
            "id": 2, "method": "Emulation.setDeviceMetricsOverride",
            "params": {"width": 3840, "height": 2160, "deviceScaleFactor": 1}
        }))
        await ws.recv()

        # Stop the auto-advancing syncLoop by killing requestAnimationFrame.
        # The page's syncLoop (driven by rAF) overwrites MASTER_TL.time()
        # with real clock time, causing frame offset.
        await ws.send(json.dumps({
            "id": 3, "method": "Runtime.evaluate",
            "params": {
                "expression": """
                window.__origRAF = window.requestAnimationFrame;
                window.requestAnimationFrame = function(){ return 0; };
                window.__TL = window.MASTER_TL;
                if (window.__TL) window.__TL.time(0);
                window.__TL ? window.__TL.duration() : -1;
                """,
                "returnByValue": True
            }
        }))
        resp = json.loads(await ws.recv())
        anim_duration = resp.get("result", {}).get("result", {}).get("value", duration)
        print(f"  Animation duration: {anim_duration}s", flush=True)

        await asyncio.sleep(0.2)

        msg_id = 10
        frame = 0

        while frame < total_frames:
            t = frame / fps

            msg_id += 1
            await ws.send(json.dumps({
                "id": msg_id,
                "method": "Runtime.evaluate",
                "params": {"expression": f"window.__TL.time({t})", "returnByValue": True}
            }))
            await ws.recv()

            msg_id += 1
            await ws.send(json.dumps({
                "id": msg_id,
                "method": "Page.captureScreenshot",
                "params": {"format": "jpeg", "quality": 100, "fromSurface": True}
            }))
            resp = json.loads(await ws.recv())

            if "error" in resp:
                print(f"  WARN: frame {frame}: {resp['error']}", file=sys.stderr)
                frame += 1
                continue

            path = os.path.join(out_dir, f"frame-{frame:05d}.jpg")
            with open(path, "wb") as f:
                f.write(base64.b64decode(resp["result"]["data"]))

            frame += 1
            if frame % 100 == 0:
                elapsed = time.time() - start_wall
                rate = frame / elapsed
                eta = (total_frames - frame) / rate
                print(f"  [{frame}/{total_frames}] {rate:.1f} fps, ETA {eta:.0f}s", flush=True)

        elapsed = time.time() - start_wall
        print(f"  Done: {frame} frames in {elapsed:.1f}s ({frame/elapsed:.1f} fps)", flush=True)


if __name__ == "__main__":
    asyncio.run(capture())
