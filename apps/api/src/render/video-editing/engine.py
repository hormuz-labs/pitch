#!/usr/bin/env python3
"""Pitch video editor. Migrated from the supplied OpenCode/DaVinci backend.

Standard library only; invoked by a metered host action, never the agent VM.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import uuid


class VideoError(Exception):
    pass


COVERAGE_KINDS = ("activity", "typing", "stream", "speech", "scroll", "interaction", "reading")


def number(value, name, low=None, high=None):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise VideoError(f"{name} must be a finite number")
    if low is not None and value < low or high is not None and value > high:
        raise VideoError(f"{name} must be between {low} and {high}")
    return float(value)


def keys(value, allowed, name):
    if not isinstance(value, dict):
        raise VideoError(f"{name} must be an object")
    extra = set(value) - set(allowed.split())
    if extra:
        raise VideoError(f"Unknown {name} fields: {', '.join(sorted(extra))}")


def boolean(value, name):
    if not isinstance(value, bool):
        raise VideoError(f"{name} must be a boolean")
    return value


def box(value, name="box"):
    keys(value, "x y width height", name)
    result = {key: number(value.get(key), f"{name}.{key}", 0, 1) for key in ("x", "y", "width", "height")}
    if result["width"] <= 0 or result["height"] <= 0:
        raise VideoError(f"{name} must have positive dimensions")
    if result["x"] + result["width"] > 1.0000001 or result["y"] + result["height"] > 1.0000001:
        raise VideoError(f"{name} extends beyond the frame")
    return result


def intersect_ranges(left, right):
    """Intersect ordered, disjoint ranges without a frame-count-squared scan."""
    result, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        a, b = left[i]
        c, d = right[j]
        if max(a, c) < min(b, d):
            result.append((max(a, c), min(b, d)))
        if b <= d:
            i += 1
        else:
            j += 1
    return result


def complement(ranges, duration):
    result, cursor = [], 0.0
    for a, b in sorted(ranges):
        a, b = max(0, a), min(duration, b)
        if a > cursor:
            result.append((cursor, a))
        cursor = max(cursor, b)
    if cursor < duration:
        result.append((cursor, duration))
    return result


def static_ranges(log, tolerance=8):
    still, start, previous = [], None, None
    for block in re.split(r"(?=frame:\d+)", log):
        stamp = re.search(r"pts_time:([\d.e+-]+)", block)
        black = re.search(r"lavfi.blackframe.pblack=(\d+)", block)
        values = re.findall(r"lavfi.signalstats.[YUV]MAX=([\d.e+-]+)", block)
        if not stamp or (not black and len(values) != 3):
            continue
        time = float(stamp[1])
        unchanged = int(black[1]) == 100 if black else all(float(v) <= tolerance for v in values)
        if unchanged:
            if start is None:
                start = time if previous is None else previous
        elif start is not None:
            still.append((start, previous))
            start = None
        previous = time
    if previous is None:
        raise VideoError("No frame-difference evidence decoded; preprocessing aborted")
    if start is not None:
        still.append((start, previous))
    return still


# Direct media only. Playlist/concat demuxers could open paths not checked by
# Engine.path; network protocols and nested demuxers are not accepted as inputs.
MEDIA_FORMATS = "mov,matroska,webm,avi,mp3,wav,flac,ogg,aac,image2,png_pipe,jpeg_pipe,webp_pipe,bmp_pipe"


class Engine:
    def __init__(self, root):
        self.root = Path(root).resolve()
        # Never read executable overrides from an agent-writable workspace.
        self.ffmpeg = shutil.which("ffmpeg") or "ffmpeg"
        self.ffprobe = shutil.which("ffprobe") or "ffprobe"
        self.cache = {}

    def path(self, value, exists=True):
        if not isinstance(value, str) or not value:
            raise VideoError("Expected a nonempty local file path")
        path = (self.root / value).resolve()
        try:
            path.relative_to(self.root)
        except ValueError:
            raise VideoError(f"Path is outside this project: {value}")
        if exists and not path.is_file():
            raise VideoError(f"File does not exist: {path}")
        return path

    def portable(self, value):
        """Reports and saved snapshots survive worker/render-tier placement."""
        if isinstance(value, dict):
            return {key: self.portable(item) for key, item in value.items()}
        if isinstance(value, list):
            return [self.portable(item) for item in value]
        if isinstance(value, str) and value.startswith(str(self.root) + os.sep):
            return str(Path(value).relative_to(self.root))
        return value

    def run(self, args, timeout=1800, cwd=None):
        try:
            result = subprocess.run([str(a) for a in args], cwd=cwd or self.root,
                                    capture_output=True, text=True, timeout=timeout)
        except FileNotFoundError as exc:
            raise VideoError(f"Missing host executable: {args[0]}") from exc
        except subprocess.TimeoutExpired as exc:
            raise VideoError(f"Media command timed out after {timeout}s") from exc
        if result.returncode:
            raise VideoError(f"{Path(str(args[0])).name} failed ({result.returncode}):\n{result.stderr[-6000:]}")
        return result

    def ff(self, args, verbose=False, cwd=None, internal_concat=False):
        safe = []
        for arg in args:
            if arg == "-i":
                safe += ["-protocol_whitelist", "file", "-format_whitelist",
                         "concat," + MEDIA_FORMATS if internal_concat else MEDIA_FORMATS]
            safe.append(arg)
        return self.run([self.ffmpeg, "-hide_banner", "-loglevel", "info" if verbose else "error", "-nostdin", "-y", "-filter_complex_threads", "1", *safe], cwd=cwd)

    def workspace(self):
        path = self.path(".video-work", exists=False)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def capabilities(self, _):
        result = {"python": sys.version.split()[0], "ffmpeg": bool(shutil.which(self.ffmpeg)), "ffprobe": bool(shutil.which(self.ffprobe)), "transcription": "pitch media transcribe (host whisper.cpp)"}
        if result["ffmpeg"]:
            filters = self.run([self.ffmpeg, "-hide_banner", "-filters"]).stdout
            result["filters"] = {f: bool(re.search(r"\s" + f + r"\s", filters)) for f in ("zoompan", "subtitles", "drawtext", "overlay", "loudnorm", "afftdn", "silencedetect", "blackdetect", "xfade")}
            result["version"] = self.run([self.ffmpeg, "-version"]).stdout.splitlines()[0]
        result["visual_understanding"] = "Open images[].path with pi's read tool; this backend does not infer visual targets."
        return result

    def probe_file(self, path):
        path = self.path(str(path))
        stamp = (str(path), path.stat().st_mtime_ns, path.stat().st_size)
        if stamp in self.cache:
            return self.cache[stamp]
        raw = json.loads(self.run([self.ffprobe, "-v", "error", "-protocol_whitelist", "file", "-format_whitelist", MEDIA_FORMATS, "-show_format", "-show_streams", "-of", "json", path]).stdout)
        videos = [s for s in raw["streams"] if s["codec_type"] == "video" and not s.get("disposition", {}).get("attached_pic")]
        audios = [s for s in raw["streams"] if s["codec_type"] == "audio"]
        v = videos[0] if videos else None
        result = {"path": str(path), "duration": float(raw.get("format", {}).get("duration", 0)), "video": None, "audio_tracks": [{"index": s["index"], "codec": s.get("codec_name"), "sample_rate": s.get("sample_rate"), "channels": s.get("channels"), "tags": s.get("tags", {})} for s in audios]}
        if v:
            rotation = float(v.get("tags", {}).get("rotate", 0))
            for side in v.get("side_data_list", []):
                rotation = float(side.get("rotation", rotation))
            log = self.ff(["-i", path, "-map", f"0:{v['index']}", "-vf", "scale=round(iw*sar):ih,setsar=1,showinfo", "-frames:v", "1", "-an", "-f", "null", "-"], verbose=True).stderr
            match = re.search(r"\bs:(\d+)x(\d+)", log)
            if not match:
                raise VideoError("Could not determine decoded display dimensions")
            try:
                numerator, denominator = map(float, v.get("avg_frame_rate", "0/1").split("/"))
                fps = numerator / denominator if denominator else 0
            except ValueError:
                fps = 0
            result["video"] = {"index": v["index"], "codec": v.get("codec_name"), "coded_width": v["width"], "coded_height": v["height"], "display_width": int(match[1]), "display_height": int(match[2]), "rotation": rotation, "sample_aspect_ratio": v.get("sample_aspect_ratio"), "fps": fps or 30, "average_frame_rate": v.get("avg_frame_rate"), "nominal_frame_rate": v.get("r_frame_rate"), "pixel_format": v.get("pix_fmt"), "color_transfer": v.get("color_transfer"), "hdr": v.get("color_transfer") in ("smpte2084", "arib-std-b67"), "color_space": v.get("color_space")}
        self.cache[stamp] = result
        return result

    def probe(self, args):
        return self.probe_file(args["source"])

    def video(self, source):
        info = self.probe_file(source)
        if not info["video"]:
            raise VideoError(f"No video stream: {source}")
        return info

    def frame(self, source, time, dest, filters=""):
        info = self.video(source)
        number(time, "time", 0)
        if info["duration"] and time >= info["duration"]:
            raise VideoError("Frame timestamp must be before the source duration")
        chain = "scale=round(iw*sar):ih,setsar=1" + ("," + filters if filters else "")
        # Input-side accurate seeking decodes from the preceding keyframe, not
        # from the beginning for every requested screenshot. Transcoding retains
        # FFmpeg's default accurate-seek discard up to the requested timestamp.
        self.ff(["-ss", time, "-i", info["path"], "-map", f"0:{info['video']['index']}", "-vf", chain, "-frames:v", "1", "-threads", "1", dest])
        if not dest.is_file():
            raise VideoError(f"No frame decoded at {time}s")

    def frames(self, args):
        info = self.video(args["source"])
        times = args.get("times", [0])
        if not isinstance(times, list) or not 1 <= len(times) <= 12:
            raise VideoError("Supply between 1 and 12 timestamps per call")
        width = int(number(args.get("max_width", 1280), "max_width", 160, 3840))
        grid = boolean(args.get("grid", False), "grid")
        contact_sheet = boolean(args.get("contact_sheet", False), "contact_sheet")
        tile_width = int(number(args.get("tile_width", 480), "tile_width", 160, 960))
        for time in times:
            number(time, "time", 0)
            if info["duration"] and time >= info["duration"]:
                raise VideoError("Frame timestamp must be before the source duration")
        folder = Path(tempfile.mkdtemp(prefix="frames-", dir=self.workspace()))
        images = []
        for i, time in enumerate(times):
            filters = f"scale='min({width},iw)':-1"
            if grid:
                filters += ",drawgrid=w=iw/10:h=ih/10:t=1:c=yellow@0.65"
            dest = folder / f"frame-{i:02d}.png"
            self.frame(args["source"], time, dest, filters)
            images.append({"path": str(dest), "time": time, "grid": "10x10; origin top-left; each cell 0.1" if grid else None})
        result = {"source": info, "coordinate_space": "Normalized [0,1] of the full auto-rotated, square-pixel source. Display scaling does not change normalized coordinates.", "images": images}
        if contact_sheet:
            result["frames"] = images
            result["images"] = self.frame_sheets(images, info, folder, tile_width)
            result["note"] = "Open images[].path contact sheets first. frames[] retains individual images for detail. Measure inside each tile's content_box, excluding labels and sheet offsets."
        return result

    def frame_sheets(self, images, info, folder, tile_width):
        v = info["video"]
        tile_height = max(1, round(tile_width * v["display_height"] / v["display_width"]))
        cell_height = tile_height + 28
        sheets = []
        for start in range(0, len(images), 8):
            page = images[start:start + 8]
            inputs, filters, tiles = [], [], []
            filters.append(f"color=c=0x202020:s={tile_width * 4}x{cell_height * 2},format=rgb24[base0]")
            for i, image in enumerate(page):
                inputs += ["-i", image["path"]]
                x, y = (i % 4) * tile_width, (i // 4) * cell_height
                label = f"{start + i + 1} | {image['time']:.3f} s"
                filters.append(f"[{i}:v]scale={tile_width}:{tile_height},setsar=1,format=rgb24,"
                               f"pad={tile_width}:{cell_height}:0:0:color=0x202020,"
                               f"drawtext=text='{label}':x=8:y={tile_height + 5}:fontsize=18:fontcolor=white[t{i}]")
                filters.append(f"[base{i}][t{i}]overlay=x={x}:y={y}:format=rgb[base{i + 1}]")
                tiles.append({"index": start + i, "time": image["time"], "path": image["path"],
                              "content_box": {"x": x, "y": y, "width": tile_width, "height": tile_height}})
            dest = folder / f"sheet-{start // 8:02d}.png"
            self.ff([*inputs, "-filter_complex", ";".join(filters), "-map", f"[base{len(page)}]",
                     "-frames:v", "1", "-threads", "1", dest])
            sheets.append({"path": str(dest), "kind": "contact_sheet", "columns": 4, "rows": 2,
                           "width": tile_width * 4, "height": cell_height * 2, "tiles": tiles})
        return sheets

    def viewport(self, target, width, height, out_width, out_height, margin=0.15):
        target = box(target, "target")
        margin = number(margin, "margin", 0, 2)
        ratio = out_width / out_height
        tw, th = target["width"] * width, target["height"] * height
        cw = max(tw * (1 + 2 * margin), th * (1 + 2 * margin) * ratio)
        ch = cw / ratio
        if cw > width or ch > height:
            cw = min(width, height * ratio)
            ch = cw / ratio
            if cw + 1e-6 < tw or ch + 1e-6 < th:
                raise VideoError("Target cannot fit inside a source crop at this output aspect ratio. Use fit=contain or a wider composition.")
        cx = (target["x"] + target["width"] / 2) * width
        cy = (target["y"] + target["height"] / 2) * height
        x, y = max(0, min(cx - cw / 2, width - cw)), max(0, min(cy - ch / 2, height - ch))
        return {"x": x / width, "y": y / height, "width": cw / width, "height": ch / height}

    def focus(self, args):
        info = self.video(args["source"])
        w, h = info["video"]["display_width"], info["video"]["display_height"]
        ow = int(number(args.get("width", 1920), "width", 16, 7680))
        oh = int(number(args.get("height", 1080), "height", 16, 7680))
        viewport = self.viewport(args["target"], w, h, ow, oh, args.get("margin", 0.15))
        folder = Path(tempfile.mkdtemp(prefix="focus-", dir=self.workspace()))
        x, y, cw, ch = (viewport[k] * size for k, size in (("x", w), ("y", h), ("width", w), ("height", h)))
        self.frame(args["source"], args["time"], folder / "context.png", f"drawbox=x={x}:y={y}:w={cw}:h={ch}:color=lime:t=4,scale='min(1280,iw)':-1")
        self.frame(args["source"], args["time"], folder / "crop.png", f"crop={cw}:{ch}:{x}:{y},scale={min(1280, ow)}:-1")
        return {"viewport": viewport, "source_crop_pixels": {"width": cw, "height": ch}, "upscale_factor": ow / cw, "note": "Review BOTH context and crop. This validates geometry, not semantic correctness. Recheck other timestamps before using on moving subjects.", "images": [{"path": str(folder / "context.png"), "time": args["time"]}, {"path": str(folder / "crop.png"), "time": args["time"]}]}

    def analyze(self, args):
        info = self.video(args["source"])
        start = number(args.get("start", 0), "start", 0)
        end = number(args.get("end", info["duration"]), "end", start + 0.001, info["duration"])
        threshold = number(args.get("silence_db", -35), "silence_db", -90, -5)
        duration = number(args.get("silence_duration", 0.6), "silence_duration", 0.1, 30)
        video_filters = f"trim=start={start}:end={end},setpts=PTS-{start}/TB"
        video_filters += ",blackdetect=d=0.2:pix_th=0.1,select='gt(scene,0.3)',showinfo"
        cmd = ["-i", info["path"], "-map", f"0:{info['video']['index']}", "-vf", video_filters]
        if info["audio_tracks"]:
            audio_filters = f"atrim=start={start}:end={end},asetpts=PTS-{start}/TB,aresample=48000:async=1:first_pts=0"
            audio_filters += f",silencedetect=noise={threshold}dB:d={duration}"
            cmd += ["-map", f"0:{info['audio_tracks'][0]['index']}", "-af", audio_filters]
        log = self.ff([*cmd, "-f", "null", "-"], verbose=True).stderr
        silences, pending = [], None
        for line in log.splitlines():
            match = re.search(r"silence_start: ([\d.e+-]+)", line)
            if match:
                pending = float(match[1]) + start
            match = re.search(r"silence_end: ([\d.e+-]+)", line)
            if match and pending is not None:
                silences.append({"start": pending, "end": float(match[1]) + start})
                pending = None
        if pending is not None:
            silences.append({"start": pending, "end": end})
        black = [{"start": float(a) + start, "end": float(b) + start} for a, b in re.findall(r"black_start:([\d.e+-]+) black_end:([\d.e+-]+)", log)]
        scenes = [float(t) + start for t in re.findall(r"pts_time:([\d.e+-]+)", log)]
        return {"source": info["path"], "time_basis": "source seconds", "range": [start, end], "silences": silences[:1000], "black_intervals": black[:1000], "scene_candidates": scenes[:1000], "note": "Heuristic review candidates, NOT automatic cut instructions. Analyze uses the first audio track."}

    def preprocess(self, args):
        """Conservative dead-time removal before editorial decisions, with an explicit map.

        Compare EVERY decoded pixel/frame, not scene scores or sampled thumbnails:
        tiny typing/streaming changes matter. Silence is a stricter gate than VAD;
        music/noise keeps footage rather than risking a false speech-negative cut.
        """
        info = self.video(args["source"])
        duration = number(info["duration"], "duration", 0.001)
        fps = info["video"]["fps"]
        if not 1 <= fps <= 120:
            raise VideoError("Preprocess requires a frame rate between 1 and 120")
        track = number(args.get("audio_track", 0), "audio_track", 0)
        if track % 1:
            raise VideoError("audio_track must be an integer")
        track = int(track)
        if len(info["audio_tracks"]) > 1 and "audio_track" not in args:
            raise VideoError("Select audio_track explicitly for a multi-track source")
        if info["audio_tracks"] and track >= len(info["audio_tracks"]):
            raise VideoError("audio_track is out of range")
        protected, obligations = [], []
        for item in args.get("protect", []):
            keys(item, "start end kind", "protect range")
            span = self.time_range(item, duration)
            kind = item.get("kind", "activity")
            if kind not in COVERAGE_KINDS:
                raise VideoError(f"protect.kind must be one of {', '.join(COVERAGE_KINDS)}")
            protected.append(span)
            obligations.append((*span, kind))
        # Explicit editorial evidence can distinguish task progress from an
        # unrelated autoplay thumbnail/caret. Never infer this from silence alone.
        reviewed_idle = []
        for item in args.get("reviewed_idle", []):
            keys(item, "start end reason", "reviewed_idle range")
            if not isinstance(item.get("reason"), str) or not item["reason"].strip():
                raise VideoError("reviewed_idle requires a reason describing the inspected idle interval")
            reviewed_idle.append(self.time_range(item, duration))
        # Per-pixel tolerance absorbs low-level codec noise, not small areas:
        # one changed character still counts. Cursor blink/spinners retain time.
        def scan(graph, tolerance):
            # Stack the unscaled Y/U/V planes as gray pixels. blackframe floors
            # its percentage: 100 means EVERY pixel is below tolerance+1. One
            # changed character/chroma pixel makes it <100. This is equivalent
            # to three channel maxima, without signalstats' histogram/hue work.
            pixels = info["video"]["coded_width"] * info["video"]["coded_height"]
            if pixels * 3 * 100 > 0xffffffff:
                # blackframe uses a 32-bit counter before dividing by area.
                # Keep exact maxima on oversized sources rather than overflow.
                graph += "signalstats,metadata=mode=print:file=-[diff]"
            else:
                graph += (f"extractplanes=y+u+v[y][u][v];[y][u][v]vstack=inputs=3,"
                          f"blackframe=amount=0:threshold={tolerance + 1},metadata=mode=print:file=-[diff]")
            log = self.ff(["-i", info["path"], "-an", "-filter_complex", graph,
                           "-map", "[diff]", "-f", "null", "-"], verbose=True).stdout
            return static_ranges(log, tolerance)

        # Independent scans share no output files. Two processes make use of the
        # render tier without sampling/skipping frames or relaxing the cut gate.
        with ThreadPoolExecutor(max_workers=2) as scans:
            adjacent = scans.submit(scan, f"[0:{info['video']['index']}]format=yuv444p,tblend=all_mode=difference,", 8)
            baseline = None
            if duration > 2:
                # Slow changes can be below the adjacent threshold yet visible
                # over one second. Keep the existing second gate at every frame.
                baseline = scans.submit(scan,
                    f"[0:{info['video']['index']}]format=yuv444p,split[now][past];"
                    "[past]setpts=PTS+1/TB[lag];[now][lag]blend=all_mode=difference:shortest=1,", 16)
            still = adjacent.result()
            if baseline is not None:
                still = intersect_ranges(still, baseline.result())
        silent = [(0, duration)]
        if info["audio_tracks"]:
            # -50 dB and boundary handles deliberately preserve quiet speech.
            audio = self.ff(["-i", info["path"], "-map", f"0:{info['audio_tracks'][track]['index']}",
                             "-vn", "-af", "silencedetect=noise=-50dB:d=0.3", "-f", "null", "-"], verbose=True).stderr
            silent, pending = [], None
            for line in audio.splitlines():
                match = re.search(r"silence_start: ([\d.e+-]+)", line)
                if match:
                    pending = max(0, float(match[1]))
                match = re.search(r"silence_end: ([\d.e+-]+)", line)
                if match and pending is not None:
                    silent.append((pending, min(duration, float(match[1]))))
                    pending = None
            if pending is not None:
                silent.append((pending, duration))
        # Union reviewed spans with pixel-static evidence. Audio/protected ranges
        # remain authoritative even when the supplied review interval is too wide.
        eligible = complement(complement(still + reviewed_idle, duration), duration)
        candidates = intersect_ranges(intersect_ranges(eligible, silent), complement(protected, duration))
        removed = []
        for a, b in candidates:
            # Keep orientation/reading and speech handles on BOTH sides. Round
            # inward, so frame quantization cannot expand a cut into activity.
            if b - a >= 2:
                left = math.ceil((a + 0.4) * fps) / fps
                right = math.floor((b - 0.4) * fps) / fps
                if right - left >= 1:
                    removed.append((left, right))
        kept = complement(removed, duration)
        folder = Path(tempfile.mkdtemp(prefix="preprocess-", dir=self.workspace()))
        source = folder / "prepared.mp4"
        plan_path = folder / "prepass.json"
        prepass = {"version": 1, "output": {"path": str(source), "width": info["video"]["display_width"],
                    "height": info["video"]["display_height"], "fps": fps, "preset": "veryfast"},
                   "clips": [{"source": info["path"], "in": a, "out": b, "audio_track": track}
                             if info["audio_tracks"] else {"source": info["path"], "in": a, "out": b}
                             for a, b in kept]}
        plan_path.write_text(json.dumps(self.portable(prepass)), encoding="utf-8")
        rendered = self.render({"plan": str(plan_path)})
        audible = complement(silent, duration)
        speech = []
        for item in rendered["timeline"]:
            for a, b in intersect_ranges(audible, [(item["source_in"], item["source_out"])]):
                speech.append({"start": item["start"] + a - item["source_in"],
                               "end": min(item["end"], item["start"] + b - item["source_in"])})
        coverage = [{"source": str(source), "start": 0, "end": rendered["duration"], "kind": "activity"}]
        coverage += [{"source": str(source), **span, "kind": "speech"} for span in speech if span["end"] > span["start"]]
        for a, b, kind in obligations:
            for item in rendered["timeline"]:
                for left, right in intersect_ranges([(a, b)], [(item["source_in"], item["source_out"])]):
                    coverage.append({"source": str(source), "kind": kind,
                        "start": item["start"] + left - item["source_in"],
                        "end": min(item["end"], item["start"] + right - item["source_in"])})
        # Bind preservation to the prepared media too. Starting a fresh plan or
        # accidentally omitting its coverage field must not disable the guard.
        with source.with_suffix(".coverage.json").open("x", encoding="utf-8") as handle:
            json.dump(self.portable({"version": 1, "coverage": coverage}), handle, indent=2)
        starter = folder / "edit.json"
        starter.write_text(json.dumps(self.portable({"version": 1,
            "output": {"path": f"renders/edited-{uuid.uuid4().hex[:8]}.mp4", "width": prepass["output"]["width"],
                       "height": prepass["output"]["height"], "fps": fps, "continuous_camera": True},
            "coverage": coverage, "clips": [{"source": str(source)}]}), indent=2), encoding="utf-8")
        report = {"source": str(source), "original": info["path"], "duration": rendered["duration"],
                  "removed_seconds": sum(b - a for a, b in removed), "removed": removed,
                  "still": still, "silences": silent, "reviewed_idle": args.get("reviewed_idle", []),
                  "map": rendered["timeline"], "plan": str(starter), "prepass_plan": str(plan_path),
                  "policy": "Every decoded frame; maximum per-pixel Y/U/V change <=8/255 adjacent and <=16/255 over 1s, or explicitly reviewed idle, AND silence below -50 dB for >=2s; 0.4s handles. Protected ranges always win. No VAD-only cuts. Keep coverage; speech, scroll, interactions and reading stay at 1x; speed silent typing/streaming rather than deleting it.",
                  "next": "Read the prepared source and starter plan. Map original transcript/action times through map before camera cues; removed times have no mapping."}
        report_path = folder / "preprocess.json"
        report_path.write_text(json.dumps(self.portable(report), indent=2), encoding="utf-8")
        return {**report, "report": str(report_path)}

    def load_plan(self, value, allow_existing_output=False):
        path = self.path(value)
        try:
            plan = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, UnicodeError) as exc:
            raise VideoError(f"Invalid plan JSON: {exc}") from exc
        return self.validate_plan(plan, path, allow_existing_output)

    def validate_plan(self, plan, path, allow_existing_output=False):
        """Validate an in-memory candidate; authoring validates a copy before commit."""
        keys(plan, "version output clips overlays music captions redactions coverage", "plan")
        if type(plan.get("version")) is not int or plan["version"] != 1:
            raise VideoError("Plan version must be 1")
        out = plan.get("output")
        keys(out, "path width height fps crf preset normalize_audio continuous_camera", "output")
        output = self.path(out.get("path"), exists=False)
        if output.suffix.lower() != ".mp4":
            raise VideoError("Output must be .mp4 (H.264/AAC)")
        for k, default in (("width", 1920), ("height", 1080)):
            n = number(out.get(k, default), k, 16, 7680)
            if n % 2:
                raise VideoError(f"{k} must be an even integer")
            out[k] = int(n)
        out["fps"] = number(out.get("fps", 30), "fps", 1, 120)
        out["crf"] = number(out.get("crf", 18), "crf", 0, 40)
        out["preset"] = out.get("preset", "medium")
        if out["preset"] not in ("ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"):
            raise VideoError("Invalid H.264 preset")
        boolean(out.get("normalize_audio", False), "normalize_audio")
        continuous_camera = boolean(out.get("continuous_camera", False), "continuous_camera")
        clips = plan.get("clips")
        if not isinstance(clips, list) or not 1 <= len(clips) <= 100:
            raise VideoError("A plan needs 1–100 clips")
        timeline, total, inputs, warnings = [], 0.0, {path}, []
        for i, clip in enumerate(clips):
            keys(clip, "source in out speed fit camera volume mute audio_track fade_in fade_out brightness contrast saturation denoise note transition", f"clip {i}")
            info = self.video(clip.get("source"))
            inputs.add(Path(info["path"]))
            if info["duration"] <= 0:
                raise VideoError("Clips must be finite-duration video files")
            start = number(clip.get("in", 0), "in", 0, info["duration"])
            end = number(clip.get("out", info["duration"]), "out", start + 0.001, info["duration"] + 0.001)
            speed = number(clip.get("speed", 1), "speed", 0.125, 8)
            frames = round((end - start) / speed * out["fps"])
            if frames < 1:
                raise VideoError(f"Clip {i} is shorter than one output frame")
            duration = frames / out["fps"]
            clip.update({"in": start, "out": end, "speed": speed})
            if clip.get("fit", "contain") not in ("contain", "cover"):
                raise VideoError("fit must be contain or cover")
            for k in ("mute", "denoise"):
                boolean(clip.get(k, False), k)
            number(clip.get("volume", 1), "volume", 0, 8)
            number(clip.get("brightness", 0), "brightness", -1, 1)
            number(clip.get("contrast", 1), "contrast", 0, 3)
            number(clip.get("saturation", 1), "saturation", 0, 3)
            fi = number(clip.get("fade_in", 0), "fade_in", 0, duration)
            fo = number(clip.get("fade_out", 0), "fade_out", 0, duration)
            if fi + fo > duration:
                raise VideoError("Clip fades cannot overlap")
            if "audio_track" in clip:
                index = number(clip["audio_track"], "audio_track", 0)
                if index % 1 or index >= len(info["audio_tracks"]):
                    raise VideoError("audio_track is a zero-based index into audio_tracks")
            if info["video"]["hdr"]:
                raise VideoError("HDR input requires an explicit color-managed SDR conversion before this SDR pipeline")
            if len(info["audio_tracks"]) > 1 and "audio_track" not in clip:
                warnings.append(f"Clip {i}: using first of {len(info['audio_tracks'])} audio tracks")
            if clip.get("fit") == "cover":
                warnings.append(f"Clip {i}: centered cover crops source edges; visually review")
            if "camera" in clip:
                camera = clip["camera"]
                keys(camera, "viewport start_viewport enter exit cue delay", "camera")
                w, h = info["video"]["display_width"], info["video"]["display_height"]
                base_w = max(w, h * out["width"] / out["height"])
                viewports = [box(camera.get("viewport"), "camera.viewport")]
                if "start_viewport" in camera:
                    viewports.append(box(camera["start_viewport"], "camera.start_viewport"))
                for viewport in viewports:
                    ratio = viewport["width"] * w / (viewport["height"] * h)
                    if abs(ratio / (out["width"] / out["height"]) - 1) > 0.005:
                        raise VideoError("Camera viewport must match output aspect ratio. Use pitch video focus to calculate it.")
                    if base_w / (viewport["width"] * w) > 10:
                        raise VideoError("Camera exceeds zoompan's 10x zoom limit")
                enter = number(camera.get("enter", 0), "camera.enter", 0, duration)
                leave = number(camera.get("exit", 0), "camera.exit", 0, duration)
                delay = number(camera.get("delay", 0), "camera.delay", 0, duration)
                if "delay" in camera and "cue" in camera:
                    raise VideoError("Use camera.delay for output-time scheduling OR camera.cue for speech, not both")
                if delay and (not enter or delay + enter > (frames - 1) / out["fps"] + 1e-7):
                    raise VideoError("Camera delay requires an entrance that settles within the rendered clip")
                if "cue" in camera:
                    cue = camera["cue"]
                    keys(cue, "speech action hold_until", "camera.cue")
                    last_time = min(end, start + (frames - 1) / out["fps"])
                    speech = number(cue.get("speech"), "cue.speech", start, last_time)
                    action = number(cue.get("action", speech), "cue.action", start, last_time)
                    hold = number(cue.get("hold_until"), "cue.hold_until", max(speech, action), end)
                    if speed != 1:
                        raise VideoError("Speech-cued camera clips must run at 1x; split silent acceleration first")
                    # A destination is settled by the EARLIER of the spoken
                    # intention and first action. Delay approach, never the cue.
                    settled = math.floor((min(speech, action) - start) * out["fps"] + 1e-7) / out["fps"]
                    if enter > settled + 1e-7:
                        raise VideoError("Camera approach has insufficient lead-in before speech/action cue")
                    if not enter:
                        settled = 0
                    if leave and (frames - 1) / out["fps"] - leave < hold - start:
                        raise VideoError("Camera departs before cue.hold_until")
                if delay + enter + leave > duration:
                    raise VideoError("Camera delay + enter + exit exceeds clip duration")
                if "start_viewport" in camera and (enter < 1 / out["fps"] or frames < 2):
                    raise VideoError("Camera start_viewport requires enter of at least one output frame and a clip of at least two frames")
                if min(v["width"] for v in viewports) * w < out["width"]:
                    warnings.append(f"Clip {i}: camera crop is upscaled; inspect fine text/detail")
            overlap = 0
            if "transition" in clip:
                transition = clip["transition"]
                keys(transition, "type duration", "transition")
                if not i:
                    raise VideoError("The first clip cannot have an incoming transition")
                if transition.get("type") not in ("fade", "fadeblack", "wipeleft", "wiperight", "slideleft", "slideright"):
                    raise VideoError("Unsupported transition type")
                overlap = round(number(transition.get("duration"), "transition.duration", 1 / out["fps"]) * out["fps"]) / out["fps"]
                if overlap >= duration or overlap + timeline[-1]["overlap"] >= timeline[-1]["duration"]:
                    raise VideoError("Transitions must fit inside both clips without overlapping another transition")
                transition["duration"] = overlap
            total -= overlap
            timeline.append({"clip": i, "source": info["path"], "source_in": start, "source_out": end, "speed": speed, "start": total, "end": total + duration, "duration": duration, "frames": frames, "overlap": overlap})
            if "cue" in clip.get("camera", {}):
                cue = clip["camera"]["cue"]
                timeline[-1]["camera_timing"] = {
                    "move_start": total + settled - enter, "settled": total + settled,
                    "speech": total + cue["speech"] - start,
                    "action": total + cue["action"] - start if "action" in cue else None,
                    "hold_until": total + cue["hold_until"] - start,
                    "departure": total + (frames - 1) / out["fps"] - leave if leave else total + duration,
                }
            elif "delay" in clip.get("camera", {}):
                timeline[-1]["camera_timing"] = {
                    "move_start": total + delay, "settled": total + delay + enter,
                    "speech": None, "action": None, "hold_until": None,
                    "departure": total + (frames - 1) / out["fps"] - leave if leave else total + duration,
                }
            total += duration
        if continuous_camera:
            previous = {"x": 0, "y": 0, "width": 1}
            for i, (clip, item) in enumerate(zip(clips, timeline)):
                if item["overlap"] or (i and clip.get("fade_in")) or (i < len(clips) - 1 and clip.get("fade_out")):
                    raise VideoError("Continuous camera edits must not hide joins with transitions or internal fades")
                first = self.camera_edge(clip, item, out, last=False)
                if any(abs(first[k] - previous[k]) > 1 / max(out["width"], out["height"]) for k in first):
                    raise_index = f"before clip {i}" if i else "at the opening"
                    raise VideoError(f"Camera discontinuity {raise_index}: match the previous endpoint with start_viewport, continue the crop, or finish a smooth return before the join. Do not reset by cutting.")
                previous = self.camera_edge(clip, item, out, last=True)
        self.validate_coverage(plan.get("coverage", []), timeline)
        for source in {item["source"] for item in timeline}:
            sidecar = self.path(str(Path(source).with_suffix(".coverage.json")), exists=False)
            if sidecar.is_file():
                bound = json.loads(sidecar.read_text(encoding="utf-8"))
                keys(bound, "version coverage", "source coverage")
                if bound.get("version") != 1:
                    raise VideoError("Unsupported source coverage version")
                self.validate_coverage(bound.get("coverage"), timeline)
        overlays = plan.get("overlays", [])
        if not isinstance(overlays, list) or len(overlays) > 50:
            raise VideoError("overlays must contain at most 50 entries")
        for overlay in overlays:
            keys(overlay, "source start end in box opacity", "overlay")
            source = self.path(overlay.get("source"))
            inputs.add(source)
            if self.video(str(source))["video"]["hdr"]:
                raise VideoError("HDR overlays require an explicit color-managed SDR conversion")
            self.time_range(overlay, total)
            box(overlay.get("box"), "overlay.box")
            number(overlay.get("in", 0), "overlay.in", 0)
            number(overlay.get("opacity", 1), "opacity", 0, 1)
        music = plan.get("music")
        if music is not None:
            keys(music, "source in start end volume fade_in fade_out", "music")
            source = self.path(music.get("source"))
            inputs.add(source)
            if not self.probe_file(str(source))["audio_tracks"]:
                raise VideoError("Music source has no audio")
            start, end = self.time_range(music, total)
            number(music.get("in", 0), "music.in", 0)
            number(music.get("volume", 0.15), "music.volume", 0, 8)
            fi = number(music.get("fade_in", 0), "music.fade_in", 0, end - start)
            fo = number(music.get("fade_out", 0), "music.fade_out", 0, end - start)
            if fi + fo > end - start:
                raise VideoError("Music fades cannot overlap")
        captions = plan.get("captions", [])
        if not isinstance(captions, list) or len(captions) > 10000:
            raise VideoError("captions must be a list of at most 10000 entries")
        for caption in captions:
            keys(caption, "start end text", "caption")
            if "start" not in caption or "end" not in caption:
                raise VideoError("Captions require start and end timestamps")
            self.time_range(caption, total)
            text = caption.get("text")
            if not isinstance(text, str) or not text.strip() or len(text) > 1000:
                raise VideoError("Caption text must contain 1–1000 characters")
            if any(c in text for c in ("{", "}", "\\")):
                raise VideoError("Caption text cannot contain ASS override characters { } or backslash")
        redactions = plan.get("redactions", [])
        if not isinstance(redactions, list) or len(redactions) > 100:
            raise VideoError("redactions must contain at most 100 entries")
        for redaction in redactions:
            keys(redaction, "start end box", "redaction")
            self.time_range(redaction, total)
            box(redaction.get("box"), "redaction.box")
        if output in inputs:
            raise VideoError("Output must not overwrite an input or plan")
        if output.exists() and not allow_existing_output:
            raise VideoError("Output already exists; choose a new output.path")
        return plan, {"duration": total, "timeline": timeline, "warnings": warnings, "output": str(output), "time_basis": "Clip in/out use source seconds; camera/fades use clip OUTPUT seconds; overlays/music/captions use final timeline seconds."}

    def validate_coverage(self, coverage, timeline):
        if not isinstance(coverage, list) or len(coverage) > 10000:
            raise VideoError("coverage must be a list of at most 10000 ranges")
        for required in coverage:
            keys(required, "source start end kind", "coverage")
            info = self.video(required.get("source"))
            a, b = self.time_range(required, info["duration"])
            if required.get("kind") not in COVERAGE_KINDS:
                raise VideoError(f"coverage.kind must be one of {', '.join(COVERAGE_KINDS)}")
            cursor = a
            for item in timeline:
                if item["source"] != info["path"]:
                    continue
                left, right = max(a, item["source_in"]), min(b, item["source_out"])
                if right <= left:
                    continue
                if abs(left - cursor) > 1e-6:
                    raise VideoError(f"Coverage {required['kind']} has a cut, duplicate or reordered interval at {cursor:.3f}s; retain it and speed up silent activity instead")
                if item["overlap"]:
                    raise VideoError("Protected activity cannot be hidden in a transition overlap")
                final_left = item["start"] + (left - item["source_in"]) / item["speed"]
                final_right = item["start"] + (right - item["source_in"]) / item["speed"]
                if any(other["overlap"] and other["start"] < final_right and other["start"] + other["overlap"] > final_left for other in timeline):
                    raise VideoError("Protected activity cannot be hidden in a transition overlap")
                if required["kind"] in ("speech", "scroll", "interaction", "reading") and item["speed"] != 1:
                    raise VideoError(f"Protected {required['kind']} must remain at 1x; split silent activity before accelerating")
                cursor = right
            if cursor < b - 1e-6:
                raise VideoError(f"Coverage {required['kind']} was removed at {cursor:.3f}s; retain it and speed up silent activity instead")

    def time_range(self, obj, total):
        start = number(obj.get("start", 0), "start", 0, total)
        end = number(obj.get("end", total), "end", start + 0.001, total + 0.000001)
        return start, end

    def validate(self, args):
        _, report = self.load_plan(args["plan"])
        return report

    def camera_edge(self, clip, item, out, last):
        """Actual first/last camera frame, in normalized padded-source space.

        Match zoompan's easing and frame quantization, including incomplete moves.
        This checks framing continuity, not whether UI content changed at a splice.
        """
        info = self.video(clip["source"])
        w, h = info["video"]["display_width"], info["video"]["display_height"]
        bw = math.ceil(max(w, h * out["width"] / out["height"]) / 2) * 2
        bh = math.ceil(bw * out["height"] / out["width"] / 2) * 2
        full = {"x": 0.0, "y": 0.0, "width": 1.0}
        camera = clip.get("camera")
        if not camera:
            if clip.get("fit", "contain") == "contain":
                return full
            cw = min(w, h * out["width"] / out["height"])
            ch = cw * out["height"] / out["width"]
            return {"x": (bw - cw) / (2 * bw), "y": (bh - ch) / (2 * bh), "width": cw / bw}
        def padded(view):
            return {"x": (view["x"] * w + (bw - w) / 2) / bw,
                    "y": (view["y"] * h + (bh - h) / 2) / bh, "width": view["width"] * w / bw}
        def ease(t):
            t = min(1, max(0, t))
            return t * t * (3 - 2 * t)
        fps, final = out["fps"], item["frames"] - 1
        on = final if last else 0
        enter, leave = camera.get("enter", 0), camera.get("exit", 0)
        delay = camera.get("delay", 0) * fps
        if "cue" in camera and enter:
            cue = camera["cue"]
            settled = math.floor((min(cue["speech"], cue.get("action", cue["speech"])) - clip["in"]) * fps + 1e-7)
            delay = max(0, settled - enter * fps)
        outgoing = min(1, max(0, (final - on) / max(1, leave * fps))) if leave else 1
        target = padded(camera["viewport"])
        if "start_viewport" in camera:
            start = padded(camera["start_viewport"])
            incoming = ease(max(0, on - delay) / max(1, min(enter * fps, max(1, final))))
            return {k: full[k] + (start[k] - full[k] + (target[k] - start[k]) * incoming) * ease(outgoing) for k in full}
        incoming = min(1, max(0, on - delay) / max(1, enter * fps)) if enter else 1
        progress = ease(min(incoming, outgoing))
        return {k: full[k] + (target[k] - full[k]) * progress for k in full}

    def camera_filter(self, camera, info, out, duration, source_in=0):
        w, h = info["video"]["display_width"], info["video"]["display_height"]
        ow, oh, fps = out["width"], out["height"], out["fps"]
        bw = math.ceil(max(w, h * ow / oh) / 2) * 2
        bh = math.ceil(bw * oh / ow / 2) * 2
        b = camera["viewport"]
        x = b["x"] * w + (bw - w) / 2
        y = b["y"] * h + (bh - h) / 2
        ratio = b["width"] * w / bw
        enter, leave = camera.get("enter", 0), camera.get("exit", 0)
        delay = camera.get("delay", 0) * fps
        if "cue" in camera and enter:
            cue = camera["cue"]
            settled = math.floor((min(cue["speech"], cue.get("action", cue["speech"])) - source_in) * fps + 1e-7)
            delay = max(0, settled - enter * fps)
        phase = f"max(0,on-{delay:.8f})"
        if "start_viewport" in camera:
            start = camera["start_viewport"]
            sx = start["x"] * w + (bw - w) / 2
            sy = start["y"] * h + (bh - h) / 2
            sr = start["width"] * w / bw
            last = max(1, round(duration * fps) - 1)
            p = f"min(1,({phase})/{max(1, min(enter * fps, last)):.8f})"
            incoming = f"(({p})*({p})*(3-2*({p})))"
            q = f"min(1,max(0,({last}-on)/{max(1, leave * fps):.8f}))" if leave else "1"
            held = f"(({q})*({q})*(3-2*({q})))"
            ratio_expr = f"1+(({sr}-1)+({ratio}-{sr})*{incoming})*{held}"
            x_expr = f"({sx}+({x}-{sx})*{incoming})*{held}"
            y_expr = f"({sy}+({y}-{sy})*{incoming})*{held}"
            return f"pad={bw}:{bh}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='1/({ratio_expr})':x='{x_expr}':y='{y_expr}':d=1:s={ow}x{oh}:fps={fps}"
        incoming = f"min(1,({phase})/{max(1, enter * fps):.8f})" if enter else "1"
        outgoing = f"min(1,max(0,({max(0, round(duration * fps) - 1)}-on)/{max(1, leave * fps):.8f}))" if leave else "1"
        p = f"min({incoming},{outgoing})"
        ease = f"(({p})*({p})*(3-2*({p})))"
        return f"pad={bw}:{bh}:(ow-iw)/2:(oh-ih)/2:black,zoompan=z='1/(1+({ratio}-1)*{ease})':x='{x}*{ease}':y='{y}*{ease}':d=1:s={ow}x{oh}:fps={fps}"

    def render_clip(self, clip, item, out, dest):
        info = self.video(clip["source"])
        duration, fps = item["duration"], out["fps"]
        w, h = out["width"], out["height"]
        vf = [f"trim=start={clip['in']}:end={clip['out']}", f"setpts=(PTS-{clip['in']}/TB)/{clip['speed']}", "scale=round(iw*sar):ih", "setsar=1", f"fps={fps}:start_time=0"]
        if "camera" in clip:
            vf.append(self.camera_filter(clip["camera"], info, out, duration, clip["in"]))
        elif clip.get("fit", "contain") == "contain":
            vf += [f"scale={w}:{h}:force_original_aspect_ratio=decrease:force_divisible_by=2", f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:black"]
        else:
            vf += [f"scale={w}:{h}:force_original_aspect_ratio=increase:force_divisible_by=2", f"crop={w}:{h}"]
        vf += ["setsar=1", f"eq=brightness={clip.get('brightness', 0)}:contrast={clip.get('contrast', 1)}:saturation={clip.get('saturation', 1)}", "format=yuv420p", f"tpad=stop_mode=clone:stop_duration={duration}", f"trim=duration={duration}", "setpts=PTS-STARTPTS"]
        if info["audio_tracks"] and not clip.get("mute", False):
            audio_index = info["audio_tracks"][int(clip.get("audio_track", 0))]["index"]
            af = [f"atrim=start={clip['in']}:end={clip['out']}", f"asetpts=PTS-{clip['in']}/TB", "aresample=48000:async=1:first_pts=0"]
            speed = clip["speed"]
            while speed > 2:
                af.append("atempo=2")
                speed /= 2
            while speed < 0.5:
                af.append("atempo=0.5")
                speed *= 2
            af += [f"atempo={speed}", "aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo"]
            if clip.get("denoise", False):
                af.append("afftdn=nf=-25")
            af += [f"volume={clip.get('volume', 1)}", "apad", f"atrim=duration={duration}"]
            audio = f"[0:{audio_index}]" + ",".join(af)
        else:
            audio = f"anullsrc=r=48000:cl=stereo,atrim=duration={duration}"
        for name, kind in (("fade_in", "in"), ("fade_out", "out")):
            fade = clip.get(name, 0)
            if fade:
                start = 0 if kind == "in" else duration - fade
                vf.append(f"fade=t={kind}:st={start}:d={fade}")
                audio += f",afade=t={kind}:st={start}:d={fade}"
        graph = f"[0:{info['video']['index']}]" + ",".join(vf) + "[v];" + audio + "[a]"
        self.ff(["-i", info["path"], "-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-t", duration, "-c:v", "ffv1", "-level", "3", "-threads", "2", "-c:a", "pcm_s16le", dest])

    def write_captions(self, captions, folder, out):
        def stamp(t):
            ticks = round(t * 100)
            return f"{ticks // 360000}:{ticks // 6000 % 60:02d}:{ticks // 100 % 60:02d}.{ticks % 100:02d}"
        text = f"[Script Info]\nScriptType: v4.00+\nPlayResX: {out['width']}\nPlayResY: {out['height']}\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,{max(12, round(out['height'] * 0.045))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,0,2,30,30,{round(out['height'] * 0.06)},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n"
        for c in captions:
            content = c["text"].replace("\r", "").replace("\n", "\\N")
            text += f"Dialogue: 0,{stamp(c['start'])},{stamp(c['end'])},Default,,0,0,0,,{content}\n"
        path = folder / "captions.ass"
        path.write_text(text, encoding="utf-8")
        return path

    def render(self, args):
        plan, report = self.load_plan(args["plan"])
        preview = boolean(args.get("preview", False), "preview")
        out = dict(plan["output"])
        if preview:
            scale = min(1, 960 / out["width"], 540 / out["height"])
            out["width"] = max(16, round(out["width"] * scale / 2) * 2)
            out["height"] = max(16, round(out["height"] * scale / 2) * 2)
            out["crf"], out["preset"] = 24, "ultrafast"
        work = self.workspace()
        target = work / f"preview-{uuid.uuid4().hex}.mp4" if preview else Path(report["output"])
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="render-", dir=work) as tmp:
            folder = Path(tmp)
            for clip, item in zip(plan["clips"], report["timeline"]):
                self.render_clip(clip, item, out, folder / f"clip-{item['clip']:04d}.mkv")
            listing = folder / "concat.txt"
            listing.write_text("".join(f"file 'clip-{item['clip']:04d}.mkv'\nduration {item['duration']:.12f}\n" for item in report["timeline"]), encoding="utf-8")
            cmd = ["-f", "concat", "-safe", "1", "-i", listing]
            graph, video, audio = [], "0:v", "0:a"
            next_input = 1
            if any(item["overlap"] for item in report["timeline"]):
                cmd = []
                for i in range(len(plan["clips"])):
                    cmd += ["-i", folder / f"clip-{i:04d}.mkv"]
                    graph += [f"[{i}:v]setpts=PTS-STARTPTS,fps={out['fps']}[clipv{i}]", f"[{i}:a]asetpts=PTS-STARTPTS[clipa{i}]"]
                video, audio = "clipv0", "clipa0"
                for i in range(1, len(plan["clips"])):
                    item = report["timeline"][i]
                    if item["overlap"]:
                        transition = plan["clips"][i]["transition"]
                        graph += [f"[{video}][clipv{i}]xfade=transition={transition['type']}:duration={item['overlap']}:offset={item['start']}[joinv{i}]", f"[{audio}][clipa{i}]acrossfade=d={item['overlap']}:c1=tri:c2=tri[joina{i}]"]
                    else:
                        graph.append(f"[{video}][{audio}][clipv{i}][clipa{i}]concat=n=2:v=1:a=1[cutv{i}][joina{i}]")
                        graph.append(f"[cutv{i}]fps={out['fps']}[joinv{i}]")
                    video, audio = f"joinv{i}", f"joina{i}"
                next_input = len(plan["clips"])
            for i, overlay in enumerate(plan.get("overlays", [])):
                info = self.video(overlay["source"])
                image = Path(info["path"]).suffix.lower() in (".png", ".jpg", ".jpeg", ".webp", ".bmp")
                if image:
                    cmd += ["-loop", "1", "-framerate", out["fps"]]
                cmd += ["-i", info["path"]]
                b = overlay["box"]
                start, end = self.time_range(overlay, report["duration"])
                ow, oh = max(2, round(b["width"] * out["width"] / 2) * 2), max(2, round(b["height"] * out["height"] / 2) * 2)
                graph.append(f"[{next_input}:{info['video']['index']}]trim=start={overlay.get('in', 0)}:duration={end-start},setpts=PTS-STARTPTS+{start}/TB,scale=round(iw*sar):ih,setsar=1,scale={ow}:{oh}:force_original_aspect_ratio=decrease,format=rgba,colorchannelmixer=aa={overlay.get('opacity', 1)}[layer{i}]")
                graph.append(f"[{video}][layer{i}]overlay=x={b['x']*out['width']}:y={b['y']*out['height']}:eof_action=pass:repeatlast=0:enable='gte(t,{start})*lt(t,{end})'[v{i}]")
                video = f"v{i}"
                next_input += 1
            for i, redaction in enumerate(plan.get("redactions", [])):
                b = redaction["box"]
                start, end = self.time_range(redaction, report["duration"])
                x, y = math.floor(b["x"] * out["width"]), math.floor(b["y"] * out["height"])
                right = math.ceil((b["x"] + b["width"]) * out["width"])
                bottom = math.ceil((b["y"] + b["height"]) * out["height"])
                graph.append(f"[{video}]drawbox=x={x}:y={y}:w={right-x}:h={bottom-y}:color=black:t=fill:enable='gte(t,{start})*lt(t,{end})'[redacted{i}]")
                video = f"redacted{i}"
            if plan.get("captions"):
                self.write_captions(plan["captions"], folder, out)
                graph.append(f"[{video}]subtitles=filename=captions.ass[captioned]")
                video = "captioned"
            if plan.get("music"):
                music = plan["music"]
                info = self.probe_file(music["source"])
                cmd += ["-i", info["path"]]
                start, end = self.time_range(music, report["duration"])
                length = end - start
                filters = [f"atrim=start={music.get('in', 0)}:duration={length}", "asetpts=PTS-STARTPTS", "aresample=48000", "aformat=channel_layouts=stereo", f"volume={music.get('volume', 0.15)}"]
                if music.get("fade_in", 0):
                    filters.append(f"afade=t=in:d={music['fade_in']}")
                if music.get("fade_out", 0):
                    filters.append(f"afade=t=out:st={length-music['fade_out']}:d={music['fade_out']}")
                filters += [f"adelay={round(start*1000)}:all=1", "apad", f"atrim=duration={report['duration']}"]
                graph += [f"[{next_input}:{info['audio_tracks'][0]['index']}]" + ",".join(filters) + "[music]", f"[{audio}][music]amix=inputs=2:duration=first:normalize=0[mixed]"]
                audio = "mixed"
            if out.get("normalize_audio", False):
                graph.append(f"[{audio}]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[normalized]")
                audio = "normalized"
            if graph:
                cmd += ["-filter_complex", ";".join(graph)]
            cmd += ["-map", f"[{video}]" if video != "0:v" else video, "-map", f"[{audio}]" if audio != "0:a" else audio, "-t", report["duration"], "-r", out["fps"], "-c:v", "libx264", "-preset", out["preset"], "-crf", out["crf"], "-pix_fmt", "yuv420p", "-threads", "2", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-map_metadata", "-1", folder / "final.mp4"]
            self.ff(cmd, cwd=folder, internal_concat=True)
            try:
                with target.open("xb") as dst, (folder / "final.mp4").open("rb") as src:
                    shutil.copyfileobj(src, dst)
            except FileExistsError as exc:
                raise VideoError(f"Output appeared during render; not overwritten: {target}") from exc
        snapshot = target.with_suffix(".plan.json")
        try:
            # Resolve the sidecar too; an existing workspace symlink must not escape.
            snapshot = self.path(str(snapshot), exists=False)
            with snapshot.open("x", encoding="utf-8") as handle:
                json.dump(self.portable({"plan": plan, "report": report, "render_settings": out, "preview": preview}), handle, indent=2)
        except FileExistsError:
            snapshot = None
        return {**report, "output": str(target), "plan_snapshot": str(snapshot) if snapshot else None, "preview": preview, "next": "Run pitch video verify and open output frames. Publish the checked final with pitch media publish."}

    def verify(self, args):
        info = self.video(args["source"])
        self.ff(["-xerror", "-i", info["path"], "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"])
        checks = {"full_decode": True, "duration": info["duration"], "has_audio": bool(info["audio_tracks"])}
        if "expected_duration" in args:
            expected = number(args["expected_duration"], "expected_duration", 0)
            tolerance = max(0.1, 2 / info["video"]["fps"])
            checks["duration_matches"] = abs(info["duration"] - expected) <= tolerance
        if info["audio_tracks"]:
            log = self.ff(["-i", info["path"], "-map", "0:a:0", "-af", "volumedetect", "-vn", "-f", "null", "-"], verbose=True).stderr
            match = re.search(r"max_volume: ([-\d.]+) dB", log)
            checks["sample_peak_db"] = float(match[1]) if match else None
        return {"source": info, "checks": checks, "passed": checks.get("duration_matches", True), "requires_review": ["Visual quality and target framing", "Speech/action synchronization and lip sync", "Caption correctness and readability", "Audio artifacts, intelligibility, and true peak", "Meaning, continuity, and pacing"]}

    def assemble_recording(self, args):
        """Composite recorded cursor + wall-clock narration in one source encode."""
        info = self.video(args["source"])
        duration = number(info["duration"], "recording duration", 0.001)
        target = self.path(f"recording/source-{uuid.uuid4().hex}.mp4", exists=False)
        inputs, filters, labels, beats = ["-i", info["path"]], [], [], []
        if info["audio_tracks"]:
            filters.append(f"[0:{info['audio_tracks'][0]['index']}]aresample=48000,aformat=channel_layouts=stereo[original]")
            labels.append("[original]")
        for i, clip in enumerate(args.get("clips", []), 1):
            audio = self.probe_file(clip["source"])
            if not audio["audio_tracks"]:
                raise VideoError(f"Recorded audio clip has no audio: {clip['source']}")
            start = number(clip["start"], "clip.start", 0)
            length = number(clip.get("duration", audio["duration"]), "clip.duration", 0.001)
            if start + length > duration + 0.75:
                raise VideoError("Recording ends before its narration/audio; recover the complete capture or retake. Do not rewrite capture timestamps, backdate narration or shorten endTime to bypass this check.")
            inputs += ["-i", audio["path"]]
            filters.append(f"[{i}:{audio['audio_tracks'][0]['index']}]atrim=duration={length},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,adelay={round(start*1000)}:all=1[a{i}]")
            labels.append(f"[a{i}]")
            if clip.get("text"):
                beats.append({"start": start, "dur": min(length, duration - start), "text": clip["text"], "type": "narration"})
        if labels:
            filters.append("".join(labels) + f"amix=inputs={len(labels)}:duration=longest:normalize=0,alimiter=limit=0.95:latency=1,apad,atrim=duration={duration}[audio]")
        else:
            filters.append(f"anullsrc=r=48000:cl=stereo,atrim=duration={duration}[audio]")
        # No zoom, automatic cuts, music, cards, background or publication here.
        with tempfile.TemporaryDirectory(prefix="source-", dir=self.workspace()) as tmp:
            rendered = Path(tmp) / "source.mp4"
            cursor = None
            video_map = f"0:{info['video']['index']}"
            if args.get("cursor"):
                from cursor import prepare_cursor
                cursor = prepare_cursor(self, args, info, Path(tmp), len(args.get("clips", [])) + 1)
                inputs += cursor["inputs"]
                filters += cursor["filters"]
                video_map = "[cursor_video]"
            self.ff([*inputs, "-filter_complex", ";".join(filters), "-map", video_map, "-map", "[audio]", "-t", duration, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-ar", "48000", "-movflags", "+faststart", rendered], cwd=tmp, internal_concat=bool(cursor))
            with target.open("xb") as dst, rendered.open("rb") as src:
                shutil.copyfileobj(src, dst)
        timeline = self.path(str(target.with_suffix(".timeline.json")), exists=False)
        with timeline.open("x", encoding="utf-8") as handle:
            json.dump({"durationSec": duration, "beats": beats}, handle, indent=2)
        return {"source": str(target), "duration": duration, "timeline": str(timeline), "narration_clips": len(beats),
                "cursor": cursor["report"] if cursor else None,
                "next": "Read video-editing/SKILL.md and choose the scenario: narrated screen, presentation, or mixed sequences. Follow its preprocessing/reading-hold policy and bounded plan authoring. Raw-only requests can use this synchronized source directly."}


def main():
    parser = argparse.ArgumentParser(description="Pitch video-editing host backend")
    parser.add_argument("action", choices=["capabilities", "probe", "frames", "focus", "analyze", "preprocess", "plan", "validate", "render", "verify", "assemble_recording"])
    parser.add_argument("--root", required=True)
    options = parser.parse_args()
    try:
        args = json.loads(sys.stdin.read() or "{}")
        if not isinstance(args, dict):
            raise VideoError("Arguments must be a JSON object")
        engine = Engine(options.root)
        # -I excludes the script directory. Import only this server-owned sibling,
        # never Python modules from the agent-writable working directory.
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from plan_authoring import author, compact_report
        if options.action == "plan":
            result = author(engine, args)
        else:
            result = getattr(engine, options.action)(args)
        if args.get("compact") is True and options.action in ("validate", "render", "preprocess", "analyze"):
            result = compact_report(engine, options.action, args, result)
        print(json.dumps(engine.portable(result), indent=2, allow_nan=False))
    except (VideoError, KeyError, ValueError, OSError) as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
