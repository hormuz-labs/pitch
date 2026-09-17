# Akkari run review

Session: `2026-09-17T21-17-11-928Z_01a0b13b-0b77-78f1-a0c8-e8fd62bf545a.jsonl`
under `~/.pi/agent/sessions/`, project `launch-akkari`.
Model: `google/gemini-3.8-flash`, medium thinking.
September 17, 21:17:11–21:42:18 UTC (September 18 locally).

## What happened

The user asked for an Akkari launch film, selected Cinematic Launch,
**Full Loop: Capture → Prioritize → Execute**, and **~30 seconds**. The context
correctly said the runtime was approximate. The agent nevertheless planned
six shots totaling **30.4s**, adding action cards and an integration grid beyond
the chosen loop. It never revised the timing after readability feedback.

The result relies on animated paragraphs and simulated UI rather than visual
demonstration. The 4.2s signals shot has a heading, subtitle, three message cards,
status labels and a ticker. The 4s integrations shot has a heading, subtitle,
three integration descriptions, category labels and command badges. All three
cards finish entering at ~1.25s and begin leaving at 3.55s: about **2.3s** to
process the complete state. The loop's descriptions accompany steps starting
only 1.55s apart. Fading earlier steps to 60% opacity does not remove their copy.

The first visual-system plan explicitly chose 15–18px detail text at 1920×1080.
That is 7.5–9px at a 960px-wide preview. Most subsequent fixes enlarged CSS
instead of deleting explanatory copy or showing recognizable icons/actions.

## Costs and tokens

Final database ledger after stopping the run:

- `usageUsd`: **3.157415375**; **1,262 credits charged**. This is the app's
  metered ledger, not a $3.16 card charge or a cloud-provider invoice.
- Recorded main-agent model spend: **$0.9230883**.
- Model multiplier: 1; platform margin: 1.25; compute rate: $0.002/s.
  The ledger implies **801.422 metered compute seconds**, $1.602844 before
  margin. Model plus compute: $2.5259323; margin: $0.631483075.
- The two Gemini media-review calls did not persist provider token usage or
  itemized provider cost. Their host time was metered, but an exact total of
  vendor invoices cannot be recovered from this session.

There are 191 JSONL entries, 94 assistant entries (93 with nonzero usage),
92 tool calls, and no compaction. The last assistant entry is an aborted/error
response. Main-agent usage is cumulative across requests, not unique content:

| Category | Tokens | Recorded cost |
|---|---:|---:|
| Uncached input | 525,213 | $0.393910 |
| Cached input | 4,940,014 | $0.370501 |
| Output, including reasoning | 42,314 | $0.158678 |
| **Total** | **5,507,541** | **$0.923088** |

Reasoning is 11,568 tokens within output. Do not add it again.

| Phase (transcript lines) | Assistant entries | Cumulative tokens | Model cost |
|---|---:|---:|---:|
| Brief and recon (5–20) | 8 | 128,158 | $0.069004 |
| Planning, music, effects (21–68) | 24 | 744,240 | $0.146370 |
| Initial construction (69–118) | 25 | 1,456,675 | $0.243583 |
| Picture checks and rework (119–148) | 15 | 1,149,201 | $0.162356 |
| Sound (149–168) | 10 | 880,879 | $0.101270 |
| Rendering, review, rework, interruption (169–191) | 12 | 1,148,388 | $0.200505 |

Before intervention, the transcript through line 185 recorded **$0.899278425**
and 5,285,522 tokens. Stopping the unrequested export led to a help lookup and
one retry before the session was stopped, adding $0.023809875 in main-agent
usage. These are included in the final totals above.

## Avoidable work

1. **Automatic rendering.** The previous instruction change required a review
   MP4. That was a mistake for a live-preview product. Line 169 renders 912 frames;
   the call lasts **379.972s** (6m20s). 720p only downscales during encoding:
   capture still happens at 1920×1080. It returned **14,457 characters** of logs.
   The next model request processed 99,480 input tokens with no cache read,
   costing **$0.07545**, the largest single model request in the run.
2. **Unrequested final export and retry.** Line 185 starts a 1080p/60fps export
   without a user export request. It ran 244.065s before interruption; the retry
   ran another 131.159s before cancellation. Across all three attempts, tool
   elapsed time is ~12m35s. Elapsed tool time includes orchestration and is not
   an exact per-action billing breakdown.
3. **Repeated visual rework.** Three contact-sheet passes captured **48 frames**
   (18 + 18 + 12); the agent read **five sheet images**, not 48 individual images.
   Those reads consume image/context tokens, but exact image-only charges are
   not isolated in the transcript. The picture phase's $0.162356 also includes
   code edits. A compact check is useful; repeated enlargement of dense designs
   is the avoidable part.
4. **Large repeated writes.** The agent rewrote `shots.js` six times as it grew,
   then rewrote all six stylesheets and a ~5.7KB factory during polish. A failed
   nonunique edit triggered a full factory rewrite. Small targeted edits would
   emit less output and accumulate less context.
5. **Exploration overhead.** Seven effect searches, four study-card reads and
   two source reads preceded construction. A 12,982-character schema query
   included four built-in types even though all final shots were custom.
   Three audio candidates were imported, but only the first was assessed/used.
6. **Fixable tool failures.** The initial screenshot call omitted `--url`.
   The SFX sheet exceeded density/duration guidance and needed a rebuild.
   `motion mix --duration 30.4 --music_only` failed with an empty ffmpeg filter
   because it did not discover the existing music and SFX files; explicit
   input flags succeeded. The mixer now discovers conventional workspace inputs
   and reports missing audio before attempting an empty mix.

## Why the paid reviewer did not solve it

The film reviewer did flag dense action cards and small integration descriptions.
But it also called the film highly effective/minimalist, endorsed the loop timing,
and suggested enlarging a decorative badge. It claimed readability was verified
at 1080p while reviewing a 720p file. The agent mostly enlarged text, kept the
integration descriptions, and left the timeline at 30.4s. This review was neither
a reliable quality gate nor a substitute for a clear, visual-first brief.

## Corrections

- Removed launch rendering from the agent CLI and its capture host action;
  the user-triggered exporter remains the rendering path.
- Replaced the 366-line launch skill with a 49-line entry point. It loads one
  treatment and only the needed authoring, finishing or audio modules. Narration,
  music, SFX and mixing are separate; unrelated references stay out of context.
  The organization follows the official skill-creator's progressive-disclosure
  guidance. Three saved evaluation prompts cover music-only cinema, narrated
  kinetic type, and a level-only edit; these are future checks, not claims of
  new paid video-generation results.
- Removed mandatory paid film/music reviews and mandatory reference reading.
  Existing-media analysis remains available for a specific uncertainty.
- Default contact sheets now use one settled frame per shot instead of three.
- No new copy-counting gate or automated taste score was added.

These changes reduce prescribed work. They do not prove a future film will be
good; evaluate the next run's actual content, runtime, calls and measured cost.
