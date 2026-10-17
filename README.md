# Pitch Studio

An AI design workspace: describe what you want, an agent writes HTML
prototypes, decks and documents into a project folder, and the studio previews
them live. Written in Rust, with [goose](https://github.com/aaif-goose/goose)
as the agent harness and a SolidJS front end.

## Run

```bash
cd web && bun install && bunx vite build && cd ..
OD_MODEL_BASE_URL=https://<model-proxy> OD_MODEL_API_KEY=<key> OD_MODEL=<model-id> cargo run
```

Open http://127.0.0.1:7456. Data lives in `.od/` (`OD_DATA_DIR`).

| Variable | Meaning |
|---|---|
| `OD_MODEL_BASE_URL` | Model proxy base URL (no `/v1`) |
| `OD_MODEL_API_KEY` | Key for the proxy (or `OD_MODEL_API_KEY_FILE`, a file holding it) |
| `OD_MODEL` | Default model id |
| `OD_MODELS` | Comma-separated models for the picker |
| `OD_MODEL_PROTOCOL` | `openai` (default), `anthropic`, or `gemini` (Google's OpenAI-compatible endpoint; base URL defaults to it and the key falls back to `GEMINI_API_KEY`) |
| `OD_MODEL_CHAT_PATH` | Chat endpoint path under the base URL (default `v1/chat/completions`) |
| `OD_API_TOKEN` | When set, every API call needs it as a bearer token |
| `OD_HOST`, `OD_PORT` | Listen address (default `127.0.0.1:7456`) |
| `OD_PREVIEW_PORT` | Port of the preview origin for agent-written files (default `OD_PORT + 1`) |
| `OD_PREVIEW_ORIGIN` | Public preview origin when it has its own host, e.g. `https://preview.example.com` |

For UI work, `cd web && bunx vite` proxies `/api` to the server
(`OD_DAEMON=http://127.0.0.1:7456`).

## Desktop app (macOS)

`crates/desktop` wraps the same server in a [Tauri](https://tauri.app) window.
The server runs inside the app on loopback ports chosen at startup; data lives
in `~/Library/Application Support/co.trypitch.studio`, and the model is set in
**Settings**.

```bash
cd web && bunx vite build && cd ..
cargo run -p pitch-studio
```

The workspace's default members skip the desktop crate, so a plain
`cargo build` (and CI) never needs a system webview.

## License

Pitch is licensed under the [Apache License 2.0](LICENSE), allowing personal and commercial use, modification, and distribution.

Redistributions must include the license, retain applicable copyright and attribution notices, and reproduce the attribution in [NOTICE](NOTICE) as required by the license. Modified files must carry notices stating that they were changed. Attribution: **Pitch by Hormuz Labs**.

Third-party assets retain their respective licenses (see `NOTICE`).

<sub>Pitch · © 2026 Hormuz Labs</sub>

[![Website: trypitch.co](https://img.shields.io/badge/Website-trypitch.co-16a34a?style=flat)](https://trypitch.co)
[![Discord: Join](https://img.shields.io/badge/Discord-Join-5865F2?style=flat&logo=discord&logoColor=white)](https://discord.gg/a4SBW36mD)
[![X: trypitchdotco](https://img.shields.io/badge/X-trypitchdotco-000000?style=flat&logo=x&logoColor=white)](https://x.com/trypitchdotco)
[![YouTube: Pitch](https://img.shields.io/badge/YouTube-Pitch-FF0000?style=flat&logo=youtube&logoColor=white)](https://www.youtube.com/@trypitchdotco)
[![Instagram: trypitch.co](https://img.shields.io/badge/Instagram-trypitch.co-E4405F?style=flat&logo=instagram&logoColor=white)](https://www.instagram.com/trypitch.co)
[![LinkedIn: Pitch](https://img.shields.io/badge/LinkedIn-Pitch-0A66C2?style=flat)](https://www.linkedin.com/company/trypitchdotco/)
[![GitHub: hormuz-labs/pitch](https://img.shields.io/badge/GitHub-hormuz--labs%2Fpitch-181717?style=flat&logo=github&logoColor=white)](https://github.com/hormuz-labs/pitch)
