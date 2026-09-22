# Scenario-based video editing and bounded authoring

## Why the first iteration failed

The user rejected the first DeepSeek edit for late and missing zooms. Its
verification checked two implemented effects rather than every required spoken
subject. Correct frame arithmetic and audio alignment did not establish the
right emphasis. `video-editing-verification.md` is marked superseded.

Two other weaknesses mattered: a universal pre-click return to full composition
could hide the named navigation control, and asking a model to rewrite a complete
timeline made unrelated omissions/changes too easy.

## Skill structure

Applied Anthropic's upstream
[skill-creator](https://github.com/anthropics/skills/tree/main/skills/skill-creator)
workflow: scenario research, progressive-disclosure draft, old/new planning runs,
evidence-based grading and its generated review viewer.

`video-editing/SKILL.md` selects references for:

- Narrated screen demos: complete attention map, identifying phrases, real actions,
  preserved typing/streaming and required-subject review.
- Silent screen recordings: visual action/state cues, without fabricated speech.
- Interviews/people: meaning, reaction and natural conversational rhythm.
- Presentations: spoken references, labels/axes and reading/comparison holds.
- Montage/action: selected story, physical continuity and requested rhythm.
- Targeted corrections: exact requested scope rather than a full makeover.

The shared camera reference supplies geometry/timing mechanics; it no longer
imposes screen-demo policy on every video. Demo capture similarly splits into
browser workflow, documents/storyboards and common capture mechanics. These are
model-selected documentation branches, not creation flows or stored project types.

## Large JSON is kept out of the authoring loop

`pitch video plan` supports create, inspect and patch. Inspection pages one section
at a time (default 5, maximum 10 entries). Patch requests require the exact-byte
SHA256 revision, allow at most 8 operations and cap the complete request at 12 KiB.
Whole-document and bulk-array replacement are rejected. The host validates the
complete candidate, retains coverage constraints, saves the prior revision, and
commits atomically under a per-plan lock. Invalid/stale patches leave bytes unchanged.

`validate`, `render`, `preprocess` and `analyze` return compact summaries by default;
full reports are workspace artifacts, with explicit `--details` for diagnosis.
The prepass map and working timeline are pageable. Instructions direct the agent
to edit an affected beat, rather than rewrite all clips, captions or attention notes.
Existing renderer capacity limits remain; this changes authoring reliability, not
the maximum supported timeline size.

Action-only camera scheduling uses `camera.delay` in clip-output seconds, separate
from source-time speech cues. It supports delayed navigation resets without extra
clips or falsely labeling a deadline as speech.

## Evaluation and its limits

Six independent planning runs compared the user-rejected working skill with the
scenario draft: DeepSeek narrated demo, founder interview and a music-only local
correction, each with old and revised instructions. Persistent prompts and
expectations are in `.pi/skills/video-editing/evals/evals.json`.

| Planning case | Old | Revised | Observed distinction |
| --- | --- | --- | --- |
| DeepSeek | 4/6 | 6/6 | Identifying-phrase cues; emphasis through navigation activation |
| Interview | 3/3 | 3/3 | Both retain meaningful pause/reaction and natural framing |
| Targeted audio | 3/3 | 3/3 | Both isolate the requested stem/range and preserve other edits |

These are planning assertions, not video-quality scores or production success
rates. There was one run per case/configuration. The revised DeepSeek executor
also received a cue-table formatting request; row counts/length were excluded
from grading, but this limits causal attribution. Interview/audio cases used
supplied observations rather than media assets. Token/time telemetry was not
available and was not invented. The later bounded-authoring addition is covered
by integration tests and a real small-patch smoke test, not those earlier grades.

Local review bundle:
`/var/folders/t1/vzb7t83x7b58v5m80_mxg__40000gn/T/opencode/video-editing-skill-eval/`

- `review.html`: upstream skill-creator viewer with outputs, grades and feedback UI.
- `iteration-1/analysis.md`: substantive differences, ties, confounds and gaps.
- `iteration-1/*/{old_skill,with_skill}/outputs/plan.md`: complete planning outputs.

## DeepSeek media iteration

Workspace:
`/var/folders/t1/vzb7t83x7b58v5m80_mxg__40000gn/T/opencode/deepseek-verification/`

The revised attention map contains 16 grouped cue checks, including full-context
decisions and an explicitly unavailable complexity-analysis target. Source and
rendered cue frames were inspected independently. That review caught blank
navigation views at output 28.45s and 53.80s; exact adjacent source frames were
then used to repair both resets. The signature crop's top margin was also repaired.

The current review output is `renders/deepseek-attention-v4.mp4`. Its working
plan remains `attention-v3-plan.json`; versioned render snapshots preserve prior
plans. Two bounded host patches updated the 37-clip plan to use honest output-time
reset delays and smooth the separate New Chat return. Source coverage and intended
duration remain unchanged. Reports, prior-revision backups and the cue/edge review
records remain in that workspace.

V4 full decode/duration checks passed at 88.333333s. Eight actual V4 frames were
opened across the repaired blank locations, New Chat return and signature crop;
the two blank crops are absent and the New Chat reset now has a continuous
starting composition. See `attention-v4-review.md` in the workspace for exact
sample times, patch revisions and remaining perceptual-review limits.

**Still unresolved:** complexity-analysis imagery is absent in inspected source
frames during that claim. A crop cannot reveal an uncaptured section. The source's
live-search and production-readiness claims are also not established by those
pixels. ASR word times remain estimates. Stills and decoding checks do not prove
pleasant motion, exact perceived emphasis or full audiovisual approval; this
iteration is supplied for user review rather than declared perfect.

## Checks

- Runtime/CLI/Whisper tests: 60 passed, one local `drawtext`-dependent test skipped.
- API TypeScript and changed TypeScript Biome checks passed during implementation.
- Upstream skill-creator frontmatter validation passed for both entry skills.
- All 30 local Markdown links resolved; entry skills are 87 and 99 lines.
- Integration tests cover bounded paging/report sizes, revision conflicts,
  malformed/oversized patches, atomic rollback, preservation constraints, output
  collisions, backups and actual delayed-camera pixels.
