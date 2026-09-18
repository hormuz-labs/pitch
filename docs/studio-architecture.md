# Pitch Studio — architecture

Pitch is one studio with **one agent**. A **project** is a workspace
directory, a resumable **pi** session, and a **preview** the browser plays
live. The user chats; the thread shows everything the model does (text,
thinking, every tool call and result); the preview reloads whenever the agent
saves; pointing at things in the preview turns them into numbered targets in
the next prompt.

There are no flows. A project is not a category, so nothing decides at
creation whether it is "a deck" or "a demo": the agent reads the request,
picks the pipeline it needs, and can change its mind next turn. That is what
makes the ordinary request possible — upload a video, ask for the music to be
quieter — which no arrangement of per-product flows could answer.

There are no queues or phase tables. A project is held by one **worker**
process, which hosts its pi session and runs the heavy work (ffmpeg,
Playwright, TTS, whisper) as host tools in child processes. The default
layout is one process that is the API and the only worker; adding nodes is
described under [Scaling](#scaling).

```
apps/api        the server: auth, credits, projects, sessions, previews, renders, share, MCP, admin
apps/web    the app: projects grid, one "new project" door, StudioView, settings…
.pi/               AGENT.md (the base prompt), extensions (host tools), skills, libs
engine/            the shots.js compiler a launch film plays live
packages/*         db (Prisma/ZenStack), shared, storage, email — unchanged
```

## Project

```
Project {
  id            cuid
  userId        Clerk id (owner; the isolation boundary)
  flow          'studio' for everything new; the old values name workspaces already on disk
  name          slug, unique per user; the workspace dir name
  title         human title (host, topic, file name)
  prompt        the first message
  options       JSON  anything passed at creation (mostly empty — preferences are said in chat)
  sessionFile   pi session file (resumed across restarts)
  usageUsd      Float measured cost so far: model spend + host compute
  creditsCharged Int   credits billed against that cost so far
  outputs       JSON  [{ kind: 'video'|'pdf'|'html'|'thumbnail', url, res?, label?, createdAt }]
  thumbnailUrl  String?
  lastError     String?
  isPublic / shareSlug / shareViews
  createdAt / updatedAt
}
```

Workspace: `projects/<userId>--<name>/` for launch videos (the historical
layout) and `projects/<flow>--<userId>--<name>/` for the rest. Everything a
project is lives there: sources, recordings, renders, `.thumbs/`. The DB row is
the registry; the directory is the truth.

Status is derived, never stored: `working` while the session has a turn in
flight, else `ready` when the workspace probe finds a preview or an output,
else `empty`; `failed` when `lastError` is set and no current artifact exists.

Dropping a file with nothing typed is a normal way to start: the project
opens with the upload as its preview and no turn is run, because you cannot
say what you want about a video until you are looking at it and can select
the part you mean. Nothing is billed until the first real ask.

## The agent (`apps/api/src/agent/`)

```ts
// agent/toolkit.ts — one toolkit, for every project
EXTENSIONS     every .pi/extensions/*.ts pipeline, plus media-tools (probe / ffmpeg / publish)
skills()       every .pi/skills/* dir — the named outcomes are skills the agent reads on demand
BUILTIN_TOOLS  read, edit, write, find, grep, ls, bash — all inside the Gondolin VM
systemPrompt() .pi/AGENT.md: what a project is, how the user edits, which skill to read

// agent/index.ts
prepare(ws, options, uploads)  seed the union layout (below) — no pipeline has to ask what
                               kind of project it is
context(ws, turn)              per-turn steering: the workspace inventory, and whatever the
                               user selected on the artifact
describe(ws)                   → agent/describe.ts
```

```ts
interface Description {
  preview: { kind: 'html', url } | { kind: 'video', url } | { kind: 'deck', url } | { kind: 'browser', profileId } | null
  audioUrl?: string
  scenes?: Scene[]          // { id, index, start, end, dur, label?, type? }
  slides?: Slide[]          // { index, title? }
  duration?: number
  outputs: Output[]         // what the workspace holds (renders/, output.pdf…)
  error?: string | null     // e.g. shots.js does not evaluate
}
```

`describe()` **looks** rather than being told. It ranks the artifacts in the
workspace by mtime and previews the newest, so the preview follows the work:
ask for a deck and get a deck, ask that project for a video and the preview
becomes the video, with no flag saying which it is. A live recording
(`recording/live.json`) always wins, because then the user is watching a
browser rather than a file.

### Workspace layout

Seeded the same way every time — the union of what every pipeline looks for:

```
project.json              { userId, options, uploads }
uploads/<name>            everything the user attached, verbatim
recording/upload.<ext>    an attached video, where the recording editor looks
input/<name>              an attached PDF/PPTX, parsed into build/
build/                    deck working directory
renders/                  finished media (+ <name>.timeline.json beat maps,
                          + <name>.mp4.omni.json for a generated clip)
vendor/gsap/              the launch engine's runtime
audio/                    music bed and narration
```

### The asset shelf

`projects/assets.ts` derives a shelf from the workspace — `uploads/`, `input/`,
`renders/`, `audio/`, `recon/`, `build/images/`, `build/input-images/`, media
files only, intermediates excluded. It is derived rather than stored because
the agent adds to it without telling anyone.

An asset is addressed by its **workspace-relative path**, which is exactly what
every tool takes. So clicking a card in the shelf and naming a file in a tool
call are the same act: the `[n]` chip carries `asset: "uploads/logo.png"`, and
`buildContext` renders it as *the file uploads/logo.png* with a line saying it
is material to USE, not the artifact to change.

### Pipelines

The four products survive as **host actions** plus a skill, not as flows:

| Pipeline | Host actions | Skill |
|---|---|---|
| launch film | `motion_*` | `launch-video` |
| demo recording | `demo_*`, `storyboard_*` | `demo-video` |
| slide deck | `pdf_*`, `deck_render`, `deck_publish` | `slide-deck` |
| recording edit | `probe_video`, `transcribe_video`, `edit_render` | `recording-edit` |
| generated footage | `video_generate` | `generated-video` |
| anything else | `media_probe`, `media_ffmpeg`, `media_publish` | — |

`video_generate` is the odd one out: everything else RENDERS something that
exists (a GSAP composition, a real browser session, printed slides), and it
INVENTS footage — Gemini Omni, one synchronous POST to `/v1beta/interactions`,
~10 s of video with its own audio, back as a Files API URI. It is for shots
with no real source; the skill is mostly about when NOT to use it, because the
model will happily invent product UI that does not exist. Model spend is not
metered, but the call blocks for the whole generation, so the wall clock the
bridge already times is a fair proxy for its cost.

Skills are documentation for tools, so anything executable is a tool: the deep
deck skills name `pdf_parse` / `pdf_scaffold` / `pdf_scrape_images` /
`pdf_build` rather than the `node …` commands they used to print. The VM has
node and python but no ffmpeg, no browser and no network, so anything that
fetches, renders or encodes has to be a host tool anyway.

Host actions are registered with `registerHostAction(name, fn)` and called by
the extensions through the `__pitchStudioHost` bridge, with the workspace as
the authority (`.pi/lib/studio-host.ts`). Every call is timed, which is how
compute is metered.

## Routes (`apps/api`)

Auth: Clerk JWT (`requireAuth`) for the app; API keys for `/mcp` and `/v1`.
Media elements cannot send headers, so `?token=` is accepted on `/projects/:id/events`,
`/projects/:id/thumbnail` and `/files/…`; preview subresources use the signed,
path-scoped `pitch_preview` cookie.

```
GET    /projects                       list (derived status, outputs, thumbnail)
POST   /projects                       { prompt, options?, uploads?[] } → creates it; runs the first turn only if `prompt` is non-empty → ProjectDetail
GET    /projects/:id                   detail = Project + Description + busy
DELETE /projects/:id                   abort, drop session, delete workspace
POST   /projects/:id/prompt            { text, targets?, scene?, slide?, options?, delivery?: 'queue'|'steer' } → 202
POST   /projects/:id/rollback          { entryId } → branch before that user message and restore its workspace checkpoint
POST   /projects/:id/stop
GET    /projects/:id/messages          Entry[]
GET    /projects/:id/events            SSE (see below)
GET    /projects/:id/thumbnail?t=      JPEG from the live preview (html/deck) or the render at t
GET    /projects/:id/assets            Asset[] — the shelf, derived from the workspace
POST   /projects/:id/assets            { uploads[] } → stages them into uploads/; runs no turn
POST   /projects/:id/export            { res, format? } → RenderStatus (`format` may request an editable ZIP)
GET    /projects/:id/export            RenderStatus
POST   /projects/:id/export/cancel
POST   /projects/:id/share             → { shareSlug }      DELETE …/share
GET    /files/projects/:internal/*     workspace files (owner or preview cookie)
GET    /files/engine/*                 the shots.js engine
GET    /files/music/*                  curated beds
GET    /music                          MusicTrack[]
GET    /voices                         authenticated ElevenLabs catalog, search + pagination + preview URLs
POST   /uploads                        multipart → S3 URLs (used by "new project" for PDFs/images/videos)
GET    /d/:slug, /projects/public/:slug   share page + payload
/mcp, /v1                              create / prompt / get / list / export / credits / pricing
/checkout /credits /users /api-keys /affiliate /newsletter /browser /webhooks /admin   carried over
```

Editable video exports are fidelity-first interchange packages for Premiere
Pro, After Effects, or Blender. They contain the exact rendered movie, its
final mixed soundtrack as a separate WAV, frame-aligned shot/beat cuts, an
import file or project-building script, and a manifest. Browser graphics and
effects remain baked into the movie; After Effects packages additionally
reconstruct conservatively supported text and raster-image layers with sampled
position, scale, rotation, and opacity keyframes. Blender reconstructs the same
supported 2D text and raster-image animation as sequencer strips, while
Premiere reconstructs supported raster-image Motion and Opacity animation.
Unsupported layers remain in a baked fidelity composition or sequence.
Unsupported media is rejected rather than silently transcoded. Launch films
require a current MP4 at the selected resolution before packaging.

See [`editable-video-export.md`](editable-video-export.md) for the complete
strategy, sidecar and package contracts, target mappings, security boundaries,
limitations, and extension guide.

The new-project composer can pass `options.narrationVoice` as
`{ provider: 'elevenlabs', id, name }`. It is saved in `project.json` and used
by both `pitch motion tts` and `pitch demo speak`. It is a narration preference,
not a request to add speech. `ELEVEN_LABS_KEY` (or `ELEVENLABS_API_KEY`) stays on
the server. The voice picker uses existing provider samples; previewing them
does not generate or bill new audio. If a restricted key lacks `voices_read`,
the picker uses ElevenLabs' public standard-voice catalog.

## Events (SSE per project)

```
hello   { busy }
entry   { entry }            user / assistant / thinking / tool entries (tool: { name, status })
delta   { id, delta }        streamed text
update  { entry }            tool finished
reset   { entries }          active thread changed after rollback
tool    { name, args }       (for flows that derive stages)
status  { busy }
idle    { aborted? }
error   { message }
preview { ok, files, …Description }   the workspace changed
project { project }          outputs / title / share changed
deleted
```

The web app has one `useProject(id)` hook: it holds the detail, the thread,
busy, targets, and reloads the preview on `preview`/`idle`. `StudioView` picks a
preview renderer by `description.preview.kind`:

- `html`   — the launch engine iframe (postMessage transport, inspector, synced audio)
- `deck`   — the deck iframe with slide strip + element inspector
- `video`  — the latest render, with the beat strip and moment selection
- `browser`— the live noVNC view of the browser the demo agent is driving

## Selecting

Every artifact is edited the same way: point at the thing you want changed,
then say what should change. There are three kinds of pointer and they all end
as `[n]` chips in the composer:

| You click | The chip carries | It means |
|---|---|---|
| an element in the preview | `tagName`, `selector`, `sceneId`/`slide` | change this |
| the video track | `time`, and `endTime` for a drag | change this stretch |
| a card on the asset shelf | `asset` (a workspace path) | use this file |

The first two are the subject of the request; the third is material. The
launch and deck previews select DOM elements through the injected inspector.
A video has no DOM, so its unit of selection is **time**.

Under the player is a track. Drag across it for a **range**, click it for a
**moment**; either becomes a `[n]` chip in the composer, carrying `time` and
(for a range) `endTime` in seconds. `flow.context()` spells the span out for
the agent and tells it to touch only that stretch, which usually means one
`media_ffmpeg` call with an `enable='between(t,…)'` filter.

The track also draws **beats** when the render left a timeline behind — one
line of narration each. The renderer knows where each line landed:
`processVideo` returns the spans it kept, `mapThroughKeptSegments` maps a
pre-trim time onto the finished cut, and the intro card's `contentStartSec` is
added on top. Both video renderers return those beats, and the pipeline writes
them next to the .mp4 as `renders/<name>.timeline.json` (`{ durationSec,
beats }`). `describe()` turns the newest render's sidecar into
`Description.scenes` via `scenesFromTimeline`, which is also what fills the
scene strip and its ffmpeg thumbnails.

Sources of beats: a demo recording stores the spoken text on each narration
clip in `recording/demo-state.json`; a recording edit uses the whisper
segments in `recording/transcript.json`. A video with neither still selects by
range — it just has no beats drawn on the track.

## Credits

See [Credit pricing](credit-pricing.md) for the complete formulas, model examples,
plan allowances, and estimated generations per plan.

Nothing is charged to open a project. The studio meters what the work costs
and bills that (`apps/api/src/projects/usage.ts`):

| Metered | Where it comes from |
|---|---|
| model spend | `usage.cost.total` on each assistant message, reported by pi |
| host compute | wall clock inside every host action, timed in the bridge |

Each model has a relative credit multiplier (configured with
`STUDIO_MODEL_CREDIT_MULTIPLIERS`) applied to that turn's model and compute
cost. A platform margin (`STUDIO_PLATFORM_MARGIN`, default `1.25`) is applied
afterward. Cost accrues in dollars on `Project.usageUsd`, and credits are drawn down as
it crosses each `CREDIT_USD` boundary, so a cheap turn is not rounded up to a
credit and many cheap turns still add up. Asking a question costs almost
nothing; encoding 4K does not. A turn needs `MIN_BALANCE` credits to start.

Credits are fine grained — `CREDIT_USD` is $0.0025, so a demo video runs about
120 of them. That scale is a pricing decision, not a physical one: changing it
means changing every stored credit integer in lockstep (see the
`20260911120000_redenominate_credits` migration).

## Scaling

The studio scales in two directions that have nothing in common. A
**session** is long-lived, stateful and interactive: a pi conversation, a
warm workspace, a watcher, mostly waiting on a model and writing files. A
**render** is short, stateless and retriable: a capture, an encode, a
transcription, taking every core it is given for a minute or ten. Sessions
are placed under leases and never queued; renders are queued and never
placed. Coordination is three tables in Postgres, and every process reads
the same three.

```
StudioWorker { id, url, slots, epoch, draining, heartbeatAt }   one row per worker process
Project      { workerId, workerEpoch, leasedAt, lastWorkerId,   the lease
               workspaceVersion, artifactKind, busyAt }         worker-maintained caches
RenderJob    { projectId, action, params, workspaceVersion,     a heavy host action to run
               status, stage, progress, result, error,          elsewhere, against a checkpoint
               renderer, attempts, heartbeatAt, cancelRequested }
```

**Roles** (`STUDIO_ROLE`, one image): `all` is the API and a worker in one
process — the single box, and what `make dev` runs — with every render
in-process; `api` replicas hold no project and proxy every project
operation; `worker` nodes own projects and answer only the worker contract
(`/internal/worker`, behind `STUDIO_WORKER_TOKEN`) and `/files` (for the
browser managers loading previews); `render` pods hold nothing and run the
heavy host actions workers queue.

**Registration.** A worker upserts its row on boot with a new `epoch`,
heartbeats every `STUDIO_HEARTBEAT_MS`, and is dead once the heartbeat is
older than `STUDIO_LEASE_TTL_MS`. A new node with four slots is known to
every API the moment its first heartbeat lands. A worker that cannot write a
heartbeat for a whole TTL drops everything it holds, because the rest of the
system is entitled to re-place it.

**Placement** (`worker/lease.ts`). A project's owner is the worker named on
its row, valid while that worker is live at that epoch. Otherwise whichever
API touches the project next places it, in one short transaction: live,
not draining, a free slot, preferring the last holder (warm disk), else the
first by id. First, not least loaded: the fleet packs onto its lowest
workers and leaves the highest empty, which is the one an autoscaler takes
away. Two replicas placing the same project at once cannot both win.
`worker/client.ts` turns the owner into a `WorkerClient` — the host module
itself when the owner is this process, an HTTP client otherwise — and the
routes only ever talk to that.

**Ownership** (`worker/host.ts`). Every worker-side operation first checks
that the row still names this worker at this epoch. That is the fence: a
worker that lost its lease answers 409, drops the project, and the API
places again. The worker keeps `busyAt` and `artifactKind` on the row so
lists never open a project.

**Storage.** The hot copy is `projects/<internal>/` on the owner's disk —
where ffmpeg, the browser and the file watcher want it. The durable copy is
a checkpoint in a private bucket (`STUDIO_WORKSPACE_BUCKET`):
`workspaces/<projectId>/<version>/{workspace.tar,history.tar,session.jsonl,manifest.json}`
plus `cover.jpg` for the grid. A dirty workspace is checkpointed once it has
been quiet for `STUDIO_CHECKPOINT_SETTLE_MS` and the turn is over; the
version bump is fenced by the lease. A worker opening a project compares the
row's version with the marker file in its local copy (`.studio-checkpoint`)
and restores when they differ; a directory with no marker and a row that
was never checkpointed is a workspace from before this existed, adopted as
it is. Idle projects (`STUDIO_IDLE_RELEASE_MS`, never with an open event
stream) are checkpointed, closed and released; the directory stays as a
warm cache.

**What a dead node loses:** the turn in flight since the last checkpoint,
and any live browser recording. The next request re-places the project on
another worker, which restores the last checkpoint and carries on.

**Events.** A browser's event stream is held by one API replica and fed by
the owning worker's bus. An event raised elsewhere (an API marking a project
failed) is forwarded to the owner. If the worker goes away the stream sends
an error and the client reconnects, landing wherever the project is by then.

**Draining.** `SIGTERM` marks the worker draining so placement stops
sending it projects. With a drain window (`STUDIO_DRAIN_MS`, what a
scale-down or a rollout sets) it keeps serving what it holds — the API still
reaches it, the lease says so — and releases each project the moment its
turn is over, checkpointed; whoever was watching reconnects and lands on
another worker with nothing lost. Whatever is still running when the window
closes is released anyway. Without a window (the default, a plain stop)
everything is released at once and the turns in flight are lost. Then
`STUDIO_SHUTDOWN_GRACE_MS` for the last checkpoints, and exit.

**The render tier** (`studio/host-actions.ts`, `worker/remote.ts`,
`renderer/`). A host action registered with `remote: true` is one that
burns a machine: `launch_export` and `launch_capture` (capture.mjs through
the browser, then libx264), `launch_align` and `media_transcribe`
(whisper), `edit_render`, `demo_encode`, `media_ffmpeg`. On a worker in
`STUDIO_RENDER=remote` (the default with checkpoints) the registry hands
such a call to the dispatcher instead of running it: the workspace is
checkpointed as it stands, a `RenderJob` names the action, its params and
that version, and the worker polls the row, relaying `stage`/`progress`
to whoever is watching and a cancel the other way. A render pod claims the
oldest job (`UPDATE … SKIP LOCKED`), restores the checkpoint onto its
scratch disk — warm if it rendered that project before — runs the very
same action code against it, tars the files the action wrote to
`renders/<jobId>/output.tar` in the workspace bucket, and marks the job
done; the worker extracts them over its hot copy and the watcher sees them
land. The action never knows where it ran, which is why it must read only
the workspace and the database and write only into the workspace. A pod
that dies stops heartbeating and the job is claimed again, up to
`STUDIO_RENDER_ATTEMPTS`; one that is asked to stop aborts the action's
signal. A light action may call a heavy one (`demo_render` stops the live
browser on the worker, then `demo_encode` runs where renders run).

**Browsers.** No process runs a browser of its own. The CloakBrowser
managers are a pool (`CLOAK_MANAGER_URL` naming a headless Service, or one
manager); a process resolves the pool and pins to the lowest-ordinal
manager with fewer than `CLOAK_MANAGER_CAPACITY` profiles running
(`@saas/shared` → `pickManager`), re-picking every few minutes, and a
render pod re-picks per job. A user's browser session records the manager
it started on, so scaling the pool never moves it. Previews and thumbnails
load from the worker over the pod network (`STUDIO_INTERNAL_ORIGIN`) with
the preview cookie; a capture serves the workspace into the page by request
interception and needs no route back at all.

**Scaling the fleet.** One number moves: render pods, one per job queued
or running. The API sets it itself (`renderer/autoscale.ts` patches the
render Deployment's scale, 0–8, up at once, down after ten quiet minutes)
— no KEDA, no metrics adapter. The pods run on spot nodes, since a
preempted pod is just a retried job. Workers are a fixed count: one holds
tens of sessions and its CPU is not the point. `GET /internal/scale`
(behind the worker token) reports both — `wanted`, how many workers it
would take to hold every leased project with `STUDIO_SCALE_HEADROOM` free
(the demand, not the utilisation: a worker mid-turn is waiting on a
model), and `render.wanted` — as a reading, and the browser managers scale
on CPU with a plain HPA. Any live worker whose id is outside
`STUDIO_SCALE_GROUP` (a machine on the tailnet) is fixed capacity whose
slots are used first.

**Networking.** Workers need a private URL other processes can reach
(`STUDIO_WORKER_URL`): a VPC address, a compose service name, a Tailscale
egress Service. Nothing here needs a public port. Every node needs the same
`DATABASE_URL`, object storage (`STORAGE_DRIVER` and its buckets — GCS in
production, MinIO locally, one contract in `@saas/storage`),
`STUDIO_WORKER_TOKEN` and `PREVIEW_COOKIE_SECRET`,
a reachable browser manager or pool (`CLOAK_MANAGER_URL`; the one a
session started on is recorded so the VNC proxy bridges to the right one),
and its own `projects/` and pi volumes. A render pod needs the same minus a
private URL and plus the whisper model on its disk.

## There is no legacy path

The pre-studio job queue is gone: `Job`, `VideoEdition` and `StudioProject`
were dropped, along with the read-only project view that displayed imported
jobs. A project is the only thing the studio knows about.
