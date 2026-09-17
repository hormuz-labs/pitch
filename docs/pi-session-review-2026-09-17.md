# Pi session review — Agentcard launch

## Scope and method

Latest modified Pitch project transcript in the local pi session stores:
`2026-09-17T11-19-26-985Z_01a0af17-ca09-725c-a68f-894470856ad9.jsonl`
(under `~/.pi/agent/sessions/`, workspace `launch-agentcard`).

- September 17, 2026, 11:19:27–11:41:38 UTC, including the wait for the user.
- Model: `google/gemini-3.8-flash`, thinking level `medium`.
- Request: cinematic launch film, end-to-end checkout, music without narration.
- Result: six shots, 23.4 seconds, passing picture audit and audio mix.
- 213 JSONL entries; 105 assistant/model requests; 103 tool calls; nine error results.
- No compaction or branch entries in this transcript.

Usage below sums each assistant message's recorded `usage`. These are cumulative
API tokens across requests, not unique transcript tokens. `reasoning` is included
in `output`; do not add it again. Dollar amounts are pi's recorded model costs,
not an invoice, host-compute cost, or the final credit charge. Individual document
sizes are characters; the transcript does not attribute exact billed tokens to
each document or image.

## Repeated mistakes

### 1. Web-sized compositions, then repeated enlargement

Five shots received the same class of scale correction after their first review:

| Shot | Example of correction | Transcript line |
|---|---|---:|
| dilemma | headline 56→64px; terminal 17→20px | 97 |
| card-reveal | card 680×410→860×520; number 34→44px | 109 |
| approval | phone 380×740→440×800; enlarge text and button | 123 |
| api-settle | headline 56→64px; JSON 18→21px | 135 |
| outro | wordmark 110→130px; CTA 22→26px | 155 |

The edits establish a repeated scaling pattern, not proof that every original
frame was unreadable. The agent did not carry the first correction forward into
later shots. New skill guidance makes stage-to-preview scale explicit and asks
for subject size and essential reading size before writing CSS.

### 2. Repeated GSAP duration overrun

`hook` ran 4.5s in a 3.2s shot (line 80); `outro` ran 4.8s in a 4s shot (line 148).
Both fixes removed/reduced a repeated tween. In the outro, `.6D + .3D × 2 = 1.2D`.
Using fractions of `D` was insufficient because `repeat: 1` plays twice.

The custom-type schema, launch skill and overrun diagnostic now explain the
repeat/stagger budget explicitly. Existing validation still reports overruns.

### 3. Boolean syntax exposed a CLI bug twice

- Line 35: `--fullPage true` left `true` as positional text. It was appended to
  `recon/screenshots/full.png`, producing an unsupported screenshot extension.
- Line 177: `--dry_run true` left an extra positional argument and was rejected.

The help advertised a boolean value, so this was an interface defect as well as
an unsuccessful agent action. The parser now accepts bare, space-separated and
equals-form booleans, with regression coverage for the actual calls.

### 4. Audio recovery was unnecessarily serial

The agent skipped the audio reference, wrote a bare array instead of a cue-sheet
object (lines 175–180), then needed three actual mix attempts. The first mix
reported only the loudest offending moment, near 6.3s; after a local fix the next
attempt exposed another near 19.8s (lines 188 and 192).

The tool help now shows the cue-sheet shape. Mix failures now report all failing
time ranges together and an absolute global trim, allowing either one batch of
cue fixes or a level-only re-mix. Success explains that the preview and Export
already pick up `audio/mix.wav`.

The base prompt previously said to stop on *every* tool failure, while the audio
workflow required fixing failed gates and retrying. Guidance now distinguishes
correctable input/validation failures from unavailable host infrastructure.

## Where tokens went

| Usage category | Tokens | Recorded cost |
|---|---:|---:|
| Uncached input | 501,424 | $0.376068 |
| Cached input | 6,456,578 | $0.484243 |
| Output, including reasoning | 46,137 | $0.173014 |
| **Total** | **7,004,139** | **$1.033325** |

Reasoning was 14,886 tokens within output (about $0.0558 at the recorded rate).
Cached context was 92.2% of total tokens; all input together was 83.3% of cost.
The request context grew from 6,120 input tokens to 113,658, with no compaction.
Caching was working. The main lever is fewer unnecessary round trips and smaller
accumulating results, rather than disabling caching or first lowering reasoning.

| Phase (JSONL lines) | Model requests | Total tokens | Model cost |
|---|---:|---:|---:|
| Brief (5–13) | 5 | 63,025 | $0.0543 |
| Setup / recon (15–59) | 23 | 638,501 | $0.1263 |
| Build / picture validation (61–163) | 52 | 3,604,364 | $0.5514 |
| Sound (165–195) | 16 | 1,683,594 | $0.1966 |
| Post-mix searches and final reply (197–213) | 9 | 1,014,655 | $0.1046 |

Picture construction is the largest phase, and much of its code generation is
necessary. The avoidable multipliers were:

- **Per-shot polish loops:** seven scoped reviews before the full-film review,
  with separate image reads. New guidance retains incremental compile checks,
  using early visual review for an actual uncertainty and batching corrections
  after reviewing the sequence.
- **Overbroad/repeated documentation:** an initial schema response was 19,887
  characters, including actors/materials/types the final custom-shot film did
  not use. Later type lookups repeated the full common-field table. The schema
  now serves that table explicitly on demand, once.
- **Large SFX candidate list:** nine event classes at `--limit 30` produced 9,949
  characters. Guidance now starts with three candidates per needed event.
- **Searching after success:** after the mix passed, eight tool calls searched
  narration schema/HTML/audio files, ran another visual check and tried git.
  Those eight requests alone processed 900,595 tokens and cost $0.0913, before
  the final reply. The prompt and mix result now give an explicit stopping point.

Measured output-size changes from replaying read-only queries:

| Query | Before (characters) | After | Reduction |
|---|---:|---:|---:|
| `schema --types logo-cta` | 3,484 | 295 | 91.5% |
| `schema --types device-notif` | 3,726 | 537 | 85.6% |
| `schema --types logo-sting` | 3,463 | 274 | 92.1% |
| Same nine SFX events, limit 30→3 | 9,949 | 2,947 | 70.4% |

These are response-size reductions, not measured end-to-end token savings.
Prompt changes reduce the likelihood of repetition; they cannot guarantee the
model never repeats a mistake. Evaluate the next comparable session against
request count, repeated fixes, peak context and recorded cost.

## Follow-up and verification

If context still dominates after these changes, evaluate compaction at natural
phase boundaries (e.g. picture accepted → audio), preserving file paths, shot
timing, the brief and validation status. Measure the summary cost and cache
invalidation before adopting it; a blanket context reset can lose useful state.

Verification: 83 tests passed across the CLI, audio mix, motion validation,
sandbox, export reuse/audio failure and generated-SFX suites. Changed TypeScript
files pass Biome; the API no-emit type check passes. No new paid model run was
used to claim an end-to-end improvement. Restart the API/worker hosting pi
sessions to load the updated extension, prompt and command modules.
