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

## Commands and flags

All rows below begin with `pitch video`:

| Command | Required flags | Optional flags (defaults) |
| --- | --- | --- |
| `capabilities` | None | None |
| `probe` | `--source` | None |
| `frames` | `--source` | `--times '[0]'` (1–12 timestamps); `--max-width 1280` (160–3840); `--grid`; `--contact-sheet`; `--tile-width 480` (160–960) |
| `focus` | `--source`, `--time`, `--target '{"x":…, "y":…, "width":…, "height":…}'` | `--width 1920`; `--height 1080` (16–7680); `--margin 0.15` (0–2) |
| `analyze` | `--source` | `--start 0`; `--end <duration>`; `--silence-db -35` (−90 to −5); `--silence-duration 0.6` (0.1–30) |
| `validate` | `--plan` | None |
| `render` | `--plan` | `--preview` (default false) |
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
The host owns whisper.cpp and its model; if unavailable, report the failure
and use supplied transcripts or visual evidence as appropriate.

## Visual review

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
