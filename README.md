<div align="center">

<pre>

    ____  ______________  __
   / __ \/  _/_  __/ __ \/ / /
  / /_/ // /  / / / / / / /_/ / 
 / ____// /  / / / /___/ __  /  
/_/   /___/ /_/  \____/_/ /_/   
</pre>

**A U T O N O M O U S &nbsp; C I N E M A T I C &nbsp; O R C H E S T R A T I O N**

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

*A distributed execution engine that transforms procedural web interactions into studio-quality, narrated MP4s.*
https://trypitch.co try it now



</div>

<br>

## ▌ THE VISION

PITCH bridges the gap between raw functional testing and high-end marketing execution. By orchestrating Headless Browsers, Generative AI TTS, and programmatic video stitching, it translates simple task descriptions into pixel-perfect, timing-synchronized cinematic demonstrations.

<br>

## ▌ SYSTEM ARCHITECTURE

Pitch is **one studio**. Every product — launch video, demo video, slide deck,
recording edit — is a *project*: a workspace directory, a resumable **pi** agent
session with every tool the studio has, and a live preview the browser plays.
The user chats; the thread shows everything the model does; the preview reloads
whenever the agent saves; things picked in the preview become numbered targets
in the next prompt. There are no workers or queues.

```text
  [ web ]        ──chat / SSE / preview──►  [ api ]     express, one process
                                                 │
                              ┌──────────────────┼──────────────────┐
                              ▼                  ▼                  ▼
                       [ pi session ]     [ workspace ]      [ host tools ]
                       per project         projects/<…>/     ffmpeg · Playwright
                       (Gondolin VM for    sources, renders   Gemini TTS · whisper
                        launch / deck)     watched → preview   CloakBrowser
                                                 │
                                                 ▼
                                       [ object storage ]  published outputs
```

See `docs/studio-architecture.md` for the contract (project model, agent
interface, routes, events).

<br>

## ▌ MONOREPO TOPOLOGY

| Matrix         | Entity          | Directive |
|:---------------|:----------------|:----------|
| **`apps/`**    | `studio`        | The server: auth, credits, projects, agent sessions, previews, renders, share, MCP, admin. |
|                | `web`           | The React app: projects grid, chat-first "new project", the StudioView. |
| **`.pi/`**     | `AGENT.md`, `extensions`, `skills`, `lib` | The agent: its base prompt, host tools as pi extensions, skills. |
| **`engine/`**  |                 | The shots.js compiler and the studio inspector that previews load. |
| **`packages/`**| `db`            | Prisma/ZenStack schema and data access. |
|                | `shared`        | Types, pricing, logging, manager client. |
|                | `storage`       | Object storage (S3/MinIO). |
|                | `email`         | Transactional email. |

<br>

## ▌ TECHNICAL STACK

■ **Runtime:** `Bun` (one server process; agents are pi sessions)  
■ **Agent runtime:** `pi` + `Gondolin` micro-VM sandboxes  
■ **Database:** `PostgreSQL` + `Prisma`  
■ **AI / Voice:** Google Gemini — the studio agent (`STUDIO_MODEL`, default
`google/gemini-3.8-flash`), TTS, vision grounding, and generated footage via
Gemini Omni (`generativelanguage.googleapis.com`)  
■ **Browser Automation:** `playwright-cli` connected to `cloakbrowser-manager`  
■ **Rendering:** `FFmpeg`  

<br>

## ▌ INITIALIZATION PROTOCOL

> **Before deploying, follow the [Installation Guide](./docs/installation.md)** to install the Loki Docker logging driver. This is required for centralized logging and must be done **before** running `docker compose`.

#### 01. Environment Configuration
Duplicate the configuration template and provide your active credentials.
```bash
cp .env.example .env
```
*Required: Ensure `GEMINI_API_KEY` is populated for the neural TTS engine. Set
`ELEVENLABS_API_KEY` for generated music and sound effects; `.pi/audio.json`
picks which of the two records the narration.*

#### 02. Dependency Resolution
Utilize Bun for rapid dependency tree resolution across all workspaces.
```bash
bun install
```

#### 03. Deploy the Stack
Start all services via Docker Compose:
```bash
docker compose up -d
```

> See [docs/installation.md](./docs/installation.md) for full setup instructions including Cloudflare Tunnel configuration.

#### 04. Expose Local Services (Dev Tunnel)
Expose any local service to the internet with automatic HTTPS on `*.trypitch.tech`:
```bash
./scripts/tunnel.sh 3000 pitch
```
> See [docs/dev-tunnel.md](./docs/dev-tunnel.md) for instructions, agent workflows, and configuration options.

<br>

## ▌ LICENSING

Free for personal and non-commercial use.

For an **official commercial license**, reach out at [officialtrypitch@gmail.com](mailto:officialtrypitch@gmail.com).

<br>

▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰

<div align="center">
  <i>"Code as Cinema."</i> <br><br>
  <b>© 2026 Hormuz Labs</b> · Free for personal use · <a href="mailto:officialtrypitch@gmail.com">Commercial license</a>
</div>

Amen


