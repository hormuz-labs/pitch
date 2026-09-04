# MCP Server & API Keys

> Public-facing docs live at `apps/web/src/docs/pages.tsx` and render at
> https://trypitch.co/docs. This file is the internal companion: keep both in
> sync when tools, costs, or auth change. The `pk_` key also authenticates the
> REST API in `apps/api/src/routes/v1.ts`.

The studio exposes a remote [Model Context Protocol](https://modelcontextprotocol.io)
server so external agents can use the product the same way humans do in the web
UI — start a project (launch video, demo video, deck, recording edit), talk to
its agent, and read its outputs — with the same credit accounting. Users mint
API keys from the **API Keys** page (`/api-keys`) in the web app.

## Endpoint

```
POST https://api.trypitch.co/mcp
```

Transport: MCP Streamable HTTP, stateless (no session id — every request is
independent). `GET`/`DELETE` return 405.

## Authentication

Create a key in the web app (**API Keys → Create key**). The full key (`pk_…`)
is shown once; only its SHA-256 hash is stored. Send it as a Bearer token:

```
Authorization: Bearer pk_...
```

(`x-api-key: pk_...` also works.) Keys resolve to the owning user; all tools
are scoped to that user, and credit usage lands in the same ledger as web
usage (`CreditTransaction` rows with the project id). Revoking a key in the UI
takes effect immediately.

### Client config example

```json
{
  "mcpServers": {
    "pitch": {
      "url": "https://api.trypitch.co/mcp",
      "headers": { "Authorization": "Bearer pk_your_key_here" }
    }
  }
}
```

## Tools

| Tool | Cost | Description |
|---|---|---|
| `create_project` | see below | Start a project and send its first prompt. Args: `flow` (required: `launch-video`\|`demo-video`\|`deck`\|`recording-edit`), `prompt` (required — the product URL and brief, the topic, the instructions…), `options?` (flow options, below), `uploads?` (array of `{ fileBase64, fileName }`). Returns the project; poll `get_project` for outputs. |
| `prompt_project` | free | Follow-up message to a project's agent (edits, changes, renders). Args: `projectId`, `text`, `scene?` (scope to a scene/shot id), `slide?` (1-based slide). Returns the project; the agent works asynchronously. Errors with "busy" while a turn is still running. |
| `get_project` | — | One project: `status`, `outputs`, `scenes`/`slides`, `shareUrl`, `error`. This is what the agent polls. |
| `list_projects` | — | The key owner's projects, newest first. Args: `flow?`, `limit?` (1–100, default 50). |
| `export_project` / `export_status` | — | Render a launch video MP4 (`res` 720p/1080p/4k; paid tier free, higher tiers charge the difference) and poll its progress; other flows return their latest output. |
| `get_credits` | — | Balance, active subscription, recent transactions. |
| `get_pricing` | — | What each flow costs in credits (same payload as `GET /v1/pricing`). |

### Credit costs

Charged once, at `create_project`, by `flow.price(options)`
(`apps/api/src/flows/<flow>/index.ts`). Every `prompt_project` after that
is free. The charge is refunded if the first turn ends with nothing usable.

| Flow | Credits | Options |
|---|---|---|
| `launch-video` | 5 (720p) / 8 (1080p, default) / 12 (4K), **+1 with narration** (default on) — so 6 / 9 / 13 narrated; see `launchVideoCreditCost` in `packages/shared` | `resolution?` (`720p`\|`1080p`\|`4k`), `narration?` (default true), `music?` |
| `demo-video` | 3 | `url?`, `instructions?`, `script?`, `voice?`, `background?`, `shape?`, `inset?`, `browserHeader?`; uploads: PDFs/images (≤ 50 MB each) become a slideshow |
| `deck` | 1 to generate; **2** when enhancing an upload (`options.mode` set) | `topic?`, `slideCount?`, `headings?`, `template?`, `mode?` (`recreate`\|`preserve`); uploads: one `.pdf`/`.pptx` (≤ 50 MB) |
| `recording-edit` | 2 | `productName?`, `productUrl?`, `instructions?`; uploads: the recording (`.mp4 .webm .mov .mkv .avi`, ≤ 500 MB) |

### Project shape

Every tool that touches a project returns the same object
(`publicProject` in `apps/api/src/lib/public-api.ts`):

```json
{
  "id": "cm4x8k2p90001abcd",
  "flow": "demo-video",
  "title": "trypitch.co",
  "status": "working",
  "busy": true,
  "prompt": "https://trypitch.co — walk through sign-up, under 60s",
  "options": {},
  "outputs": [],
  "thumbnailUrl": null,
  "shareUrl": null,
  "error": null,
  "scenes": [],
  "createdAt": "2026-09-02T10:14:03.221Z",
  "updatedAt": "2026-09-02T10:14:03.221Z"
}
```

`status` is derived, never stored: `working` while the agent has a turn in
flight, `ready` when the flow finds a preview or an output, `failed` when
`error` is set and nothing newer exists, `empty` otherwise. `outputs` is an
array of `{ kind: 'video'|'pdf'|'html'|'thumbnail', url, res?, label?, createdAt }`,
newest first. `scenes` (launch/demo/recording) and `slides` (deck) come from the
live workspace.

Poll `get_project` until `status` is `ready` or `failed`, then read `outputs`.
To change something, call `prompt_project` (free) and poll again: `status` goes
back to `working` while the agent edits. Insufficient credits return a tool
error containing the current balance. A launch video's MP4 is rendered by the
Export button in the app (`/p/:id`); the API surfaces its scenes and preview
state but has no export endpoint yet.

## Implementation notes

- `apps/api/src/routes/mcp.ts` mounts the stateless transport; auth is
  `requireApiKey` in `apps/api/src/middleware/auth.ts`.
- `apps/api/src/mcp/server.ts` registers the tools. `create_project`,
  `prompt_project`, `get_project` and `list_projects` call the shared helpers in
  `apps/api/src/lib/public-api.ts` (`createFromApi`, `promptFromApi`,
  `getFromApi`, `listFromApi`), which wrap the same project service the app
  uses (`apps/api/src/projects/service.ts`: credit-gate → create row →
  deduct → prepare workspace → first turn), so usage tracking is identical for
  humans and agents. Base64 uploads are staged to object storage by
  `stageBase64Upload` (`apps/api/src/lib/base64-upload.ts`) before the
  project is created. `/v1` uses the same helpers.
- The route is mounted before `clerkMiddleware` in `apps/api/src/index.ts`
  with its own `express.json({ limit: '750mb' })` (base64 uploads up to
  500 MB must survive body parsing).
- API-key CRUD for the UI lives in `apps/api/src/routes/api-keys.ts`
  (Clerk-authenticated), backed by the `ApiKey` model (table `PitchApiKey` —
  the plain `ApiKey` table name is taken by an unrelated service in the dev
  database).
