---
name: dev-test-report
description: Picks up a new GitHub issue via gh CLI, implements the change, verifies UI correctness and regression risk using agent-webbridge, then raises a PR with a humanized description. Use when the user says "pick up a ticket", "work on an issue", "take the next task", or wants to triage and resolve GitHub issues end-to-end.
---

# dev-test-report

End-to-end workflow: fetch an open GitHub issue, implement the change, validate it, and raise a PR — all in one shot.

## Prerequisites

- `gh` CLI authenticated (`gh auth status`)
- agent-webbridge running (`awb status` — must show `extensionConnected: true` for the target profile)
- A running dev server for the project (so UI changes can be verified in a real browser)

### Remote services (already deployed — do NOT start locally)

The following are accessed remotely via the URLs in `.env` and should **not** be started locally:

- **MinIO** (S3 storage) — `MINIO_ENDPOINT="https://s3.trypitch.co"`
- **CloakBrowser Manager** (headless browser) — `CLOAK_MANAGER_URL="https://cloakbrowser-manager.trypitch.co"`

### Starting local infrastructure

Only these essential services need to run locally:

```bash
docker compose -p pitch up -d postgres redis   # Start Postgres + Redis only
bun run db:migrate                             # Run pending database migrations
```

### Starting dev servers

This is a **Bun monorepo** with three dev servers: API (Express), Worker (BullMQ), and Web (Vite + React). Start them all concurrently in the background:

```bash
bun run dev &   # Starts api, worker, and web concurrently via Bun workspace filters
```

Or start them individually:

```bash
bun run dev:api &     # Express API on port 3000 (bun --watch)
bun run dev:web &     # Vite dev server on port 5173
bun run dev:worker &  # BullMQ worker (headless)
```

Wait a few seconds, then confirm they're up:

```bash
curl -s http://localhost:5173 > /dev/null && echo "web OK" || echo "web DOWN"
curl -s http://localhost:3000/health > /dev/null && echo "api OK" || echo "api DOWN"
```

Once all servers are healthy, proceed with agent-webbridge testing.

## Workflow

### Step 1 — Pick up a new ticket

```bash
gh issue list --limit 20 --json number,title,labels,state
```

- If the user specified an issue number, use that: `gh issue view <ISSUE_NUMBER>`
- Otherwise, list open issues and pick the **topmost open unassigned issue**, or ask the user which one to take.
- Parse the issue title, description, and labels. Labels like `UI`, `frontend`, `bug`, `feature` hint at the change type.

### Step 2 — Create a feature branch

```bash
git checkout main && git pull && git checkout -b issue-<ISSUE_NUMBER>-<slug>
```

### Step 3 — Implement the change

Read the issue description carefully. Implement the required change following the project's code conventions:

- **Runtime**: Bun + TypeScript
- **Frontend**: React 19 + Vite + Tailwind CSS 4 + shadcn/ui
- **API**: Express.js
- **Lint/format**: Biome (2-space indent, single quotes, no semicolons)
- **Workspace structure**: `apps/` (api, web, worker) and `packages/` (db, shared, storage, email)

Commit with a clear message referencing the issue:

```bash
git add -A && git commit -m "fix: <short description> (closes #<ISSUE_NUMBER>)"
```

### Step 4 — Verify UI changes (if applicable)

If the issue involves **any UI change** (labels mention `UI` / `frontend`, or the diff touches `.tsx`, `.jsx`, `.vue`, `.svelte`, `.css`, `.scss`, `.html` files), **you MUST visually verify**:

1. Start local infrastructure and dev servers in the background if not already running (`docker compose -p pitch up -d postgres redis && bun run dev &`). Wait for both API and web to become healthy, then proceed.
2. Use the **agent-webbridge** skill to open the affected page in Chrome:

```bash
awb status
```

If not healthy, bring the fleet up first (`awb up "Testing"`).

```bash
curl -s -X POST http://127.0.0.1:10086/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"navigate","args":{"url":"http://localhost:5173/<AFFECTED_ROUTE>","newTab":true,"group_title":"Verify issue #<ISSUE_NUMBER>"},"session":"verify-issue-<ISSUE_NUMBER>","profile":"Testing"}'
```

3. Take a screenshot:

```bash
curl -s -X POST http://127.0.0.1:10086/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"screenshot","args":{"format":"png","path":"/tmp/issue-<ISSUE_NUMBER>-after.png"},"session":"verify-issue-<ISSUE_NUMBER>","profile":"Testing"}'
```

4. Read the screenshot with the `Read` tool and **inspect**:
   - Does the changed component render correctly?
   - Is the layout non-broken (no overlap, overflow, misalignment)?
   - Are colors, spacing, and typography consistent with the rest of the page?
   - Does the change work at a reasonable viewport width?

5. If the issue had a **before screenshot** or description of the bug, navigate to the same route and compare.

6. Close the verification session when done:

```bash
curl -s -X POST http://127.0.0.1:10086/command \
  -H 'Content-Type: application/json' \
  -d '{"action":"close_session","args":{},"session":"verify-issue-<ISSUE_NUMBER>","profile":"Testing"}'
```

If the UI looks broken, **stop and fix** before proceeding. Do not raise a PR with a broken UI.

### Step 5 — Regression risk assessment

Before raising the PR, analyze the diff for regression risk:

```bash
git diff main...HEAD --stat
```

Check the following:

1. **Shared components** — Did the change modify a component used in multiple places? If so, list every consumer and reason about whether the change is backwards-compatible.
2. **API contracts** — Did the change alter request/response shapes, endpoints, or status codes? If so, flag it.
3. **State / data flow** — Did the change modify stores, context, or global state that other features depend on? If so, flag it.
4. **Side effects** — Does the change introduce new side effects (network calls, localStorage writes, redirects) that could fire unexpectedly?
5. **Test coverage** — Does the changed code have existing tests? Are they still passing? Run them:

```bash
bun run test   # vitest run
```

If you find **high regression risk**:
- Add a comment in the PR description under a `## Regression Risk` section.
- If the risk is critical (breaking change to shared code), flag it clearly and suggest the reviewer pay extra attention.
- If safe, note: "Low regression risk — change is isolated to [scope]."

### Step 6 — Run lint and type checks

```bash
bun run lint            # biome lint
bun run check           # biome check (lint + format)
bun --filter '*' build  # typecheck via tsc across all workspaces
```

Fix any errors before proceeding.

### Step 7 — Raise the PR

Push the branch:

```bash
git push -u origin issue-<ISSUE_NUMBER>-<slug>
```

Generate the PR description — write a clear, human-readable description that:

- Opens with a **one-line summary** of what this change does and why.
- Includes a `## What` section (what was changed, in plain language).
- Includes a `## Why` section (the issue context / motivation).
- Includes a `## How to test` section with concrete steps for the reviewer.
- Includes a `## Regression Risk` section (from Step 5).
- Includes a `## Screenshots` section (from Step 4, if UI) — reference the screenshot file path.
- Closes the issue: add `Closes #<ISSUE_NUMBER>` at the end.

Then create the PR:

```bash
gh pr create \
  --title "<human-readable title>" \
  --body "$(cat /tmp/pr-desc-<ISSUE_NUMBER>.md)" \
  --base main
```

If the description is short enough, pass it directly with `--body "<markdown>"`.

### Step 8 — Report back

Tell the user:
- Which issue was picked up
- The branch name
- The PR URL (from `gh pr create` output)
- Whether UI verification passed (with screenshot path if applicable)
- The regression risk level
- Any follow-up items the reviewer should watch for

## Error handling

- **gh auth fails**: Tell the user to run `gh auth login` first.
- **awb not healthy**: Tell the user to run `awb up "Testing"` and verify with `awb status`.
- **Dev server not running**: Start local infrastructure (`docker compose -p pitch up -d postgres redis`), migrate (`bun run db:migrate`), then start servers (`bun run dev &`). Wait for all to be healthy before proceeding.
- **Infrastructure not running**: Check with `docker compose -p pitch ps`. Start only the essential local services with `docker compose -p pitch up -d postgres redis`. MinIO and CloakBrowser Manager are remote — do not start them locally.
- **Tests fail**: Do not raise the PR. Fix the failing tests first.
- **Lint/type errors**: Fix before raising the PR.
- **UI looks broken**: Fix before raising the PR. Do not skip visual verification for UI issues.
