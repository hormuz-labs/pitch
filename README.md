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
https://trypitch.co try it
</div>

<br>

## ▌ THE VISION

PITCH bridges the gap between raw functional testing and high-end marketing execution. By orchestrating Headless Browsers, Generative AI TTS, and programmatic video stitching, it translates simple task descriptions into pixel-perfect, timing-synchronized cinematic demonstrations.

<br>

## ▌ SYSTEM ARCHITECTURE

The pipeline operates on a horizontally scalable worker model coordinated by **BullMQ** and **Redis**. 

```text
  [ CLIENT ]                          [ REDIS CLUSTER ]
      │                                       │
      │ (1) Dispatch Job                      │ (3) Enqueue
      ▼                                       ▼
  [ API GATEWAY ] ──────────────────► [ WORKER NODES ] ──────┐
  express / REST                                             │
                                                             │ (4) Delegate
                                                             ▼
                                                [ OPENCODE SKILL CORE ]
  [ DISTRIBUTED STORAGE ] ◄────────────────────      auto-demo-gen
      ▲                                                      │
      │ (6) Save MP4 Payload                                 │ (5) Execute
      │                                                      ▼
  [ FFMPEG ENGINE ] ◄─── [ PUPPETEER DOM ] ◄─── [ GEMINI 3.1 TTS ]
   x264 Encoding          Frame Extraction       Audio Narration
```

<br>

## ▌ MONOREPO TOPOLOGY

Structured for scale using **Bun Workspaces**.

| Matrix        | Entity                | Directive |
|:--------------|:----------------------|:----------|
| **`apps/`**   | `api`                 | REST Gateway for job ingestion and status polling. |
|               | `worker`              | Headless compute nodes consuming the BullMQ pipeline. |
|               | `job-cli`             | Terminal interface for local orchestration. |
|               | `mock-server`         | Synthetic endpoint for isolation testing. |
|               | `web`                 | React/Vite dashboard for job visualization. |
| **`packages/`**| `db`                 | Prisma ORM schema and database abstraction layer. |
|               | `shared`              | Unified types, queue names, and utility constants. |
|               | `storage`             | File handling and blob persistence logic. |

<br>

## ▌ TECHNICAL STACK

■ **Runtime:** `Bun` (Native execution, Workspace orchestration)  
■ **Message Broker:** `Redis` + `BullMQ`  
■ **Database:** `SQLite` + `Prisma` (Production swappable)  
■ **AI / Voice:** Google Gemini TTS (`generativelanguage.googleapis.com`)  
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
*Required: Ensure `GEMINI_API_KEY` is populated for the neural TTS engine.*

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


