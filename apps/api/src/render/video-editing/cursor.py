"""One tiny sprite input + one command-driven overlay, in source assembly's encode.

No growing per-event expression/filter graph, no full-resolution RGBA pipe, and no
invented motion between clicks. Coordinates are sampled from actual input events.
"""
import json
import math
from pathlib import Path


def number(value, name, low, high=math.inf):
    if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f"{name} must be a finite number between {low} and {high}")
    return value


def prepare_cursor(engine, args, info, folder, input_index):
    VideoError = ValueError

    telemetry = engine.path(args["cursor"])
    if telemetry.stat().st_size > 128 * 1024 * 1024:
        raise VideoError("Cursor telemetry exceeds 128 MiB")
    data = json.loads(telemetry.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("version") != 2 or data.get("complete") is not True:
        raise VideoError("Cursor telemetry is incomplete; recover the complete capture or retake")
    duration, video = info["duration"], info["video"]
    if data.get("width") != video["display_width"] or data.get("height") != video["display_height"]:
        raise VideoError("Cursor telemetry viewport does not match the capture")
    capture_start = number(args.get("capture_start"), "capture_start", 0)
    if abs(number(data.get("startTime"), "cursor.startTime", 0) - capture_start) > 1:
        raise VideoError("Cursor telemetry and video have different capture clocks")
    if abs(number(data.get("duration"), "cursor.duration", 0) - duration) > max(0.1, 2 / video["fps"]):
        raise VideoError("Cursor telemetry does not cover the complete video")
    events = data.get("events")
    if not isinstance(events, list) or not events or len(events) > 1_000_000:
        raise VideoError("Cursor telemetry requires 1–1000000 events")
    previous = -1
    for event in events:
        if not isinstance(event, dict):
            raise VideoError("Cursor events must be objects")
        time = number(event.get("time"), "cursor.time", 0, data["duration"] + 0.001)
        if time < previous:
            raise VideoError("Cursor telemetry must be chronological")
        previous = time
        number(event.get("x"), "cursor.x", -video["display_width"], 2 * video["display_width"])
        number(event.get("y"), "cursor.y", -video["display_height"], 2 * video["display_height"])
        if event.get("shape") not in ("arrow", "hand", "text", "hidden"):
            raise VideoError("Unknown cursor shape")
        if event.get("kind") not in ("move", "down", "up", "hide", "document", "scroll", "key"):
            raise VideoError("Unknown cursor event")
        if type(event.get("buttons")) is not int or not 0 <= event["buttons"] <= 31:
            raise VideoError("Invalid cursor buttons")
        if type(event.get("page")) is not int or event["page"] < -1:
            raise VideoError("Invalid cursor page")
    if events[0]["time"] != 0:
        raise VideoError("Cursor telemetry must include the initial state at time zero")

    sprites = json.loads(engine.run(["node", Path(__file__).with_name("cursor-assets.mjs"),
                                    folder, video["display_width"]]).stdout)
    fps = number(video["fps"], "cursor fps", 1, 120)
    frames = math.ceil(duration * fps)
    index, current, pressed_until = 0, events[0], -1
    commands, runs, last_position, initial_position = [], [], None, None
    for frame in range(frames):
        time = frame / fps
        while index < len(events) and events[index]["time"] <= time + 1e-7:
            current = events[index]
            # Make even a sub-frame click legible without moving its onset early.
            if current["kind"] == "down":
                pressed_until = current["time"] + 0.10
            if current["kind"] in ("document", "hide"):
                pressed_until = -1
            index += 1
        hidden = current["shape"] == "hidden" or current["page"] == -1
        x, y = current["x"], current["y"]
        # Interpolate only dense movement samples within the SAME document/page.
        # Never glide toward a future click, across navigation or an idle gap.
        if index < len(events):
            next_event = events[index]
            gap = next_event["time"] - current["time"]
            if current["kind"] == next_event["kind"] == "move" and 0 < gap <= 0.1 and \
                    current["page"] == next_event["page"] and current["shape"] == next_event["shape"]:
                fraction = max(0, min(1, (time - current["time"]) / gap))
                x += (next_event["x"] - x) * fraction
                y += (next_event["y"] - y) * fraction
        position = (-sprites["size"], -sprites["size"]) if hidden else (
            round(x - sprites["hotspot"]), round(y - sprites["hotspot"]))
        if position != last_position:
            if initial_position is None:
                initial_position = position
            else:
                # Update after the preceding OUTPUT frame. Input-branch commands
                # race framesync lookahead and can move the cursor too early.
                commands.append(f"{max(0, (frame - 1) / fps - 1e-7):.9f} [enter] overlay@pointer x {position[0]}, overlay@pointer y {position[1]};")
            last_position = position
        shape = "arrow" if hidden else current["shape"]
        sprite = shape + ("-pressed" if current["buttons"] or time < pressed_until else "")
        if not runs or runs[-1][1] != sprite:
            runs.append((frame, sprite))

    command_file = folder / "cursor.commands"
    command_file.write_text("\n".join(commands), encoding="utf-8")
    # Sparse, 64px sprite changes decoded in the same FFmpeg invocation. Each
    # image's timebase matches the video; no 25fps concat rounding of 30fps events.
    lines = ["ffconcat version 1.0"]
    for i, (frame, sprite) in enumerate(runs):
        end = runs[i + 1][0] if i + 1 < len(runs) else frames
        lines += [f"file '{sprite}.png'", f"option framerate {fps}", f"duration {(end - frame) / fps:.9f}"]
    lines += [f"file '{runs[-1][1]}.png'", f"option framerate {fps}"]
    sequence = folder / "cursor.ffconcat"
    sequence.write_text("\n".join(lines) + "\n", encoding="utf-8")
    # Use fixed local basenames under cwd: no FFmpeg filter-path quoting hazards.
    command_filter = ",sendcmd=f=cursor.commands" if commands else ""
    graph = [f"[0:{video['index']}]fps={fps}[screen]",
             f"[{input_index}:v]fps={fps},format=rgba[sprite]",
             f"[screen][sprite]overlay@pointer=x={initial_position[0]}:y={initial_position[1]}:eval=frame:format=yuv420:shortest=1{command_filter}[cursor_video]"]
    return {"inputs": ["-f", "concat", "-safe", "0", "-i", sequence], "filters": graph,
            "report": {"events": len(events), "position_updates": len(commands), "sprite_runs": len(runs),
                       "sprite_size": sprites["size"], "fps": fps, "telemetry": str(telemetry)}}
