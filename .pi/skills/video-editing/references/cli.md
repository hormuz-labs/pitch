# Pi video-editing commands

Run through pi's `bash` tool, from the project workspace:

```sh
pitch video --help
pitch video frames --help
pitch video probe --source uploads/recording.mp4
```

Each operation is a metered host action. Use ordinary flags; arrays and objects
are JSON in one quoted argument. There is no `davinci`, `--root`, `--args`, pip
installation or local FFmpeg execution. The workspace is supplied by the host.

Results are JSON. Command failures exit nonzero. `verify` reports `passed` and
`checks`; inspect these even when the command exits successfully.

Read [bounded authoring](authoring.md) before changing a plan. The agent submits
small, revision-checked patches; the host owns the complete JSON artifact.
`validate`, `render`, `preprocess` and `analyze` default to compact summaries with
a full report file. `--details` is an explicit diagnostic option, not the default
way to read a long timeline.

## Commands and flags

All rows below begin with `pitch video`:

| Command | Required flags | Optional flags (defaults) |
| --- | --- | --- |
| `capabilities` | None | None |
| `probe` | `--source` | None |
| `frames` | `--source` | `--times '[0]'` (1–12 timestamps); `--max-width 1280` (160–3840); `--grid`; `--contact-sheet`; `--tile-width 480` (160–960) |
| `focus` | `--source`, `--time`, `--target '{"x":…, "y":…, "width":…, "height":…}'` | `--width 1920`; `--height 1080` (16–7680); `--margin 0.15` (0–2) |
| `analyze` | `--source` | `--start 0`; `--end <duration>`; `--silence-db -35` (−90 to −5); `--silence-duration 0.6` (0.1–30); `--details` |
| `preprocess` | `--source` | `--audio-track 0` (explicit for multi-track media); `--protect '[{"start":2,"end":8}]'` (original-source ranges kept intact); `--details` |
| `plan --operation create` | `--plan`, `--source`, `--output` | None |
| `plan --operation inspect` | `--plan` | `--section clips`; `--offset 0`; `--limit 5` (max 10) |
| `plan --operation patch` | `--plan`, `--revision`, `--ops '[…]'` | 1–8 add/replace/remove/test ops; total request ≤12 KiB |
| `validate` | `--plan` | `--details` |
| `render` | `--plan` | `--preview` (default false); `--details` |
| `verify` | `--source` | `--expected-duration <seconds>` |

Paths resolve from the workspace, not the plan directory. Use relative paths
for all assets and plans. Returned paths are also relative and work with pi's
`read` tool. Source times must be before the source duration. `target` is
normalized to the full displayed source; see [zoom.md](zoom.md).

Transcription uses the shared host tool:

```sh
pitch media transcribe --file uploads/recording.mp4 --out edits/transcript.json
```

Optional `--lang en` selects a language; omit for detection. The result file
contains `{source, model, segments, words}`, all in source seconds. Read it.
Long quiet gaps separate ASR utterances; short boundary handles preserve phonemes.
Words retain original source offsets. These are estimated timings, not forced
alignment. Check the intended phrase, especially around pauses and proper names.
The host owns whisper.cpp and its model; if unavailable, report the failure
and use supplied transcripts or visual evidence as appropriate.

## Visual review

`preprocess` returns prepared `source`, starter `plan`, `prepass_plan`, `report`,
`removed_seconds` and counts. Page `prepass_plan` with `plan --operation inspect
--section timeline` for the original-to-prepared map. Full `removed`/`map` arrays
remain in the report artifact. Each map item has `source_in`, `source_out`,
`start`, `end`, `speed`.
For a retained time: `prepared = start + (original - source_in) / speed`.
It examines every decoded frame: maximum Y/U/V pixel differences must be ≤8/255
between adjacent frames and ≤16/255 over one second. The interval must also be
below −50 dB on the selected audio track for at least two seconds. Cut edges
retain 0.4s handles and round inward to frames. This intentionally keeps music,
noise, blinking cursors and uncertain intervals. Supply `protect` for known
activity envelopes, narration and reading holds; slow or low-contrast activity
can evade a pixel threshold. Original files remain intact.

Prepared files live under `.video-work/preprocess-*/`. Start from the returned
edit plan (copy it to `edits/` if useful), retaining `coverage`; write final output
under `renders/`. Coverage validation rejects missing/reordered activity and
speech acceleration. A prepass is not an edited deliverable or a factual review.

```sh
pitch video frames --source uploads/recording.mp4 --times '[0,2,4,6,8,10,12,14]' --contact-sheet
```

Open each `images[].path` with `read`. Contact sheets have timestamped 4×2 tiles,
up to eight per page. Originals are in `frames[].path`. `images[].tiles` gives
each timestamp, original path and pixel `content_box` excluding the label strip.
`tile_width` controls tiles; `max_width` controls original frames. Sheets require
host FFmpeg's `drawtext` filter and a font.

The command writes PNGs; it does not display or attach them. Measure inside a
tile's content, not across the sheet. After `focus`, open both context and crop.
Never choose coordinates from filenames/metadata alone.

## Draft, final and publication

```sh
pitch video validate --plan edits/tutorial.json
pitch video render --plan edits/tutorial.json --preview
pitch video verify --source .video-work/<returned-preview>.mp4 --expected-duration 12
pitch video render --plan edits/tutorial.json
pitch video verify --source renders/tutorial-v1.mp4 --expected-duration 12
pitch media publish --file renders/tutorial-v1.mp4 --label "Edited tutorial"
```

Use the actual duration from `validate` and actual returned paths, not these
placeholders. Extract/open rendered frames before publication. Rendering may
take several minutes; allow an appropriate `bash` timeout. Host cancellation
stops the renderer and its FFmpeg subprocesses.
