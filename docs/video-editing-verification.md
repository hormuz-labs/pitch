# Video editing verification — DeepSeek recording

**Superseded: the user rejected this edit for late and missing emphasis.** The
technical measurements below describe the first attempt only. They did not
establish complete spoken-target coverage, and the overall quality claim was
incorrect. See `video-editing-skill-evaluation.md` for the revised scenario-based
instructions and evaluation scope.

Verified locally on 2026-09-22 against the user-supplied
`/workspace/test.mp4`.

Source SHA-256:
`6d2cff244adaf288a8320a8546c6a98494c6a60523daed8fcef74551b6698e40`

## Findings and changes

1. **Dead time:** exact decoded equality missed apparently static footage because
   codec noise changed pixel values. Whole-frame scene scores would miss small
   typed characters. The prepass now checks maximum native-resolution Y/U/V
   differences at every frame, against both adjacent frames and a one-second
   baseline, then intersects those intervals with audio silence. Supplied protected
   ranges and 0.4-second cut handles preserve known actions, narration and reading.
2. **Preservation:** the prepared-source starter plan requires complete activity
   coverage, also bound to prepared media by a sidecar so a fresh plan cannot
   accidentally omit it. Validation rejects missing, duplicated, reordered or transition-hidden
   ranges, and speech acceleration. Silent typing/streaming may be accelerated
   continuously. This is enforced against declared coverage, not inferred semantics.
3. **Speech timing:** unrestricted Whisper tokens extended the “Web Search” sentence
   to 29.84s despite audio ending near 16.78s. It also hallucinated a repeated code
   passage inside a long quiet interval. Utterance-bounded transcription returned
   nine passages; the search sentence spans approximately 13.702–16.932s, including
   its boundary handle. Proper names remain ASR estimates.
4. **Camera timing:** source-time speech/action cues delay the approach until it
   will settle at the intended cue. Validation accounts for previous cuts/speed
   changes and rejects inadequate lead-in or premature departure. Already-visible
   results can use speech alone, without a fabricated action timestamp.
5. **Capture discipline:** the demo skill now requires intended action, verified
   UI state and visible result for each claim. The sample's Search state and model
   knowledge-cutoff response do not prove the narration's claim of live web search.
   Nor does generated code establish “production-ready” correctness. Editing does
   not repair those source claims; new captures must verify them before narration.

## Measured result

| Check | Result |
| --- | --- |
| Input | 124.000s container; 1920×1080, 30fps, H.264/AAC |
| Automatic cuts, original seconds | `[23.333333,24.566667)`, `[25.400000,26.600000)` |
| Prepass removed | 2.433333s; neither cut intersects audible speech or observed text entry/streaming |
| Prepared duration | 121.566667s |
| Verification edit | 88.366667s; full remaining coverage, silent sections at 2–3×, speech at 1× |
| Composer cue | Settled at output 21.100s; estimated phrase at 21.124s; logged action anchor 24.467s |
| Code explanation cue | Settled at output 58.867s; estimated phrase at 58.872s; result already visible |
| Full decode / expected duration | Passed |
| Output | 1920×1080, 30fps, H.264/AAC; decoded sample peak −2.0 dBFS |
| Audio timing spot checks | One 1s RMS-envelope window per spoken passage; correlations 0.9697–0.9997, offsets 3.9–14.9ms from mapped source time |

Opened rendered frames before/at the camera cues, through intermediate and
completed typing, after submission, during streaming, and at the end of the
code explanation. Text progression remains visible; the composer crop returns
to the full composition before navigation. Audio checks are waveform/timing
checks, not a listening or true-peak certification. Estimated ASR word times are
not a guarantee of sample-perfect semantic alignment.

Blinking cursors count as activity, so the automatic prepass deliberately leaves
some silent holds. Those are accelerated in the verification edit rather than
being relabeled as unchanged picture. Low-contrast/slow activity and mixed music
remain limitations of threshold-based detection; use `protect` for known action
envelopes and review uncertain intervals.

## Reproduction artifacts

Local verification workspace:
`/var/folders/t1/vzb7t83x7b58v5m80_mxg__40000gn/T/opencode/deepseek-verification/`

- `preprocess-report.json`: cuts, evidence intervals and original-to-prepared map.
- `aligned-transcript.json`: utterance-bounded source transcript.
- `sample-plan.json`, `sample-timeline.json`: complete preservation/speed/camera plan.
- `renders/deepseek-verified.mp4`, `renders/deepseek-verified.plan.json`: output and snapshot.
- `audio-audit.json`, `verify-report.json`: measured checks.
- `.video-work/frames-pbb17liz/`: opened rendered-review frames.

Portable production commands are `pitch video preprocess`, `pitch media
transcribe`, `pitch video focus`, `pitch video validate`, `pitch video render`,
and `pitch video verify`; see the shared skill for their contracts. The original
media and local verification artifacts are not repository fixtures.

Regression coverage in `tests/video-editing.test.ts` exercises two-pixel screen
changes, speech over static video, protected holds, slow fades, silent sources,
continuous accelerated typing, invalid omissions/reordering/speech acceleration,
and actual rendered camera pixels before/at a cue after preceding retiming.
`tests/whisper.test.ts` covers utterance windows and silence/EOF boundaries.
