"""Host-only Pedalboard worker. Receives JSON from the metered media host action."""

import json
import math
import sys

try:
    import numpy as np
    import pedalboard as pb
    from pedalboard.io import AudioFile
except ImportError:
    sys.exit(
        "Pedalboard is not installed in host Python. Install requirements-audio.txt "
        "and set STUDIO_PYTHON to that environment's Python; see docs/installation.md."
    )


# No external plugins, impulse-response paths, or arbitrary Python execution.
EFFECTS = {
    effect.__name__: effect
    for effect in (
        pb.Gain, pb.HighpassFilter, pb.LowpassFilter, pb.PeakFilter,
        pb.HighShelfFilter, pb.LowShelfFilter, pb.Compressor, pb.Limiter,
        pb.Distortion, pb.Clipping, pb.Bitcrush, pb.Chorus, pb.Phaser,
        pb.Delay, pb.Reverb, pb.PitchShift,
    )
}


def make_board(effects):
    if not isinstance(effects, list) or not 1 <= len(effects) <= 32:
        raise ValueError("effects must be an array of 1–32 {name, params} objects")
    plugins = []
    for effect in effects:
        if not isinstance(effect, dict) or set(effect) - {"name", "params"}:
            raise ValueError("each effect must contain only name and optional params")
        name = effect.get("name")
        if not isinstance(name, str) or name not in EFFECTS:
            raise ValueError(f"unknown effect {name!r}; use pitch media pedalboard --list")
        params = effect.get("params", {})
        if not isinstance(params, dict) or any(
            type(value) not in (int, float) or not math.isfinite(value)
            for value in params.values()
        ):
            raise ValueError(f"{name} params must be an object of finite numbers")
        try:
            plugins.append(EFFECTS[name](**params))
        except (TypeError, ValueError) as error:
            raise ValueError(f"invalid {name} parameters: {error}") from error
    return pb.Pedalboard(plugins)


def main(request):
    if request.get("list") is True:
        # Constructor signatures are the installed library's actual parameter
        # names and defaults, rather than a second catalog that can drift.
        for name, effect in EFFECTS.items():
            signature = effect.__init__.__doc__.strip().splitlines()[0]
            print(f"{name}: {signature}")
        return

    board = make_board(request.get("effects"))
    tail = request.get("tail", 0)
    if type(tail) not in (int, float) or not math.isfinite(tail) or not 0 <= tail <= 30:
        raise ValueError("tail must be a number between 0 and 30 seconds")

    with AudioFile(request["file"]) as source:
        rate, channels = source.samplerate, source.num_channels
        if channels not in (1, 2) or source.frames == 0:
            raise ValueError("source must be non-empty mono or stereo audio")
        target_frames = source.frames + round(tail * rate)
        written, peak = 0, 0.0
        block_size = int(rate)
        with AudioFile(request["out"], "w", rate, channels, bit_depth=32) as output:
            while written < target_frames:
                if source.tell() < source.frames:
                    audio = source.read(min(block_size, source.frames - source.tell()))
                else:
                    # Also drains latency buffered by PitchShift, preserving the
                    # complete source duration even when --tail is zero.
                    audio = np.zeros((channels, block_size), dtype=np.float32)
                processed = board(audio, rate, reset=False)
                processed = processed[:, :target_frames - written]
                if not np.isfinite(processed).all():
                    raise ValueError("effect chain produced non-finite audio; reduce its parameters")
                if processed.shape[1]:
                    peak = max(peak, float(np.max(np.abs(processed))))
                    output.write(processed)
                    written += processed.shape[1]
        print(f"{written / rate:.3f}s, {rate:g} Hz, {channels}ch; peak {peak:.4f}.")
        if peak > 1:
            print("Peak exceeds 0 dBFS; lower Gain before mixing or encoding.")


if __name__ == "__main__":
    try:
        main(json.loads(sys.argv[1]))
    except Exception as error:
        sys.exit(str(error))
