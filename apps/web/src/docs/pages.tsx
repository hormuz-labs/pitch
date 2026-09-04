/**
 * Docs content. Each page is a list of blocks so the layout can derive the
 * "On this page" list from the h2s without a markdown pipeline.
 *
 * Every fact here is checked against the code:
 *   auth        apps/api/src/middleware/auth.ts
 *   REST        apps/api/src/routes/v1.ts
 *   shapes      apps/api/src/lib/public-api.ts
 *   MCP         apps/api/src/mcp/server.ts
 *   credits     packages/shared/src/index.ts, apps/api/src/flows/<flow>/index.ts
 *   project     apps/api/src/projects/service.ts
 * If you change one, change the other.
 */
import type { ReactNode } from 'react'

export type Block =
  | { k: 'p'; text: ReactNode }
  | { k: 'h2'; text: string }
  | { k: 'h3'; text: string }
  | { k: 'code'; lang?: string; code: string }
  | { k: 'table'; head: string[]; rows: ReactNode[][] }
  | { k: 'list'; items: ReactNode[]; ordered?: boolean }
  | { k: 'note'; text: ReactNode }

export interface DocPage {
  slug: string
  title: string
  group: 'Guide' | 'Reference'
  nav: string
  lede: string
  blocks: Block[]
}

const C = ({ children }: { children: ReactNode }) => <code>{children}</code>
const A = ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>

const BASE = 'https://api.trypitch.co'

/* ── Overview ──────────────────────────────────────────────────────────── */

const overview: DocPage = {
  slug: '',
  title: 'Overview',
  group: 'Guide',
  nav: 'Overview',
  lede: 'Pitch turns a product URL into a finished video. You can drive it from an AI agent over MCP, or from your own code over REST.',
  blocks: [
    {
      k: 'p',
      text: 'An agent opens a real browser, walks through your product, writes the script, records the screen, and renders an MP4. The same studio also builds launch films, slide decks, and cleans up screen recordings you already have.',
    },
    {
      k: 'p',
      text: 'There are two ways in. Both take the same API key and spend from the same credit balance.',
    },
    {
      k: 'table',
      head: ['', 'MCP', 'REST'],
      rows: [
        ['Endpoint', <C key="a">POST /mcp</C>, <C key="b">/v1/*</C>],
        [
          'Use it when',
          'An AI agent should decide what to make',
          'Your code already knows what to make',
        ],
        ['Shape', 'JSON-RPC tool calls', 'Plain HTTP and JSON'],
        ['Set up in', 'Claude, Cursor, ChatGPT, Perplexity', 'curl, any HTTP client'],
      ],
    },
    { k: 'h2', text: 'What you can make' },
    {
      k: 'table',
      head: ['Flow', 'What it is', 'Credits'],
      rows: [
        [
          <C key="a">demo-video</C>,
          'The agent drives your live product and narrates the flow',
          '3',
        ],
        [
          <C key="b">launch-video</C>,
          'A scripted, scored, cinematic film built scene by scene',
          '6 to 13',
        ],
        [<C key="c">deck</C>, 'A slide deck written and designed from a topic', '1'],
        [
          <>
            <C>deck</C> + upload
          </>,
          'A redesign of a PDF or PPTX you upload',
          '2',
        ],
        [<C key="e">recording-edit</C>, 'A cut of a screen recording you already made', '2'],
      ],
    },
    {
      k: 'p',
      text: (
        <>
          Launch video pricing depends on resolution and narration. See{' '}
          <A to="/docs/credits">Credits</A>.
        </>
      ),
    },
    { k: 'h2', text: 'How a project runs' },
    {
      k: 'p',
      text: 'Every output is a project: a workspace, an agent, and a conversation. You create it with a first prompt, the agent starts working right away, and creation returns with an id. The work takes minutes, not milliseconds, so you poll for the result. Once it is ready you can keep talking to the same agent to change things, for free.',
    },
    {
      k: 'code',
      lang: 'text',
      code: `create  ->  working  ->  ready  <->  working  (each follow-up prompt)
                    \\
                     ->  failed`,
    },
    {
      k: 'p',
      text: (
        <>
          Credits come off the balance when the project is created, not when it finishes. If the
          first turn ends with nothing usable, we refund it. Every prompt after the first is free.
          See <A to="/docs/polling">Polling projects</A>.
        </>
      ),
    },
    { k: 'h2', text: 'Start here' },
    {
      k: 'list',
      items: [
        <>
          <A to="/docs/getting-started">Getting started</A> makes your first video with curl.
        </>,
        <>
          <A to="/docs/mcp">AI agents (MCP)</A> connects Claude, Cursor, ChatGPT, or Perplexity.
        </>,
        <>
          <A to="/docs/api">REST API reference</A> lists every endpoint.
        </>,
      ],
    },
  ],
}

/* ── Getting started ───────────────────────────────────────────────────── */

const gettingStarted: DocPage = {
  slug: 'getting-started',
  title: 'Getting started',
  group: 'Guide',
  nav: 'Getting Started',
  lede: 'Create an API key, spend a credit, and get a video back. Four steps, about five minutes of waiting.',
  blocks: [
    { k: 'h2', text: '1. Create an API key' },
    {
      k: 'p',
      text: (
        <>
          Go to <A to="/api-keys">trypitch.co/api-keys</A> and press Create key. Pitch keys start
          with <C>pk_</C>.
        </>
      ),
    },
    {
      k: 'p',
      text: 'The full key is shown once. We store only its SHA-256 hash, so we cannot show it to you again or recover it. Copy it somewhere safe. If you lose it, revoke it and make a new one.',
    },
    {
      k: 'p',
      text: 'The key acts as the user who made it. Projects it creates belong to that user, show up in their app, and spend that user’s credits.',
    },
    { k: 'h2', text: '2. Check your credits' },
    {
      k: 'code',
      lang: 'bash',
      code: `curl ${BASE}/v1/credits \\
  -H "Authorization: Bearer pk_your_key"`,
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "balance": 42,
  "plan": "pro",
  "transactions": [ ... ]
}`,
    },
    {
      k: 'p',
      text: (
        <>
          A demo video costs 3 credits. If the balance is short, project creation fails with{' '}
          <C>402 insufficient_credits</C> and nothing is charged. Buy more at{' '}
          <A to="/pricing">trypitch.co/pricing</A>.
        </>
      ),
    },
    { k: 'h2', text: '3. Create a project' },
    {
      k: 'p',
      text: (
        <>
          Pick a <C>flow</C> and write the first prompt the way you would in the app: the URL and
          what you want. Instructions are free text. You do not need a script.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/projects \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "flow": "demo-video",
    "prompt": "https://trypitch.co — walk through sign-up and the first render. Keep it under 60 seconds."
  }'`,
    },
    {
      k: 'p',
      text: (
        <>
          It answers <C>202 Accepted</C> as soon as the agent has started.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "id": "cm4x8k2p90001abcd",
  "flow": "demo-video",
  "title": "trypitch.co",
  "status": "working",
  "busy": true,
  "prompt": "https://trypitch.co — walk through sign-up and the first render. Keep it under 60 seconds.",
  "options": {},
  "outputs": [],
  "thumbnailUrl": null,
  "shareUrl": null,
  "error": null,
  "createdAt": "2026-09-02T10:14:03.221Z",
  "updatedAt": "2026-09-02T10:14:03.221Z"
}`,
    },
    { k: 'h2', text: '4. Poll for the result' },
    {
      k: 'p',
      text: (
        <>
          Ask for the project every few seconds until <C>status</C> stops being <C>working</C>. Ten
          seconds is a good interval. Most videos land in a few minutes.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl ${BASE}/v1/projects/cm4x8k2p90001abcd \\
  -H "Authorization: Bearer pk_your_key"`,
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "id": "cm4x8k2p90001abcd",
  "flow": "demo-video",
  "title": "trypitch.co",
  "status": "ready",
  "busy": false,
  "outputs": [
    {
      "kind": "video",
      "url": "https://s3.trypitch.co/pitch/.../final.mp4",
      "createdAt": "2026-09-02T10:19:41.010Z"
    }
  ],
  "thumbnailUrl": "https://s3.trypitch.co/pitch/.../thumb.jpg",
  "shareUrl": null,
  "error": null,
  "scenes": [ ... ]
}`,
    },
    {
      k: 'p',
      text: (
        <>
          Download the <C>video</C> entry in <C>outputs</C> and you are done. A full polling loop
          with backoff is in <A to="/docs/polling">Polling projects</A>.
        </>
      ),
    },
    { k: 'h2', text: '5. Change something (optional)' },
    {
      k: 'p',
      text: 'The project is a conversation. Send another message and the same agent edits what it made. This is free, as many times as you like.',
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/projects/cm4x8k2p90001abcd/prompt \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "text": "Cut the intro shorter and slow the narration down a little." }'`,
    },
    {
      k: 'p',
      text: (
        <>
          <C>status</C> goes back to <C>working</C>. Poll again, and the newest entry in{' '}
          <C>outputs</C> is the new cut.
        </>
      ),
    },
    { k: 'h2', text: 'The same thing in Node' },
    {
      k: 'code',
      lang: 'javascript',
      code: `const KEY = process.env.PITCH_API_KEY
const api = (path, init) =>
  fetch("${BASE}" + path, {
    ...init,
    headers: {
      Authorization: \`Bearer \${KEY}\`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  }).then(async r => {
    const body = await r.json()
    if (!r.ok) throw new Error(body.error?.message ?? r.statusText)
    return body
  })

const project = await api("/v1/projects", {
  method: "POST",
  body: JSON.stringify({
    flow: "demo-video",
    prompt: "https://trypitch.co — walk through sign-up. Under 60 seconds.",
  }),
})

let state = project
while (state.status === "working") {
  await new Promise(r => setTimeout(r, 10_000))
  state = await api(\`/v1/projects/\${project.id}\`)
}

if (state.status !== "ready") throw new Error(state.error ?? state.status)
console.log(state.outputs.find(o => o.kind === "video")?.url)`,
    },
    { k: 'h2', text: 'Next' },
    {
      k: 'list',
      items: [
        <>
          Connect an agent instead of writing code: <A to="/docs/mcp">AI agents (MCP)</A>.
        </>,
        <>
          Every endpoint and field: <A to="/docs/api">REST API reference</A>.
        </>,
        <>
          What each failure means: <A to="/docs/errors">Errors</A>.
        </>,
      ],
    },
  ],
}

/* ── MCP ───────────────────────────────────────────────────────────────── */

const mcp: DocPage = {
  slug: 'mcp',
  title: 'AI agents (MCP)',
  group: 'Guide',
  nav: 'AI Agents (MCP)',
  lede: 'Connect Claude, Cursor, ChatGPT, or any MCP client to Pitch. The agent gets tools for starting projects, talking to them, and checking on them itself.',
  blocks: [
    {
      k: 'p',
      text: (
        <>
          The server speaks the{' '}
          <a href="https://modelcontextprotocol.io" target="_blank" rel="noreferrer">
            Model Context Protocol
          </a>{' '}
          over Streamable HTTP. It is listed on the official MCP registry as{' '}
          <C>co.trypitch/pitch</C>.
        </>
      ),
    },
    {
      k: 'table',
      head: ['', ''],
      rows: [
        ['Endpoint', <C key="e">{`POST ${BASE}/mcp`}</C>],
        ['Transport', 'Streamable HTTP, stateless'],
        ['Auth', <C key="a">Authorization: Bearer pk_...</C>],
        ['Registry name', <C key="r">co.trypitch/pitch</C>],
      ],
    },
    {
      k: 'note',
      text: (
        <>
          Stateless means every request stands alone. There is no session id and no server-sent
          stream to hold open. <C>GET</C> and <C>DELETE</C> on <C>/mcp</C> return{' '}
          <C>405 Method Not Allowed</C> on purpose.
        </>
      ),
    },
    { k: 'h2', text: 'Claude' },
    { k: 'p', text: 'From the command line:' },
    {
      k: 'code',
      lang: 'bash',
      code: `claude mcp add --transport http pitch \\
  ${BASE}/mcp \\
  --header "Authorization: Bearer pk_your_key"`,
    },
    {
      k: 'p',
      text: 'In claude.ai, go to Settings, then Connectors, then Add custom connector, and paste the endpoint with the same header.',
    },
    { k: 'h2', text: 'Cursor' },
    {
      k: 'p',
      text: (
        <>
          Open Settings, then MCP, then New server. Or edit <C>.cursor/mcp.json</C> directly.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "mcpServers": {
    "pitch": {
      "url": "${BASE}/mcp",
      "headers": { "Authorization": "Bearer pk_your_key" }
    }
  }
}`,
    },
    { k: 'h2', text: 'ChatGPT' },
    {
      k: 'p',
      text: 'Settings, then Connectors, then Advanced, then Developer mode, then Add. Paste the endpoint and add a custom header.',
    },
    {
      k: 'code',
      lang: 'text',
      code: `URL     ${BASE}/mcp
Header  Authorization: Bearer pk_your_key`,
    },
    { k: 'p', text: 'The same connector works from the Responses and Agents APIs.' },
    { k: 'h2', text: 'Perplexity' },
    {
      k: 'p',
      text: 'Settings, then Connectors, then Add connector, then Custom (MCP). Paste the endpoint and set the auth header. The same setup works in Comet and the Perplexity API.',
    },
    { k: 'h2', text: 'Any other client' },
    {
      k: 'p',
      text: 'If a client speaks Streamable HTTP and lets you set a header, it works. There is nothing Pitch-specific to install.',
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/mcp \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'`,
    },
    {
      k: 'note',
      text: (
        <>
          Most clients need the <C>Accept</C> header to include both <C>application/json</C> and{' '}
          <C>text/event-stream</C>. The MCP SDK sets this for you.
        </>
      ),
    },
    { k: 'h2', text: 'What the agent can do' },
    {
      k: 'p',
      text: (
        <>
          Six tools. One spends credits and starts a project, one talks to a project for free, four
          are free reads. Full argument lists are in <A to="/docs/tools">MCP tools</A>.
        </>
      ),
    },
    {
      k: 'table',
      head: ['Tool', 'Credits'],
      rows: [
        [<C key="1">create_project</C>, '1 to 13, by flow'],
        [<C key="2">prompt_project</C>, 'free'],
        [<C key="3">get_project</C>, 'free'],
        [<C key="4">list_projects</C>, 'free'],
        [<C key="5">get_credits</C>, 'free'],
        [<C key="6">get_pricing</C>, 'free'],
      ],
    },
    { k: 'h2', text: 'Telling the agent how to behave' },
    {
      k: 'p',
      text: (
        <>
          Agents tend to call <C>create_project</C> and then stop, because the project is not
          finished yet. Put something like this in your system prompt or project instructions.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'text',
      code: `When you use Pitch:
- Call get_credits before create_project so you know the project can pay for itself.
- create_project returns a project with status "working". The video is not ready at that point.
- Poll get_project every 10 seconds until status is "ready" or "failed".
- On "ready", give the user the url of the newest entry in outputs (kind "video" or "pdf").
- On "failed", read the error field and say what went wrong.
- To change something, call prompt_project on the same project. It is free. Never create a second project for an edit.
- Never call create_project twice for the same request.`,
    },
    {
      k: 'note',
      text: (
        <>
          That last line matters. <C>create_project</C> spends credits at once, so a retried call is
          a second charge, not a resumed project. Edits go through <C>prompt_project</C>, which is
          free.
        </>
      ),
    },
  ],
}

/* ── Authentication ────────────────────────────────────────────────────── */

const authentication: DocPage = {
  slug: 'authentication',
  title: 'Authentication',
  group: 'Guide',
  nav: 'Authentication',
  lede: 'One API key for both MCP and REST. It is a bearer token, so treat it like a password.',
  blocks: [
    { k: 'h2', text: 'Getting a key' },
    {
      k: 'p',
      text: (
        <>
          Sign in and open <A to="/api-keys">trypitch.co/api-keys</A>. Press Create key, give it a
          name, and copy the value. Keys look like <C>pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</C>.
        </>
      ),
    },
    {
      k: 'p',
      text: 'We store a SHA-256 hash of the key and the first 12 characters, nothing else. That prefix is what you see in the list, so you can tell keys apart without us keeping the secret.',
    },
    { k: 'h2', text: 'Sending it' },
    { k: 'p', text: 'Use a bearer token. This is the form to prefer everywhere.' },
    { k: 'code', lang: 'bash', code: `Authorization: Bearer pk_your_key` },
    {
      k: 'p',
      text: 'Some MCP clients only let you set a plain header with a plain value. For those, this also works:',
    },
    { k: 'code', lang: 'bash', code: `X-API-Key: pk_your_key` },
    {
      k: 'p',
      text: (
        <>
          The two are equivalent. If both are present, <C>Authorization</C> wins.
        </>
      ),
    },
    { k: 'h2', text: 'What a key can do' },
    {
      k: 'p',
      text: 'A key acts as the user who created it. There are no scopes and no per-key limits yet. Anything that user can do in the app, the key can do through the API, and every credit it spends lands in that user’s ledger next to their browser usage. Projects created with a key appear in that user’s app, and vice versa.',
    },
    {
      k: 'note',
      text: (
        <>
          A brand-new account has to finish onboarding in the app once before a key can create
          projects. Until then creation returns <C>428 onboarding_required</C>.
        </>
      ),
    },
    { k: 'h2', text: 'Revoking' },
    {
      k: 'p',
      text: (
        <>
          Press Revoke on <A to="/api-keys">the keys page</A>. It takes effect on the next request.
          Revoked keys stay in the list so you can see what was in use and when it was last used.
        </>
      ),
    },
    {
      k: 'p',
      text: 'Projects already working under a revoked key keep working. Revoking stops new requests, it does not cancel work in flight.',
    },
    { k: 'h2', text: 'Keeping keys safe' },
    {
      k: 'list',
      items: [
        'Put keys in environment variables, never in source control.',
        'Never ship a key to a browser or a mobile app. Anyone can read it there. Call Pitch from your server.',
        'Use one key per system, so you can revoke one without breaking the rest.',
        'Rotate by making the new key first, switching over, then revoking the old one.',
      ],
    },
    { k: 'h2', text: 'When auth fails' },
    {
      k: 'p',
      text: (
        <>
          A missing, unknown, or revoked key returns <C>401</C> on both surfaces.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{ "error": { "code": "unauthorized", "message": "Invalid or revoked API key" } }`,
    },
    {
      k: 'p',
      text: (
        <>
          There is no way to tell those three cases apart from the response, on purpose. Check for a
          typo, a stray newline from a copy and paste, and whether the key is still active on the
          keys page.
        </>
      ),
    },
  ],
}

/* ── Credits ───────────────────────────────────────────────────────────── */

const credits: DocPage = {
  slug: 'credits',
  title: 'Credits',
  group: 'Guide',
  nav: 'Credits',
  lede: 'Every project costs credits once, when it is created. Every prompt after the first is free.',
  blocks: [
    { k: 'h2', text: 'What things cost' },
    {
      k: 'p',
      text: (
        <>
          Both surfaces create projects the same way: <C>POST /v1/projects</C> over REST,{' '}
          <C>create_project</C> over MCP. The <C>flow</C> sets the price.
        </>
      ),
    },
    {
      k: 'table',
      head: ['Flow', 'What it makes', 'Credits'],
      rows: [
        [<C key="a">demo-video</C>, 'Narrated demo of your live product', '3'],
        [<C key="b">launch-video</C>, 'Cinematic launch film', '6 to 13'],
        [<C key="c">deck</C>, 'Slide deck from a topic', '1'],
        [
          <>
            <C>deck</C> with an upload and <C>options.mode</C>
          </>,
          'Redesign of a PDF or PPTX',
          '2',
        ],
        [<C key="e">recording-edit</C>, 'Cut of a screen recording', '2'],
        [
          <>
            <C>POST /v1/projects/:id/prompt</C> / <C>prompt_project</C>
          </>,
          'Any follow-up: edits, changes, re-renders',
          'free',
        ],
        [
          <>
            <C>GET /v1/*</C> / <C>get_*</C>, <C>list_*</C>
          </>,
          'Any read',
          'free',
        ],
      ],
    },
    { k: 'h2', text: 'Launch video pricing' },
    {
      k: 'p',
      text: 'Launch videos are the one variable price. The resolution sets the base, and narration adds one credit on top, because a narrated film needs a script and a voiceover clip per scene.',
    },
    {
      k: 'table',
      head: ['Resolution', 'Narrated (default)', 'Music only'],
      rows: [
        ['720p', '6', '5'],
        ['1080p (default)', '9', '8'],
        ['4K', '13', '12'],
      ],
    },
    {
      k: 'p',
      text: (
        <>
          If you send no <C>options.resolution</C>, you get 1080p and pay 9. An unrecognised value
          also falls back to 1080p rather than the cheapest tier, so a typo can never underpay.
          Exporting at a higher resolution later, from the app, charges only the difference.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'bash',
      code: `# a 6-credit launch video instead of the 9-credit default
curl -X POST ${BASE}/v1/projects \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "flow": "launch-video",
    "prompt": "https://acme.com — 60 second launch film for an AI notetaker. Confident, fast.",
    "options": { "resolution": "720p" }
  }'`,
    },
    { k: 'h2', text: 'Reading the balance' },
    {
      k: 'code',
      lang: 'bash',
      code: `curl ${BASE}/v1/credits -H "Authorization: Bearer pk_your_key"`,
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "balance": 42,
  "plan": "pro",
  "transactions": [
    { "amount": -3, "reason": "Demo video (trypitch.co)", "projectId": "cm4x...", "createdAt": "..." },
    { "amount": 50, "reason": "Subscription renewal", "createdAt": "..." }
  ]
}`,
    },
    {
      k: 'p',
      text: (
        <>
          The balance is the sum of the ledger, not a stored counter. <C>transactions</C> returns
          the 20 most recent entries, newest first. Negative amounts are spend, positive are top-ups
          and refunds.
        </>
      ),
    },
    { k: 'h2', text: 'Checking a price first' },
    {
      k: 'p',
      text: 'If you want to budget without hardcoding numbers, ask.',
    },
    { k: 'code', lang: 'bash', code: `curl ${BASE}/v1/pricing` },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "flows": [
    { "id": "launch-video",   "title": "Launch video",   "credits": 9 },
    { "id": "demo-video",     "title": "Demo video",     "credits": 3 },
    { "id": "deck",           "title": "Slide deck",     "credits": 1 },
    { "id": "recording-edit", "title": "Recording edit", "credits": 2 }
  ],
  "launchVideo": {
    "tiers": [
      { "res": "720p",  "credits": 5,  "narrated": 6 },
      { "res": "1080p", "credits": 8,  "narrated": 9 },
      { "res": "4k",    "credits": 12, "narrated": 13 }
    ]
  },
  "deck": { "generate": 1, "enhance": 2 },
  "edits": "Every prompt after the first is free."
}`,
    },
    {
      k: 'p',
      text: (
        <>
          This endpoint needs no key. Over MCP the same payload comes back from <C>get_pricing</C>.
        </>
      ),
    },
    { k: 'h2', text: 'When you run out' },
    {
      k: 'p',
      text: (
        <>
          We check the balance before creating anything. If it is short, the request fails with{' '}
          <C>402</C>, no project is made, and nothing is charged.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "error": {
    "code": "insufficient_credits",
    "message": "Not enough credits. Balance is 2. Buy more at https://trypitch.co/pricing.",
    "balance": 2
  }
}`,
    },
    {
      k: 'p',
      text: (
        <>
          Over MCP the same case comes back as a tool error whose text carries the balance, so the
          agent can tell the user how short they are.
        </>
      ),
    },
    { k: 'h2', text: 'Refunds' },
    {
      k: 'p',
      text: 'Credits come off as soon as the project row is written. If the agent’s first turn ends with nothing usable, whether it failed, was stopped, or finished empty, we mark the project failed and put the exact amount back, so a bad first run never silently eats credits.',
    },
    {
      k: 'p',
      text: 'Follow-up prompts are free, so there is nothing to refund on them. Email support@trypitch.co if a project failed for a reason on our side and was not refunded.',
    },
    { k: 'p', text: 'Credits never expire.' },
  ],
}

/* ── Files ─────────────────────────────────────────────────────────────── */

const files: DocPage = {
  slug: 'files',
  title: 'Files and uploads',
  group: 'Guide',
  nav: 'Files & Uploads',
  lede: 'Three flows take files you already have. Send them base64-encoded in the JSON body, as entries in uploads.',
  blocks: [
    {
      k: 'p',
      text: (
        <>
          There is no separate upload step and no multipart form. You put the bytes in the request,
          in an <C>uploads</C> array of <C>{`{ fileBase64, fileName }`}</C> objects. This keeps MCP
          and REST identical, since an MCP tool call cannot carry a multipart body.
        </>
      ),
    },
    { k: 'h2', text: 'Limits' },
    {
      k: 'table',
      head: ['Flow', 'What the file is', 'Max size', 'Accepted'],
      rows: [
        [
          <C key="a">deck</C>,
          <>
            One deck to redesign. Set <C>options.mode</C> to make it an enhance
          </>,
          '50 MB',
          <C key="b">.pdf .pptx</C>,
        ],
        [
          <C key="c">recording-edit</C>,
          'The recording to cut. Required',
          '500 MB',
          <C key="d">.mp4 .webm .mov .mkv .avi</C>,
        ],
        [
          <C key="e">demo-video</C>,
          'Optional assets the agent turns into a slideshow',
          '50 MB each',
          <C key="f">.pdf .png .jpg .jpeg .webp</C>,
        ],
      ],
    },
    {
      k: 'note',
      text: (
        <>
          Sizes are measured after decoding. Base64 is about a third larger than the raw file, so a
          500 MB video is roughly a 667 MB request body. The type is read from the extension in{' '}
          <C>fileName</C>, not from the bytes.
        </>
      ),
    },
    { k: 'h2', text: 'Sending a file' },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/projects \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d "$(jq -n \\
    --arg f "$(base64 -w0 deck.pdf)" \\
    '{ flow: "deck",
       prompt: "Modernise it, keep the story",
       options: { mode: "recreate" },
       uploads: [{ fileBase64: $f, fileName: "deck.pdf" }] }')"`,
    },
    {
      k: 'code',
      lang: 'javascript',
      code: `import { readFile } from "node:fs/promises"

const file = await readFile("recording.mp4")

const res = await fetch("${BASE}/v1/projects", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.PITCH_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    flow: "recording-edit",
    prompt: "Cut the dead air at the start. Add intro and outro cards.",
    options: { productName: "Acme", productUrl: "https://acme.com" },
    uploads: [{ fileBase64: file.toString("base64"), fileName: "recording.mp4" }],
  }),
})`,
    },
    {
      k: 'p',
      text: (
        <>
          When you send an upload, <C>prompt</C> may be empty. Otherwise it is required.
        </>
      ),
    },
    { k: 'h2', text: 'What happens to your file' },
    {
      k: 'p',
      text: 'We decode it to a temp file, check the extension and size, upload it to object storage, and delete the temp copy. The stored copy is what the agent reads into the project workspace. Output files live in the same bucket and are served over HTTPS.',
    },
    { k: 'h2', text: 'Assets for a demo video' },
    {
      k: 'p',
      text: (
        <>
          For <C>demo-video</C>, uploads are optional extras: PDFs or images the agent prepares into
          a slideshow and cuts between the live browser and the slides. Mention in the prompt what
          they are for.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "flow": "demo-video",
  "prompt": "https://trypitch.co — open with the pricing one-pager, then show sign-up.",
  "uploads": [{ "fileBase64": "...", "fileName": "pricing.pdf" }]
}`,
    },
    { k: 'h2', text: 'Errors' },
    {
      k: 'table',
      head: ['Status', 'Code', 'Cause'],
      rows: [
        [
          '413',
          <C key="a">payload_too_large</C>,
          'The decoded file is over the limit for that flow',
        ],
        [
          '415',
          <C key="b">unsupported_media_type</C>,
          'The extension is not in the accepted list for that flow',
        ],
        ['400', <C key="c">invalid_request</C>, 'The base64 decoded to nothing'],
      ],
    },
  ],
}

/* ── Polling ───────────────────────────────────────────────────────────── */

const polling: DocPage = {
  slug: 'polling',
  title: 'Polling projects',
  group: 'Guide',
  nav: 'Polling Projects',
  lede: 'Creating a project returns immediately. The agent takes minutes. Here is how to wait for it well.',
  blocks: [
    { k: 'h2', text: 'Statuses' },
    {
      k: 'p',
      text: (
        <>
          <C>status</C> is derived from what the agent is doing and what is in the workspace, never
          stored, so it is always current.
        </>
      ),
    },
    {
      k: 'table',
      head: ['Status', 'Meaning', 'Keep polling?'],
      rows: [
        [
          <C key="a">working</C>,
          'The agent has a turn in flight: the first build, or a follow-up prompt',
          'Yes',
        ],
        [
          <C key="b">ready</C>,
          <>
            There is something to show. <C>outputs</C> holds the deliverables
          </>,
          'No',
        ],
        [
          <C key="c">failed</C>,
          <>
            The last turn produced nothing. <C>error</C> says what went wrong
          </>,
          'No',
        ],
        [
          <C key="d">empty</C>,
          'Nothing in the workspace and no error. Rare; treat it like failed',
          'No',
        ],
      ],
    },
    {
      k: 'note',
      text: (
        <>
          <C>busy</C> is the same fact as <C>status === "working"</C>, as a boolean. A follow-up
          prompt sent while <C>busy</C> is true is refused with <C>409 busy</C>; wait for the turn
          to end and send it again.
        </>
      ),
    },
    { k: 'h2', text: 'How often' },
    {
      k: 'p',
      text: 'Every 10 seconds is right. Faster does not make the agent faster. Demo videos and decks usually finish in a few minutes, launch videos take longer because they run a full recon, script, build, and mix pass.',
    },
    { k: 'h2', text: 'A loop that handles every case' },
    {
      k: 'code',
      lang: 'javascript',
      code: `const TERMINAL = ["ready", "failed", "empty"]

async function waitFor(projectId, { intervalMs = 10_000, timeoutMs = 30 * 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await fetch(\`${BASE}/v1/projects/\${projectId}\`, {
      headers: { Authorization: \`Bearer \${process.env.PITCH_API_KEY}\` },
    })

    // Transient. Wait and try again rather than giving up on the project.
    if (res.status >= 500) {
      await sleep(intervalMs)
      continue
    }
    if (!res.ok) throw new Error((await res.json()).error.message)

    const project = await res.json()
    if (TERMINAL.includes(project.status)) return project

    await sleep(intervalMs)
  }

  throw new Error(\`Project \${projectId} did not finish in time\`)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const project = await waitFor("cm4x8k2p90001abcd")
if (project.status !== "ready") throw new Error(project.error ?? project.status)
const latest = project.outputs.find(o => o.kind === "video" || o.kind === "pdf")
console.log(latest.url)`,
    },
    { k: 'h2', text: 'Where the result lands' },
    {
      k: 'p',
      text: (
        <>
          <C>outputs</C> is an array, newest first. Each entry is{' '}
          <C>{`{ kind, url, res?, label?, createdAt }`}</C>. A project that has been edited a few
          times keeps every render, so take the first entry of the kind you want.
        </>
      ),
    },
    {
      k: 'table',
      head: ['Flow', 'Output kinds', 'Also on the project'],
      rows: [
        [
          <C key="a">demo-video</C>,
          <>
            <C>video</C> (final), <C>video</C> with <C>label: "raw"</C> (the uncut recording)
          </>,
          <C key="b">scenes</C>,
        ],
        [
          <C key="c">deck</C>,
          <>
            <C>pdf</C>, <C>html</C>
          </>,
          <C key="d">slides</C>,
        ],
        [<C key="e">recording-edit</C>, <C key="f">video</C>, <C key="g">scenes</C>],
        [
          <C key="h">launch-video</C>,
          <>
            <C>video</C> with <C>res</C>, once exported from the app
          </>,
          <C key="i">scenes</C>,
        ],
      ],
    },
    {
      k: 'note',
      text: (
        <>
          A launch video is <C>ready</C> as soon as the film plays in the studio, with <C>scenes</C>{' '}
          filled in. The MP4 itself is rendered by the Export button in the app at the resolution
          you paid for, and lands in <C>outputs</C> when that finishes. There is no export endpoint
          in the API yet.
        </>
      ),
    },
    {
      k: 'p',
      text: (
        <>
          Videos also get a <C>thumbnailUrl</C>. <C>shareUrl</C> is set only if someone turned on
          sharing for that project in the app.
        </>
      ),
    },
    { k: 'h2', text: 'Following up' },
    {
      k: 'p',
      text: 'Once a project is ready you can send the agent another message. It edits in place and the new render is added to outputs. This is how you fix a scene, change the voice, tighten the cut, or ask for a different take. It costs nothing.',
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/projects/cm4x8k2p90001abcd/prompt \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "text": "Swap the music for something calmer and drop scene 3.", "scene": "s3" }'`,
    },
    {
      k: 'p',
      text: (
        <>
          <C>scene</C> (an id from <C>scenes</C>) and <C>slide</C> (a 1-based index) are optional
          and tell the agent what you are pointing at, the way clicking a scene in the app does. The
          response is the project with <C>status: "working"</C>; poll as before.
        </>
      ),
    },
    { k: 'h2', text: 'Listing projects' },
    {
      k: 'p',
      text: 'If you lost an id, list them. Newest first.',
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl "${BASE}/v1/projects?flow=demo-video&limit=10" \\
  -H "Authorization: Bearer pk_your_key"`,
    },
    { k: 'h2', text: 'Scenes and slides' },
    {
      k: 'p',
      text: (
        <>
          Video flows expose <C>scenes</C> from the live workspace; decks expose <C>slides</C>. They
          are more useful than a percentage: you can see how far the agent got, and you can target a
          follow-up prompt at one of them.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "id": "cm4x8k2p90001abcd",
  "flow": "launch-video",
  "status": "ready",
  "scenes": [
    { "id": "s1", "index": 1, "start": 0, "end": 6.2, "dur": 6.2, "label": "Meet Acme", "type": "hero" }
  ],
  "outputs": []
}`,
    },
  ],
}

/* ── Errors ────────────────────────────────────────────────────────────── */

const errors: DocPage = {
  slug: 'errors',
  title: 'Errors',
  group: 'Guide',
  nav: 'Errors',
  lede: 'Every REST failure has the same shape and a stable code. Match on the code, not the message.',
  blocks: [
    {
      k: 'code',
      lang: 'json',
      code: `{
  "error": {
    "code": "insufficient_credits",
    "message": "Not enough credits. Balance is 2. Buy more at https://trypitch.co/pricing.",
    "balance": 2
  }
}`,
    },
    {
      k: 'p',
      text: (
        <>
          <C>code</C> and <C>message</C> are always present. Some codes add a field, like{' '}
          <C>balance</C> above. Messages are written for people and may change. Codes will not.
        </>
      ),
    },
    { k: 'h2', text: 'Codes' },
    {
      k: 'table',
      head: ['Status', 'Code', 'What happened', 'What to do'],
      rows: [
        [
          '400',
          <C key="a">invalid_request</C>,
          'A field is missing, the wrong type, or out of range. The message names the field.',
          'Fix the body. Retrying will not help.',
        ],
        [
          '401',
          <C key="b">unauthorized</C>,
          'The key is missing, unknown, or revoked.',
          'Check the header and the keys page.',
        ],
        [
          '402',
          <C key="c">insufficient_credits</C>,
          'The balance cannot cover the project. Nothing was created or charged.',
          'Top up, then retry the same request.',
        ],
        [
          '404',
          <C key="d">not_found</C>,
          'No project with that id, or it belongs to someone else.',
          'Check the id. We do not distinguish the two cases.',
        ],
        [
          '409',
          <C key="e">busy</C>,
          'You sent a prompt while the agent was still on the previous one.',
          'Poll until status is no longer working, then send it again.',
        ],
        [
          '413',
          <C key="f">payload_too_large</C>,
          'The decoded file is over the limit.',
          'Compress or trim the file.',
        ],
        [
          '415',
          <C key="g">unsupported_media_type</C>,
          'The extension is not accepted for that flow.',
          'Convert it first.',
        ],
        [
          '428',
          <C key="h">onboarding_required</C>,
          'The account has never finished onboarding in the app.',
          'Sign in at trypitch.co once and complete it.',
        ],
        [
          '500',
          <C key="i">internal_error</C>,
          'Something broke on our side.',
          'Retry with backoff. If it persists, email support.',
        ],
      ],
    },
    { k: 'h2', text: 'What is safe to retry' },
    {
      k: 'p',
      text: 'There are no idempotency keys yet, so a retried create is a second project and a second charge. Retry creates only when you never got a response at all, and check the project list first. Prompts are free, so retrying one costs nothing but may queue the same edit twice.',
    },
    {
      k: 'table',
      head: ['Case', 'Retry?'],
      rows: [
        [<C key="a">GET</C>, 'Yes, always safe'],
        ['400, 401, 402, 404, 413, 415, 428', 'No, fix the cause first'],
        ['409 on a prompt', 'Yes, after the current turn ends'],
        ['500 on a read', 'Yes, with backoff'],
        [
          '500 on a create',
          <>
            Check <C>GET /v1/projects</C> first. The project may exist.
          </>,
        ],
        ['No response, timeout', 'Same. List projects before firing again.'],
      ],
    },
    { k: 'h2', text: 'Project failure is not an HTTP error' },
    {
      k: 'p',
      text: (
        <>
          A project whose agent fails still returns <C>200</C>. The failure is in the body.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "id": "cm4x8k2p90001abcd",
  "status": "failed",
  "error": "The agent finished without producing anything",
  "outputs": []
}`,
    },
    {
      k: 'p',
      text: 'Common causes: the URL is behind a login, blocked our browser, or was down. Sites that need a sign-in cannot be demoed from a public URL alone. A failed first turn is refunded; you can also send a follow-up prompt to have the agent try again in the same project.',
    },
    { k: 'h2', text: 'Errors over MCP' },
    {
      k: 'p',
      text: (
        <>
          MCP has no status codes. A failed tool call returns a normal result with{' '}
          <C>isError: true</C> and the message as text, so the agent can read it and react. An
          insufficient-credits error carries the balance in the same string.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Insufficient credits: your current balance is 2. Buy more at https://trypitch.co/pricing, then retry."
    }
  ]
}`,
    },
    {
      k: 'p',
      text: (
        <>
          A bad key is the exception. That fails before MCP is reached, so the client sees a plain{' '}
          <C>401</C> and usually reports the server as unreachable.
        </>
      ),
    },
  ],
}

/* ── REST reference ────────────────────────────────────────────────────── */

const restApi: DocPage = {
  slug: 'api',
  title: 'REST API',
  group: 'Reference',
  nav: 'REST API',
  lede: 'Every endpoint, every field. Projects are the resource.',
  blocks: [
    {
      k: 'table',
      head: ['', ''],
      rows: [
        ['Base URL', <C key="a">{BASE}</C>],
        ['Auth', <C key="b">Authorization: Bearer pk_...</C>],
        ['Content type', <C key="c">application/json</C>],
        [
          'Create and prompt response',
          <>
            <C>202 Accepted</C> with a project object
          </>,
        ],
      ],
    },
    { k: 'h2', text: 'The project object' },
    {
      k: 'p',
      text: 'Every endpoint that touches a project returns this shape.',
    },
    {
      k: 'table',
      head: ['Field', 'Type', 'Notes'],
      rows: [
        [<C key="a">id</C>, 'string', 'Use it to poll and to prompt'],
        [
          <C key="b">flow</C>,
          'string',
          <>
            <C>launch-video</C>, <C>demo-video</C>, <C>deck</C>, <C>recording-edit</C>
          </>,
        ],
        [<C key="c">title</C>, 'string', 'Derived from the prompt, URL, topic, or file name'],
        [
          <C key="d">status</C>,
          'string',
          <>
            <C>working</C>, <C>ready</C>, <C>failed</C>, <C>empty</C>
          </>,
        ],
        [
          <C key="e">busy</C>,
          'boolean',
          <>
            True while <C>status</C> is <C>working</C>
          </>,
        ],
        [<C key="f">prompt</C>, 'string', 'The first message'],
        [<C key="g">options</C>, 'object', 'The flow options given at creation'],
        [
          <C key="h">outputs</C>,
          'array',
          <>
            Newest first. <C>kind</C> (<C>video</C>, <C>pdf</C>, <C>html</C>, <C>thumbnail</C>),{' '}
            <C>url</C>, <C>res?</C>, <C>label?</C>, <C>createdAt</C>
          </>,
        ],
        [<C key="i">thumbnailUrl</C>, 'string | null', 'Poster frame for videos'],
        [<C key="j">shareUrl</C>, 'string | null', 'Only if sharing was turned on in the app'],
        [
          <C key="k">error</C>,
          'string | null',
          <>
            Set when <C>status</C> is <C>failed</C>
          </>,
        ],
        [
          <C key="l">scenes</C>,
          'array?',
          <>
            Video flows. <C>id</C>, <C>index</C>, <C>start</C>, <C>end</C>, <C>dur</C>,{' '}
            <C>label?</C>, <C>type?</C>
          </>,
        ],
        [
          <C key="m">slides</C>,
          'array?',
          <>
            Decks. <C>index</C>, <C>title?</C>
          </>,
        ],
        [<C key="n">createdAt</C>, 'string', 'ISO 8601'],
        [<C key="o">updatedAt</C>, 'string', 'ISO 8601'],
      ],
    },
    {
      k: 'note',
      text: (
        <>
          <C>scenes</C> and <C>slides</C> are read from the live workspace and come back only on{' '}
          <C>GET /v1/projects/:id</C>, creation, and prompt responses, not on the list.
        </>
      ),
    },
    { k: 'h2', text: 'POST /v1/projects' },
    {
      k: 'p',
      text: 'Create a project and send its first prompt. Charges the flow’s price at once.',
    },
    {
      k: 'table',
      head: ['Field', 'Type', 'Required', 'Notes'],
      rows: [
        [
          <C key="a">flow</C>,
          'string',
          'yes',
          <>
            <C>launch-video</C>, <C>demo-video</C>, <C>deck</C>, <C>recording-edit</C>
          </>,
        ],
        [
          <C key="b">prompt</C>,
          'string',
          'unless uploads',
          'What to make: the product URL and brief, the topic, the instructions',
        ],
        [<C key="c">options</C>, 'object', 'no', 'Flow options, below'],
        [
          <C key="d">uploads</C>,
          'array',
          'no',
          <>
            <C>{`{ fileBase64, fileName }`}</C> entries. See <A to="/docs/files">Files</A>
          </>,
        ],
        [
          <C key="e">name</C>,
          'string',
          'no',
          <>
            Workspace slug, unique per flow. Made from the title if omitted. No <C>/</C> or <C>\</C>
            , cannot start with a dot
          </>,
        ],
      ],
    },
    { k: 'h3', text: 'Options by flow' },
    {
      k: 'table',
      head: ['Flow', 'Credits', 'Options'],
      rows: [
        [
          <C key="a">launch-video</C>,
          '6 to 13',
          <>
            <C>resolution</C> (<C>720p</C>, <C>1080p</C> default, <C>4k</C>; sets the price),{' '}
            <C>narration</C> (default true; false saves 1 credit), <C>music</C> (track filename from
            the shared library)
          </>,
        ],
        [
          <C key="b">demo-video</C>,
          '3',
          <>
            <C>url</C> (also read from the prompt), <C>instructions</C>, <C>script</C> (your own
            narration), <C>voice</C>, <C>background</C>, <C>shape</C>, <C>inset</C>,{' '}
            <C>browserHeader</C>
          </>,
        ],
        [
          <C key="c">deck</C>,
          '1, or 2 with an upload',
          <>
            <C>topic</C>, <C>slideCount</C>, <C>headings</C>, <C>template</C>, <C>mode</C> (
            <C>recreate</C> rebuilds an uploaded deck, <C>preserve</C> keeps its layout; setting it
            makes the project an enhance)
          </>,
        ],
        [
          <C key="d">recording-edit</C>,
          '2',
          <>
            <C>productName</C> (intro card), <C>productUrl</C> (outro card), <C>instructions</C>
          </>,
        ],
      ],
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/projects \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "flow": "launch-video",
    "prompt": "https://acme.com — 60 second launch film for an AI notetaker. Confident, fast.",
    "options": { "resolution": "1080p", "narration": true }
  }'`,
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/projects \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "flow": "deck",
    "prompt": "Seed round deck for an AI video startup",
    "options": { "slideCount": 10 }
  }'`,
    },
    {
      k: 'p',
      text: (
        <>
          Returns <C>202</C> with the project, <C>status: "working"</C>. Fails with <C>402</C> if
          the balance is short, <C>428</C> if the account never finished onboarding, <C>413</C> or{' '}
          <C>415</C> for a bad upload.
        </>
      ),
    },
    { k: 'h2', text: 'GET /v1/projects' },
    { k: 'p', text: 'List your projects, newest first. Free.' },
    {
      k: 'table',
      head: ['Query', 'Notes'],
      rows: [
        [
          <C key="a">flow</C>,
          <>
            One of <C>launch-video</C>, <C>demo-video</C>, <C>deck</C>, <C>recording-edit</C>
          </>,
        ],
        [<C key="b">limit</C>, 'Default 50, max 100'],
      ],
    },
    {
      k: 'code',
      lang: 'json',
      code: `{ "data": [ { "id": "cm4x...", "flow": "demo-video", "status": "ready", "outputs": [ ... ], ... } ], "total": 37 }`,
    },
    { k: 'h2', text: 'GET /v1/projects/:id' },
    {
      k: 'p',
      text: (
        <>
          One project, with <C>scenes</C> or <C>slides</C>. Returns <C>404</C> if it does not exist
          or is not yours. Free. This is what you poll.
        </>
      ),
    },
    { k: 'h2', text: 'POST /v1/projects/:id/prompt' },
    {
      k: 'p',
      text: 'Send the agent a follow-up. Free. The agent works asynchronously; poll the project.',
    },
    {
      k: 'table',
      head: ['Field', 'Type', 'Required', 'Notes'],
      rows: [
        [<C key="a">text</C>, 'string', 'yes', 'What to change'],
        [
          <C key="b">scene</C>,
          'string',
          'no',
          <>
            A scene id from <C>scenes</C>, to scope the request
          </>,
        ],
        [<C key="c">slide</C>, 'number', 'no', 'A 1-based slide index, for decks'],
      ],
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/projects/cm4x8k2p90001abcd/prompt \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "text": "Make slide 4 a two-column comparison.", "slide": 4 }'`,
    },
    {
      k: 'p',
      text: (
        <>
          Returns <C>202</C> with the project. Returns <C>409 busy</C> if the agent is still on the
          previous turn.
        </>
      ),
    },
    { k: 'h2', text: 'GET /v1/credits' },
    {
      k: 'p',
      text: (
        <>
          Balance, plan, and the 20 most recent ledger entries. Free. See{' '}
          <A to="/docs/credits">Credits</A>.
        </>
      ),
    },
    { k: 'h2', text: 'GET /v1/pricing' },
    {
      k: 'p',
      text: (
        <>
          Current credit prices per flow, launch video tiers, and deck generate versus enhance. No
          key needed. The payload is in <A to="/docs/credits">Credits</A>.
        </>
      ),
    },
    { k: 'h2', text: 'Not there yet' },
    {
      k: 'p',
      text: 'Being straight about the edges: there are no webhooks, so you have to poll. There are no idempotency keys, so a retried create is a second charge. There is no cursor pagination on the project list, only a limit. There is no way to stop, delete, share, or export a project through the API; a launch video’s MP4 is rendered from the Export button in the app. Email support@trypitch.co if you need one of these and we will prioritise it.',
    },
  ],
}

/* ── MCP tools reference ───────────────────────────────────────────────── */

const tools: DocPage = {
  slug: 'tools',
  title: 'MCP tools',
  group: 'Reference',
  nav: 'MCP Tools',
  lede: 'The six tools an agent gets, and what each one takes.',
  blocks: [
    {
      k: 'p',
      text: (
        <>
          Every tool returns a JSON string in a text block. <C>create_project</C>,{' '}
          <C>prompt_project</C> and <C>get_project</C> return the project object described in the{' '}
          <A to="/docs/api">REST reference</A>. On failure the result has <C>isError: true</C>. See{' '}
          <A to="/docs/errors">Errors</A>.
        </>
      ),
    },
    { k: 'h2', text: 'create_project' },
    {
      k: 'p',
      text: 'Start a project and send its first prompt. Charges the flow’s price: demo-video 3, launch-video 6 to 13, deck 1 (2 with an upload), recording-edit 2.',
    },
    {
      k: 'table',
      head: ['Argument', 'Type', 'Required', 'Notes'],
      rows: [
        [
          <C key="a">flow</C>,
          'string',
          'yes',
          <>
            <C>launch-video</C>, <C>demo-video</C>, <C>deck</C>, <C>recording-edit</C>
          </>,
        ],
        [
          <C key="b">prompt</C>,
          'string',
          'yes',
          'The product URL and brief, the topic, the instructions',
        ],
        [
          <C key="c">options</C>,
          'object',
          'no',
          <>
            launch-video <C>{`{ resolution, narration, music }`}</C>; demo-video{' '}
            <C>{`{ url, voice, script, background, shape, browserHeader }`}</C>; deck{' '}
            <C>{`{ slideCount, template, mode }`}</C>; recording-edit{' '}
            <C>{`{ productName, productUrl }`}</C>
          </>,
        ],
        [
          <C key="d">uploads</C>,
          'array',
          'no',
          <>
            <C>{`{ fileBase64, fileName }`}</C> entries: PDFs or images for demo-video, a PDF or
            PPTX for deck, the video for recording-edit
          </>,
        ],
      ],
    },
    {
      k: 'p',
      text: (
        <>
          Returns the project with <C>status: "working"</C>. The output is not ready at that point;
          poll <C>get_project</C>.
        </>
      ),
    },
    { k: 'h2', text: 'prompt_project' },
    {
      k: 'p',
      text: 'Send a follow-up message to a project’s agent: edits, changes, a different take. Free. Returns the project; the agent works asynchronously.',
    },
    {
      k: 'table',
      head: ['Argument', 'Type', 'Required', 'Notes'],
      rows: [
        [<C key="a">projectId</C>, 'string', 'yes', ''],
        [<C key="b">text</C>, 'string', 'yes', ''],
        [<C key="c">scene</C>, 'string', 'no', 'Scope to a scene or shot id'],
        [<C key="d">slide</C>, 'number', 'no', 'Scope to a slide, 1-based'],
      ],
    },
    {
      k: 'note',
      text: (
        <>
          Fails with a busy error while the previous turn is still running. Wait for{' '}
          <C>get_project</C> to leave <C>working</C>, then send it again.
        </>
      ),
    },
    { k: 'h2', text: 'get_project' },
    {
      k: 'p',
      text: (
        <>
          Read one project by <C>projectId</C>: <C>status</C>, <C>outputs</C>, <C>scenes</C> or{' '}
          <C>slides</C>, <C>shareUrl</C>, <C>error</C>. Free. This is what the agent polls.
        </>
      ),
    },
    { k: 'h2', text: 'list_projects' },
    {
      k: 'p',
      text: (
        <>
          Your projects, newest first. Optional <C>flow</C> filter and <C>limit</C> (1 to 100,
          default 50). Free.
        </>
      ),
    },
    { k: 'h2', text: 'get_credits' },
    {
      k: 'p',
      text: 'Balance, subscription, and transactions. Free. Call it before create_project.',
    },
    { k: 'h2', text: 'get_pricing' },
    {
      k: 'p',
      text: (
        <>
          What each flow costs in credits, the launch video tiers, and deck generate versus enhance.
          Free. Same payload as <C>GET /v1/pricing</C>.
        </>
      ),
    },
  ],
}

export const DOC_PAGES: DocPage[] = [
  overview,
  gettingStarted,
  mcp,
  authentication,
  credits,
  files,
  polling,
  errors,
  restApi,
  tools,
]

export const findPage = (slug: string) => DOC_PAGES.find(p => p.slug === slug)
