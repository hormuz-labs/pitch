# MCP Server & API Keys

The API exposes a remote [Model Context Protocol](https://modelcontextprotocol.io)
server so external agents can use the product the same way humans do in the web
UI — create demo videos, product launch videos, generate PDFs, enhance decks,
and edit recordings — with the same credit accounting. Users mint API keys from
the **API Keys** page (`/api-keys`) in the web app.

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
usage (`CreditTransaction` rows with the job id). Revoking a key in the UI
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
| `create_demo_video` | 3 credits | AI demo video for a product URL. Args: `url` (required), `instructions?`, `script?`, `voice?`, `assets?` (URLs). |
| `create_launch_video` | 5 credits | AI product launch video (HTML/GSAP → MP4). Args: `name` (required), `prompt` (required), `music?` (shared library filename). |
| `create_pdf` | 1 credit | Generate a PDF/slides deck. Args: `topic` (required), `instructions?`. |
| `enhance_presentation` | 1 credit | Enhance a PDF/PPTX. Args: `fileBase64`, `fileName` (≤ 50 MB), `mode?` (`recreate`/`preserve`), `enhancePrompt?`, `slideCount?`. |
| `edit_recording` | 2 credits | Edit a narrated screen recording. Args: `fileBase64`, `fileName` (≤ 500 MB; mp4/webm/mov/mkv/avi), `productName?`, `productUrl?`, `instructions?`. |
| `get_job` | — | Job by id (status, `videoUrl`/`pdfUrl` when done, `cost`, `error`). |
| `get_launch_video` | — | Launch video project by name: scenes, duration, `videoUrl` when ready. |
| `list_jobs` | — | List jobs, optional `type` filter: `video`/`pdf`/`enhance`/`edit-recording`. |
| `list_launch_videos` | — | List all launch video projects for the API key owner. |
| `get_credits` | — | Balance, active subscription, recent transactions. |

Create tools return `{ jobId, status }`; poll `get_job` until
`status === 'COMPLETED'` and read the result URL. For launch videos,
`get_launch_video` remains available for scene and project details by name once
the worker has created the project workspace. Insufficient credits return a
tool error containing the current balance.

## Implementation notes

- `apps/api/src/routes/mcp.ts` mounts the stateless transport; auth is
  `requireApiKey` in `apps/api/src/middleware/auth.ts`.
- `apps/api/src/mcp/server.ts` registers the tools. The five queued-job
  create-tools call the shared job services in `apps/api/src/lib/job-service.ts`
  — the exact same credit-gate → create → deduct → enqueue path as the REST
  routes, so usage tracking is identical for humans and agents. Launch-video
  list/detail tools read the same project state used by
  `apps/api/src/routes/launch-video.ts`.
- The route is mounted before `clerkMiddleware` in `apps/api/src/index.ts`
  with its own `express.json({ limit: '750mb' })` (base64 uploads up to
  500 MB must survive body parsing).
- API-key CRUD for the UI lives in `apps/api/src/routes/api-keys.ts`
  (Clerk-authenticated), backed by the `ApiKey` model (table `PitchApiKey` —
  the plain `ApiKey` table name is taken by an unrelated service in the dev
  database).
