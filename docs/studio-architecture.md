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

There are no workers, queues or phase tables. The studio server hosts every
session (pi multiplexes them); heavy work (ffmpeg, Playwright, TTS, whisper)
runs as host tools in child processes.

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
  name          slug, unique per (userId, flow); the workspace dir name
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
else `empty`; `failed` when `lastError` is set and nothing newer exists.

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
| audio effects / SFX processing | `media_pedalboard` (`pitch media pedalboard`) | `audio-effects` |

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
POST   /projects                       { prompt, options?, uploads?[] } → creates it; runs the first turn only if `prompt` is non-empty → { project }
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
POST   /projects/:id/export            { res } → RenderStatus   (a launch page renders; anything else re-uploads)
GET    /projects/:id/export            RenderStatus
POST   /projects/:id/export/cancel
POST   /projects/:id/share             → { shareSlug }      DELETE …/share
GET    /files/projects/:internal/*     workspace files (owner or preview cookie)
GET    /files/engine/*                 the shots.js engine
GET    /files/music/*                  curated beds
GET    /music                          MusicTrack[]
POST   /uploads                        multipart → S3 URLs (used by "new project" for PDFs/images/videos)
GET    /d/:slug, /projects/public/:slug   share page + payload
/mcp, /v1                              create_project / get_project / list_projects / prompt_project (+ credits)
/checkout /credits /users /api-keys /affiliate /newsletter /browser /webhooks /admin   carried over
```

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

Nothing is charged to open a project. The studio meters what the work costs
and bills that (`apps/api/src/projects/usage.ts`):

| Metered | Where it comes from |
|---|---|
| model spend | `usage.cost.total` on each assistant message, reported by pi |
| host compute | wall clock inside every host action, timed in the bridge |

Cost accrues in dollars on `Project.usageUsd`, and credits are drawn down as
it crosses each `CREDIT_USD` boundary, so a cheap turn is not rounded up to a
credit and many cheap turns still add up. Asking a question costs almost
nothing; encoding 4K does not. A turn needs `MIN_BALANCE` credits to start.

Credits are fine grained — `CREDIT_USD` is $0.0025, so a demo video runs about
120 of them. That scale is a pricing decision, not a physical one: changing it
means changing every stored credit integer in lockstep (see the
`20260911120000_redenominate_credits` migration).

## There is no legacy path

The pre-studio job queue is gone: `Job`, `VideoEdition` and `StudioProject`
were dropped, along with the read-only project view that displayed imported
jobs. A project is the only thing the studio knows about.
