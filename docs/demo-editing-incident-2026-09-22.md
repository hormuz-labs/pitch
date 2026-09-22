# DeepSeek editing investigation — 2026-09-22

Project: `cmud4d8710000db01ss2mnmvi` (`https://trypitch.co/p/cmud4d8710000db01ss2mnmvi`).
Evidence: GKE `silverfish`, namespace `pitch`; worker-0 logs and the project's
session, RenderJob rows, current/previous render-container logs and pod events.
All times below are UTC. Investigation used read-only queries and tar listing;
the production deployment and active edit were not modified.

## Findings

### Narration failures: 9

Worker/session logs show nine `TTS response missing inlineData` errors between
20:24:46 and 20:27:20. The agent retried, changed/shortened narration and inserted
the diagnostic word “Welcome” into the take. The adapter requested speechConfig
but omitted explicit `responseModalities: ['AUDIO']` and inspected only the first
response part. Raw failed responses/finish reasons were not retained, so their
individual provider-side causes cannot be established retrospectively.

Local fix: request AUDIO, search returned parts for audio, report finish/block
reason and part types when audio is absent. Preserve narration and bound agent
retries; no diagnostic greetings in the recording. Provider availability and
content-related responses still cannot be guaranteed away.

### Renderer restarted during synchronous transcription

`media_transcribe` job `cmud4p4o500032m010znc2op8` ran at 20:30:33–20:33:04
(151.224s action/shipping time). Kubernetes recorded liveness/readiness timeouts
and killed the render container. It received SIGTERM at 20:33:04 and completed
the transcription before graceful exit, code 0; this was not an OOM termination.
The replacement started at 20:33:07.

`transcribeWav` used `execFileSync` for FFmpeg and Whisper in the same Bun process
that serves health requests and renews render leases. Those waits prevent the
event loop from responding. Local fix: await asynchronous subprocesses with
cancellation instead. Do not conceal this bug by merely extending probe timeouts.

### Three EPIPE failures during checkpoint materialisation

Frame jobs failed before any `workspace restored` message:

| Job | Time | Requested frames |
| --- | --- | --- |
| `cmud4wexp00052m010k7brmu6` | 20:36:11 | 8 |
| `cmud506ck00072m017ktkny9j` | 20:39:07 | 4 |
| `cmud509gs00082m011zs3lqz7` | 20:39:11 | 2 |

Read-only reproduction against this project's version-9 `workspace.tar` produced
the same pipe error while GNU tar exited **0 with empty stderr**. Tar can finish
at archive end markers while the object-store stream still delivers padding.
The existing pipeline treated that successful early exit as a failed restore.
The five follow-up listings with ignore-zero/end-marker handling all passed.

Local fix: `tar --ignore-zeros -xf -` drains to transport EOF (GNU and BSD tar);
retain real extraction/stream failures and their diagnostics. Renderer failures
now identify restoring/running/shipping, so the agent can distinguish a checkpoint
problem from frame extraction. Reducing requested frame count did not address
this failure: those attempts had never started FFmpeg.

### Slow frame inspection

Eight frames took 169.769s, four later frames 164.777s, and one frame at source
210s took 46.037s. `Engine.frame` put `-ss` after `-i`, decoding from the beginning
on every call. A read-only input-side seek/decode at 210s on the same source took
0.359s in the render pod. That benchmark excluded PNG writing/shipping, so it is
not an identical end-to-end speed comparison.

Local fix: input-side accurate seeking. Regression checks compare actual PNGs
against the old decode-from-start method at non-keyframe timestamps.

### Other overhead

- Two CLI mistakes (`transcribe --source`, `frames --timestamps`) were rejected
  immediately and corrected. They did not start expensive render jobs.
- The first render was queued at 20:28:13 and claimed at 20:29:48: about 96s of
  scale-from-zero delay. Scheduling warnings cleared when the spot node appeared.
  This is expected cold-start overhead, not evidence of a broken node selector.
- The agent performed several expensive inspection rounds before preprocessing.
  The screen prepass was only queued at 20:40:05.
- At the final check around 20:48, preprocessing was still running, not failed:
  its second native-resolution pixel-difference pass was using approximately one
  CPU core. The two full-video scans are a separate compute bottleneck; their
  cost does not disappear when frame seeking is fixed.

Follow-up local fix: replace full signal statistics with an all-pixel Y/U/V
threshold gate and run the two independent scans concurrently. A 3-second 1080p
microbenchmark took 1.612s with signalstats versus 0.539s with the pixel gate;
this measures one scan, not an end-to-end production prepass. Existing thresholds,
native resolution, every-frame coverage and boundary handles are preserved.
Regression coverage includes a single changing chroma pixel against still luma.
Oversized inputs fall back to channel maxima to avoid integer counter overflow.

The narration follow-up adds one bounded host retry for temporary 429/5xx errors,
with identical text, cancellation and per-request timeouts. No narration or action
is scheduled during a failed synthesis attempt.

## What Page.screencast does and does not solve

The deployed Playwright CLI already uses `page.screencast.start` internally.
Using the API name alone does not fix TTS, event-loop blocking, checkpoint pipes,
or FFmpeg seeking. The pending capture changes use its frame callback directly
to control JPEG quality and the master encoder instead of the CLI's fixed
1 Mbps VP8 output, while preserving the first-frame clock and visible-tab changes.
VNC desktop geometry and paced mouse input are separate fixes.

For further efficiency, retain action-indexed screenshots/timestamps during
capture, reuse existing evidence, and prepare stable narration before recording
where the script is already known. Dynamic result narration still needs evidence
from the real interaction. These are follow-up opportunities, not changes claimed
as deployed by this investigation.

## Local validation

Full suite after the fixes: 1,647 passed and 17 skipped with
`bunx vitest run tests/ --maxWorkers=1 --silent`. A prior parallel run hit an
inconsistent API-key HTTP test; the final serial run passed without changing it.
Coverage includes delayed archive padding and corrupt archives, heartbeat timers
during an actual asynchronous child process, cancellation, multipart TTS responses,
missing-audio diagnostics, and frame equality at non-keyframe seek positions.
API/web TypeScript, changed-file Biome and diff whitespace checks passed. These fixes
are local changes awaiting deployment, not a claim that the active run was repaired.
