# MCP Server & Public API

> Public-facing docs live at `apps/web/src/docs/pages.tsx` and render at
> https://trypitch.co/docs. Keep both surfaces and `apps/web/public/openapi.json`
> in sync.

Pitch exposes the same studio through MCP and REST. A project is one workspace
and one resumable agent session. The request and attached files determine which
tools the agent uses; callers do not select a product flow.

## Endpoints

```text
POST https://api.trypitch.co/mcp
https://api.trypitch.co/v1/*
```

MCP uses stateless Streamable HTTP. `GET /mcp` and `DELETE /mcp` return 405.

## Authentication

Create a key on the API Keys page. Send the full `pk_...` key as either:

```text
Authorization: Bearer pk_...
X-API-Key: pk_...
```

Only the SHA-256 hash is stored. Keys resolve to their owner, and projects and
credit usage are scoped to that user. Revocation takes effect immediately.
`GET /v1/pricing` is public; every other `/v1` route and MCP require a key.

## MCP Tools

| Tool | Description |
|---|---|
| `create_project` | Create a project from `prompt`, optional `options`, and optional base64 `uploads`. A deprecated optional `flow` hint is accepted but ignored. |
| `prompt_project` | Send another usage-metered message. Active work is queued by default; `delivery: "steer"` redirects it. |
| `get_project` | Read status, outputs, scenes/slides, sharing, and errors. |
| `list_projects` | Return `{ data, total }`, newest first. `limit` is 1-100, default 50. |
| `export_project` | Start an export on the project's owning worker. Optional `res`: `720p`, `1080p`, or `4k`. |
| `export_status` | Read export progress without starting work. |
| `get_credits` | Read the credit summary. |
| `get_pricing` | Read usage-metering rates and indicative launch export tiers. |

Every tool returns JSON in a text content block. Failures set `isError: true`.

## Billing

Projects are not priced up front. Model spend and timed host compute accrue as
work runs, including follow-up prompts and exports. A turn that successfully
loads one of Pitch's provided skills applies a 250x multiplier to that turn's
model usage only. Host compute and provider charges are not multiplied. One credit currently
represents `$0.0025` of measured cost after configured multipliers and margin.
A minimum balance is required to start work. Insufficient-credit errors include
the current balance when available.

Creation itself is not charged. An empty prompt is allowed when uploads are
present and opens the project without running a turn.

## Uploads

Uploads are `{ fileBase64, fileName }`. Accepted extensions are `.pdf`, `.pptx`,
`.png`, `.jpg`, `.jpeg`, `.webp`, `.mp4`, `.webm`, `.mov`, `.mkv`, and `.avi`.
Documents and images are limited to 50 MB after decoding; videos are limited to
500 MB. The complete JSON request is limited to 750 MB. Successfully staged
objects are removed if staging or project creation fails.

## Project Shape

```json
{
  "id": "cm4x8k2p90001abcd",
  "title": "trypitch.co",
  "status": "working",
  "busy": true,
  "prompt": "Create a short narrated product demo",
  "options": {},
  "outputs": [],
  "thumbnailUrl": null,
  "shareUrl": null,
  "error": null,
  "scenes": [],
  "createdAt": "2026-09-18T10:14:03.221Z",
  "updatedAt": "2026-09-18T10:14:03.221Z"
}
```

`status` is derived: `working` while a turn is active, `ready` when an artifact
or output exists, `failed` when an error exists and no artifact exists, and
`empty` otherwise. List responses omit live-workspace `scenes` and `slides`.

## REST

```text
POST /v1/projects
GET  /v1/projects?limit=50
GET  /v1/projects/:id
POST /v1/projects/:id/prompt
POST /v1/projects/:id/export
GET  /v1/projects/:id/export
GET  /v1/credits
GET  /v1/pricing
```

REST errors use `{ "error": { "code", "message", ... } }`. Malformed JSON is
`400 invalid_request`; oversized requests are `413 payload_too_large`; rejected
work is `402 insufficient_credits`; ownership-safe missing resources are 404.

## Implementation

- `routes/mcp.ts` and `routes/v1.ts` mount before Clerk and authenticate API keys.
- `mcp/server.ts` registers tools; `lib/public-api.ts` supplies their shared behavior.
- Every creation path delegates to `projects/service.ts:createProject`.
- Workspace and session operations, including public exports, go through the
  `WorkerClient` selected by `withOwner()`.
- Base64 uploads are staged to object storage before workspace preparation.
