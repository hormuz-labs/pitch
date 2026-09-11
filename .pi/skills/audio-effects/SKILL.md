---
name: audio-effects
description: Shape existing sound effects or audio stems with Pedalboard — reverb, delay, pitch shift, distortion, filters, compression and lo-fi processing.
---

# Audio effects with Pedalboard

Use `pitch media pedalboard` to change the character of an existing sound.
Start with an uploaded clip, a curated SFX copied into `audio/`, or the file
returned by `pitch motion sound`. Pedalboard processes audio; it needs a source.

1. `pitch media probe --file uploads/click.wav` to check duration and channels.
2. `pitch media pedalboard --list` for built-in effect names, parameters and defaults.
3. Pass an ordered JSON chain and a **new** output path in `audio/` or `renders/`.
4. Probe the result and use it in the project's cue sheet or mix.

```bash
# Give a click a short echo, with room for it to decay.
pitch media pedalboard --file uploads/click.wav --out audio/sfx/echo-click.wav --effects '[{"name":"Delay","params":{"delay_seconds":0.12,"feedback":0.25,"mix":0.2}},{"name":"Gain","params":{"gain_db":-3}}]' --tail 0.6

# Lower an impact and add space. Order matters: pitch, reverb, then gain.
pitch media pedalboard --file audio/generated-sfx/impact.mp3 --out audio/sfx/deep-impact.wav --effects '[{"name":"PitchShift","params":{"semitones":-5}},{"name":"Reverb","params":{"room_size":0.6,"wet_level":0.2,"dry_level":0.8}},{"name":"Gain","params":{"gain_db":-6}}]' --tail 1.5

# Lo-fi interface texture.
pitch media pedalboard --file uploads/notification.wav --out audio/sfx/lofi-notification.wav --effects '[{"name":"Bitcrush","params":{"bit_depth":8}},{"name":"LowpassFilter","params":{"cutoff_frequency_hz":3500}}]'
```

Input is mono/stereo audio (WAV, MP3, FLAC, OGG or AIFF). Output is a 32-bit
WAV with the source sample rate and channel count. `--tail` appends 0–30 seconds
of processed silence; default 0 keeps the source duration. Set it explicitly
for echoes and reverb. If the reported peak exceeds 1, lower the final Gain
before mixing or encoding. Existing output files are refused; use a new name.

For launch-film SFX, put the result in a cue's `file`, keeping its `event` class:

```json
{"label":"reveal lands","t":3.2,"event":"impact","file":"audio/sfx/deep-impact.wav"}
```

Then run `pitch motion sfx --mode build` and `pitch motion mix` as usual. The
cue builder measures the processed file's onset. Do not shorten `dur` so much
that it cuts off an intended tail. For video audio, extract the desired stream
with `pitch media ffmpeg`, process it, then mix/mux it back into a new video.

The command runs on the host and is compute-metered. If host Python or
Pedalboard is unavailable, report the command's error; the sandbox cannot
install these dependencies.
