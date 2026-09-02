/**
 * Docs content. Each page is a list of blocks so the layout can derive the
 * "On this page" list from the h2s without a markdown pipeline.
 *
 * Every fact here is checked against the code:
 *   auth        apps/api/src/middleware/auth.ts
 *   REST        apps/api/src/routes/v1.ts
 *   MCP         apps/api/src/mcp/server.ts
 *   credits     packages/shared/src/index.ts
 *   job model   packages/db/prisma/schema.prisma
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
      text: 'An agent opens a real browser, walks through your product, writes the script, records the screen, and renders an MP4. The same engine also builds slide decks and cleans up screen recordings you already have.',
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
      head: ['Output', 'What it is', 'Credits'],
      rows: [
        ['Demo video', 'The agent drives your live product and narrates the flow', '3'],
        ['Launch video', 'A scripted, scored, cinematic film built scene by scene', '6 to 13'],
        ['Deck', 'A slide deck written and designed from a topic', '1'],
        ['Deck enhance', 'A redesign of a PDF or PPTX you upload', '1'],
        ['Recording edit', 'A cut of a screen recording you already made', '2'],
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
    { k: 'h2', text: 'How a job runs' },
    {
      k: 'p',
      text: 'Every output is a job. You create it, we queue it, a worker picks it up. Creating a job returns right away with an id. The work takes minutes, not milliseconds, so you poll for the result.',
    },
    {
      k: 'code',
      lang: 'text',
      code: `create  ->  PENDING  ->  PROCESSING  ->  COMPLETED
                              \\
                               ->  FAILED`,
    },
    {
      k: 'p',
      text: (
        <>
          Credits come off the balance when the job is created, not when it finishes. If we fail to
          queue it, we refund and mark it failed in the same step. See{' '}
          <A to="/docs/polling">Polling jobs</A>.
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
      text: 'The key acts as the user who made it. Jobs it creates belong to that user and spend that user’s credits.',
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
          A demo video costs 3 credits. If the balance is short, job creation fails with{' '}
          <C>402 insufficient_credits</C> and nothing is charged. Buy more at{' '}
          <A to="/pricing">trypitch.co/pricing</A>.
        </>
      ),
    },
    { k: 'h2', text: '3. Create a job' },
    {
      k: 'p',
      text: 'Point it at a public URL and say what you want. Instructions are free text. You do not need a script.',
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/videos \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://trypitch.co",
    "instructions": "Walk through sign-up and the first render. Keep it under 60 seconds."
  }'`,
    },
    {
      k: 'p',
      text: (
        <>
          It answers <C>202 Accepted</C> as soon as the job is queued.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "id": "cm4x8k2p90001abcd",
  "type": "video",
  "status": "PENDING",
  "progress": 0,
  "cost": 0,
  "videoUrl": null,
  "createdAt": "2026-09-02T10:14:03.221Z"
}`,
    },
    { k: 'h2', text: '4. Poll for the result' },
    {
      k: 'p',
      text: 'Ask for the job every few seconds until it stops being PENDING or PROCESSING. Ten seconds is a good interval. Most videos land in a few minutes.',
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl ${BASE}/v1/jobs/cm4x8k2p90001abcd \\
  -H "Authorization: Bearer pk_your_key"`,
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "id": "cm4x8k2p90001abcd",
  "type": "video",
  "status": "COMPLETED",
  "progress": 100,
  "cost": 3,
  "videoUrl": "https://s3.trypitch.co/pitch/.../final.mp4",
  "thumbnailUrl": "https://s3.trypitch.co/pitch/.../thumb.jpg",
  "shareUrl": null,
  "error": null
}`,
    },
    {
      k: 'p',
      text: (
        <>
          Download <C>videoUrl</C> and you are done. A full polling loop with backoff is in{' '}
          <A to="/docs/polling">Polling jobs</A>.
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

const job = await api("/v1/videos", {
  method: "POST",
  body: JSON.stringify({ url: "https://trypitch.co" }),
})

let state = job
while (state.status === "PENDING" || state.status === "PROCESSING") {
  await new Promise(r => setTimeout(r, 10_000))
  state = await api(\`/v1/jobs/\${job.id}\`)
}

if (state.status === "FAILED") throw new Error(state.error)
console.log(state.videoUrl)`,
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
  lede: 'Connect Claude, Cursor, ChatGPT, or any MCP client to Pitch. The agent gets tools for making videos and decks and can check on them itself.',
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
          Ten tools. Five spend credits and return a job id, five are free reads. Full argument
          lists are in <A to="/docs/tools">MCP tools</A>.
        </>
      ),
    },
    {
      k: 'table',
      head: ['Tool', 'Credits'],
      rows: [
        [<C key="1">create_demo_video</C>, '3'],
        [<C key="2">create_launch_video</C>, '6 to 13'],
        [<C key="3">create_pdf</C>, '1'],
        [<C key="4">enhance_presentation</C>, '1'],
        [<C key="5">edit_recording</C>, '2'],
        [<C key="6">get_job</C>, 'free'],
        [<C key="7">list_jobs</C>, 'free'],
        [<C key="8">get_launch_video</C>, 'free'],
        [<C key="9">list_launch_videos</C>, 'free'],
        [<C key="10">get_credits</C>, 'free'],
      ],
    },
    { k: 'h2', text: 'Telling the agent how to behave' },
    {
      k: 'p',
      text: 'Agents tend to call a create tool and then stop, because the job is not finished yet. Put something like this in your system prompt or project instructions.',
    },
    {
      k: 'code',
      lang: 'text',
      code: `When you use Pitch:
- Call get_credits before a create tool so you know the job can pay for itself.
- A create tool returns a jobId. The video is not ready at that point.
- Poll get_job every 10 seconds until status is COMPLETED or FAILED.
- On COMPLETED, give the user videoUrl or pdfUrl.
- On FAILED, read the error field and say what went wrong.
- Never call a create tool twice for the same request.`,
    },
    {
      k: 'note',
      text: (
        <>
          That last line matters. Every create tool spends credits at once, so a retried call is a
          second charge, not a resumed job.
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
      text: 'A key acts as the user who created it. There are no scopes and no per-key limits yet. Anything that user can do in the app, the key can do through the API, and every credit it spends lands in that user’s ledger next to their browser usage.',
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
      text: 'Jobs already running under a revoked key keep running. Revoking stops new requests, it does not cancel work in flight.',
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
  lede: 'Every job costs credits. They come off the balance when the job is created and go back if we could not queue it.',
  blocks: [
    { k: 'h2', text: 'What things cost' },
    {
      k: 'table',
      head: ['Job type', 'REST', 'MCP tool', 'Credits'],
      rows: [
        ['Demo video', <C key="a">POST /v1/videos</C>, <C key="b">create_demo_video</C>, '3'],
        [
          'Launch video',
          <C key="c">POST /v1/launch-videos</C>,
          <C key="d">create_launch_video</C>,
          '6 to 13',
        ],
        ['Deck', <C key="e">POST /v1/decks</C>, <C key="f">create_pdf</C>, '1'],
        [
          'Deck enhance',
          <C key="g">POST /v1/decks/enhance</C>,
          <C key="h">enhance_presentation</C>,
          '1',
        ],
        [
          'Recording edit',
          <C key="i">POST /v1/recordings/edit</C>,
          <C key="j">edit_recording</C>,
          '2',
        ],
        ['Any read', <C key="k">GET /v1/*</C>, <C key="l">get_*</C>, 'free'],
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
          If you send no <C>resolution</C>, you get 1080p and pay 9. An unrecognised value also
          falls back to 1080p rather than the cheapest tier, so a typo can never underpay.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'bash',
      code: `# a 6-credit launch video instead of the 9-credit default
curl -X POST ${BASE}/v1/launch-videos \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "acme-launch",
    "prompt": "60 second launch film for an AI notetaker. Confident, fast.",
    "resolution": "720p"
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
    { "amount": -3, "reason": "Video generation", "jobId": "cm4x...", "createdAt": "..." },
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
  "video": 3,
  "deck": 1,
  "deck.enhance": 1,
  "recording.edit": 2,
  "launch_video": {
    "default": 9,
    "byResolution": {
      "720p":  { "narrated": 6,  "musicOnly": 5 },
      "1080p": { "narrated": 9,  "musicOnly": 8 },
      "4k":    { "narrated": 13, "musicOnly": 12 }
    }
  }
}`,
    },
    { k: 'p', text: 'This endpoint needs no key.' },
    { k: 'h2', text: 'When you run out' },
    {
      k: 'p',
      text: (
        <>
          We check the balance before creating anything. If it is short, the request fails with{' '}
          <C>402</C>, no job is made, and nothing is charged.
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
      text: 'Credits come off as soon as the job row is written. If the queue is unreachable at that moment, we mark the job FAILED and put the exact amount back in the same step, so a broken queue never silently eats credits.',
    },
    {
      k: 'p',
      text: 'A job that fails while a worker is running it is not refunded automatically. Email support@trypitch.co if a job failed for a reason on our side.',
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
  lede: 'Two jobs take a file you already have. Send it base64-encoded in the JSON body.',
  blocks: [
    {
      k: 'p',
      text: 'There is no separate upload step and no multipart form. You put the bytes in the request. This keeps MCP and REST identical, since an MCP tool call cannot carry a multipart body.',
    },
    { k: 'h2', text: 'Limits' },
    {
      k: 'table',
      head: ['Job', 'Max size', 'Accepted'],
      rows: [
        [
          <>
            Deck enhance
            <br />
            <C>POST /v1/decks/enhance</C>
          </>,
          '50 MB',
          <C key="a">.pdf .pptx</C>,
        ],
        [
          <>
            Recording edit
            <br />
            <C>POST /v1/recordings/edit</C>
          </>,
          '500 MB',
          <C key="b">.mp4 .webm .mov .mkv .avi</C>,
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
      code: `curl -X POST ${BASE}/v1/decks/enhance \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d "$(jq -n \\
    --arg f "$(base64 -w0 deck.pdf)" \\
    '{ fileBase64: $f, fileName: "deck.pdf", mode: "recreate" }')"`,
    },
    {
      k: 'code',
      lang: 'javascript',
      code: `import { readFile } from "node:fs/promises"

const file = await readFile("recording.mp4")

const res = await fetch("${BASE}/v1/recordings/edit", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.PITCH_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    fileBase64: file.toString("base64"),
    fileName: "recording.mp4",
    productName: "Acme",
    productUrl: "https://acme.com",
    instructions: "Cut the dead air at the start. Add intro and outro cards.",
  }),
})`,
    },
    { k: 'h2', text: 'What happens to your file' },
    {
      k: 'p',
      text: 'We decode it to a temp file, check the extension and size, upload it to object storage, and delete the temp copy. The stored input is what the worker reads. Output files live in the same bucket and are served over HTTPS.',
    },
    { k: 'h2', text: 'Assets for a demo video' },
    {
      k: 'p',
      text: (
        <>
          Demo videos take assets differently. You pass <C>assets</C>, an array of public URLs to
          PDFs or images, and we fetch them.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "url": "https://trypitch.co",
  "assets": ["https://example.com/brand-guide.pdf"]
}`,
    },
    {
      k: 'note',
      text: (
        <>
          Passing <C>assets</C> changes the flow. The job plans first and stops at{' '}
          <C>AWAITING_REVIEW</C> so a human can approve the plan in the app before it records.
          Scripts that expect a video to appear on its own will hang. See{' '}
          <A to="/docs/polling">Polling jobs</A>.
        </>
      ),
    },
    { k: 'h2', text: 'Errors' },
    {
      k: 'table',
      head: ['Status', 'Code', 'Cause'],
      rows: [
        [
          '413',
          <C key="a">payload_too_large</C>,
          'The decoded file is over the limit for that job',
        ],
        ['415', <C key="b">unsupported_media_type</C>, 'The extension is not in the accepted list'],
        ['400', <C key="c">invalid_request</C>, 'The base64 decoded to nothing'],
      ],
    },
  ],
}

/* ── Polling ───────────────────────────────────────────────────────────── */

const polling: DocPage = {
  slug: 'polling',
  title: 'Polling jobs',
  group: 'Guide',
  nav: 'Polling Jobs',
  lede: 'Creating a job returns immediately. Rendering takes minutes. Here is how to wait for it well.',
  blocks: [
    { k: 'h2', text: 'Statuses' },
    {
      k: 'table',
      head: ['Status', 'Meaning', 'Keep polling?'],
      rows: [
        ['PENDING', 'Queued, no worker has picked it up yet', 'Yes'],
        ['PROCESSING', 'A worker is on it', 'Yes'],
        [
          'AWAITING_REVIEW',
          'Planning is done and a human needs to approve it in the app',
          'No, it will not move on its own',
        ],
        ['COMPLETED', 'Done. The result URL is populated', 'No'],
        [
          'FAILED',
          <>
            Something broke. <C>error</C> says what
          </>,
          'No',
        ],
      ],
    },
    {
      k: 'note',
      text: (
        <>
          <C>AWAITING_REVIEW</C> only happens on a demo video created with <C>assets</C>. If your
          script does not handle it, it will poll forever. Treat it as terminal and tell the user to
          approve the plan at <A to="/dashboard">trypitch.co/dashboard</A>.
        </>
      ),
    },
    { k: 'h2', text: 'How often' },
    {
      k: 'p',
      text: 'Every 10 seconds is right. Faster does not make the render faster. Demo videos usually finish in a few minutes, launch videos take longer because they run a full recon, script, build, and mix pass.',
    },
    { k: 'h2', text: 'A loop that handles every case' },
    {
      k: 'code',
      lang: 'javascript',
      code: `const TERMINAL = ["COMPLETED", "FAILED", "AWAITING_REVIEW"]

async function waitFor(jobId, { intervalMs = 10_000, timeoutMs = 30 * 60_000 } = {}) {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const res = await fetch(\`${BASE}/v1/jobs/\${jobId}\`, {
      headers: { Authorization: \`Bearer \${process.env.PITCH_API_KEY}\` },
    })

    // Transient. Wait and try again rather than giving up on the job.
    if (res.status >= 500) {
      await sleep(intervalMs)
      continue
    }
    if (!res.ok) throw new Error((await res.json()).error.message)

    const job = await res.json()
    if (TERMINAL.includes(job.status)) return job

    await sleep(intervalMs)
  }

  throw new Error(\`Job \${jobId} did not finish in time\`)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const job = await waitFor("cm4x8k2p90001abcd")
if (job.status === "FAILED") throw new Error(job.error)
if (job.status === "AWAITING_REVIEW") throw new Error("Approve the plan in the dashboard")
console.log(job.videoUrl ?? job.pdfUrl)`,
    },
    { k: 'h2', text: 'Progress' },
    {
      k: 'p',
      text: (
        <>
          <C>progress</C> is a number from 0 to 100. It is a weighted sum of finished phases, not a
          time estimate, so it moves in jumps. <C>phases</C> lists what the worker is doing, which
          is what you want if you are showing a status somewhere.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "status": "PROCESSING",
  "progress": 70,
  "phases": [
    { "phase": "workspace_init",        "label": "Workspace Initialization", "status": "completed" },
    { "phase": "video_recording",       "label": "Video Recording",          "status": "completed" },
    { "phase": "ffmpeg_postprocessing", "label": "FFmpeg Post-Processing",   "status": "running"   },
    { "phase": "intro_outro",           "label": "Intro & Outro Cards",      "status": "pending"   }
  ]
}`,
    },
    {
      k: 'p',
      text: 'Different job types run different phases. Do not hardcode the list, read the labels.',
    },
    { k: 'h2', text: 'Where the result lands' },
    {
      k: 'table',
      head: ['Job type', 'Result field'],
      rows: [
        [<C key="a">video</C>, <C key="b">videoUrl</C>],
        [<C key="c">launch_video</C>, <C key="d">videoUrl</C>],
        [<C key="e">recording.edit</C>, <C key="f">videoUrl</C>],
        [<C key="g">deck</C>, <C key="h">pdfUrl</C>],
        [<C key="i">deck.enhance</C>, <C key="j">pdfUrl</C>],
      ],
    },
    {
      k: 'p',
      text: (
        <>
          Videos also get a <C>thumbnailUrl</C>. <C>shareUrl</C> is set only if someone turned on
          sharing for that job in the app.
        </>
      ),
    },
    { k: 'h2', text: 'Listing jobs' },
    {
      k: 'p',
      text: 'If you lost an id, list them. Newest first.',
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl "${BASE}/v1/jobs?type=video&limit=10" \\
  -H "Authorization: Bearer pk_your_key"`,
    },
    { k: 'h2', text: 'Launch video detail' },
    {
      k: 'p',
      text: (
        <>
          Launch videos are also projects, addressed by the name you gave them. Once the worker has
          built the workspace you can read the scene breakdown, which is more useful than a
          percentage.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl ${BASE}/v1/launch-videos/acme-launch \\
  -H "Authorization: Bearer pk_your_key"`,
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "name": "acme-launch",
  "hasVideo": true,
  "videoUrl": "https://s3.trypitch.co/renders/acme-launch-launch.mp4",
  "sceneCount": 5,
  "duration": 58.4,
  "scenes": [
    { "id": "s1", "index": 1, "start": 0, "end": 6.2, "dur": 6.2, "vo": "Meet Acme.", "draftUrl": null }
  ]
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
          'The balance cannot cover the job. Nothing was created or charged.',
          'Top up, then retry the same request.',
        ],
        [
          '404',
          <C key="d">not_found</C>,
          'No job or project with that id, or it belongs to someone else.',
          'Check the id. We do not distinguish the two cases.',
        ],
        [
          '413',
          <C key="e">payload_too_large</C>,
          'The decoded file is over the limit.',
          'Compress or trim the file.',
        ],
        [
          '415',
          <C key="f">unsupported_media_type</C>,
          'The extension is not accepted for that job.',
          'Convert it first.',
        ],
        [
          '500',
          <C key="g">internal_error</C>,
          'Something broke on our side.',
          'Retry with backoff. If it persists, email support.',
        ],
      ],
    },
    { k: 'h2', text: 'What is safe to retry' },
    {
      k: 'p',
      text: 'There are no idempotency keys yet, so a retried create is a second job and a second charge. Retry writes only when you never got a response at all, and check the job list first.',
    },
    {
      k: 'table',
      head: ['Case', 'Retry?'],
      rows: [
        [<C key="a">GET</C>, 'Yes, always safe'],
        ['400, 401, 402, 404, 413, 415', 'No, fix the cause first'],
        ['500 on a read', 'Yes, with backoff'],
        [
          '500 on a create',
          <>
            Check <C>GET /v1/jobs</C> first. The job may exist.
          </>,
        ],
        ['No response, timeout', 'Same. List jobs before firing again.'],
      ],
    },
    { k: 'h2', text: 'Job failure is not an HTTP error' },
    {
      k: 'p',
      text: (
        <>
          A job that fails while rendering still returns <C>200</C>. The failure is in the body.
        </>
      ),
    },
    {
      k: 'code',
      lang: 'json',
      code: `{
  "id": "cm4x8k2p90001abcd",
  "status": "FAILED",
  "error": "Navigation timed out after 30s: https://example.com is unreachable",
  "videoUrl": null
}`,
    },
    {
      k: 'p',
      text: 'Common causes: the URL is behind a login, blocked our browser, or was down. Sites that need a sign-in cannot be demoed from a public URL alone.',
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
  lede: 'Every endpoint, every field.',
  blocks: [
    {
      k: 'table',
      head: ['', ''],
      rows: [
        ['Base URL', <C key="a">{BASE}</C>],
        ['Auth', <C key="b">Authorization: Bearer pk_...</C>],
        ['Content type', <C key="c">application/json</C>],
        [
          'Create response',
          <>
            <C>202 Accepted</C> with a job object
          </>,
        ],
      ],
    },
    { k: 'h2', text: 'The job object' },
    {
      k: 'p',
      text: 'Every create endpoint and both job reads return this shape.',
    },
    {
      k: 'table',
      head: ['Field', 'Type', 'Notes'],
      rows: [
        [<C key="a">id</C>, 'string', 'Use it to poll'],
        [
          <C key="b">type</C>,
          'string',
          <>
            <C>video</C>, <C>launch_video</C>, <C>deck</C>, <C>deck.enhance</C>,{' '}
            <C>recording.edit</C>
          </>,
        ],
        [
          <C key="c">status</C>,
          'string',
          <>
            <C>PENDING</C>, <C>PROCESSING</C>, <C>AWAITING_REVIEW</C>, <C>COMPLETED</C>,{' '}
            <C>FAILED</C>
          </>,
        ],
        [<C key="d">progress</C>, 'number', '0 to 100'],
        [<C key="e">cost</C>, 'number', 'Credits charged. 0 until the worker settles it'],
        [<C key="f">videoUrl</C>, 'string | null', 'Set when a video job completes'],
        [<C key="g">pdfUrl</C>, 'string | null', 'Set when a deck job completes'],
        [<C key="h">thumbnailUrl</C>, 'string | null', 'Poster frame for videos'],
        [<C key="i">shareUrl</C>, 'string | null', 'Only if sharing was turned on in the app'],
        [
          <C key="j">error</C>,
          'string | null',
          <>
            Set when <C>status</C> is <C>FAILED</C>
          </>,
        ],
        [
          <C key="k">phases</C>,
          'array',
          <>
            <C>phase</C>, <C>label</C>, <C>status</C>
          </>,
        ],
        [<C key="l">createdAt</C>, 'string', 'ISO 8601'],
        [<C key="m">updatedAt</C>, 'string', 'ISO 8601'],
      ],
    },
    { k: 'h2', text: 'POST /v1/videos' },
    { k: 'p', text: 'Create a demo video. Costs 3 credits.' },
    {
      k: 'table',
      head: ['Field', 'Type', 'Required', 'Notes'],
      rows: [
        [<C key="a">url</C>, 'string', 'yes', 'Public product URL'],
        [<C key="b">instructions</C>, 'string', 'no', 'What to show, tone, length'],
        [<C key="c">script</C>, 'string', 'no', 'Your own narration. We write one if omitted'],
        [<C key="d">voice</C>, 'string', 'no', 'Voice id'],
        [
          <C key="e">assets</C>,
          'string[]',
          'no',
          <>
            Public URLs to PDFs or images. Sending this puts the job in <C>AWAITING_REVIEW</C> after
            planning
          </>,
        ],
      ],
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/videos \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "url": "https://trypitch.co", "instructions": "Show sign-up. Under 60s." }'`,
    },
    { k: 'h2', text: 'POST /v1/launch-videos' },
    { k: 'p', text: 'Create a cinematic launch film. Costs 6 to 13 credits.' },
    {
      k: 'table',
      head: ['Field', 'Type', 'Required', 'Notes'],
      rows: [
        [
          <C key="a">name</C>,
          'string',
          'yes',
          <>
            Project name, unique per user. No <C>/</C> or <C>\</C>, cannot start with a dot
          </>,
        ],
        [<C key="b">prompt</C>, 'string', 'yes', 'Creative brief: product, audience, tone, length'],
        [<C key="c">music</C>, 'string', 'no', 'Track filename from the shared library'],
        [
          <C key="d">resolution</C>,
          'string',
          'no',
          <>
            <C>720p</C>, <C>1080p</C> (default), <C>4k</C>. Sets the price
          </>,
        ],
        [<C key="e">narration</C>, 'boolean', 'no', 'Default true. False saves 1 credit'],
      ],
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/launch-videos \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "acme-launch",
    "prompt": "60 second launch film for an AI notetaker. Confident, fast.",
    "resolution": "1080p"
  }'`,
    },
    { k: 'h2', text: 'POST /v1/decks' },
    { k: 'p', text: 'Write and design a slide deck. Costs 1 credit.' },
    {
      k: 'table',
      head: ['Field', 'Type', 'Required'],
      rows: [
        [<C key="a">topic</C>, 'string', 'yes'],
        [<C key="b">instructions</C>, 'string', 'no'],
      ],
    },
    {
      k: 'code',
      lang: 'bash',
      code: `curl -X POST ${BASE}/v1/decks \\
  -H "Authorization: Bearer pk_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "topic": "Seed round deck for an AI video startup", "instructions": "10 slides" }'`,
    },
    { k: 'h2', text: 'POST /v1/decks/enhance' },
    {
      k: 'p',
      text: (
        <>
          Redesign a deck you already have. Costs 1 credit. Max 50 MB, <C>.pdf</C> or <C>.pptx</C>.
        </>
      ),
    },
    {
      k: 'table',
      head: ['Field', 'Type', 'Required', 'Notes'],
      rows: [
        [<C key="a">fileBase64</C>, 'string', 'yes', 'Base64 of the file'],
        [<C key="b">fileName</C>, 'string', 'yes', 'The extension decides the type'],
        [
          <C key="c">mode</C>,
          'string',
          'no',
          <>
            <C>recreate</C> (default) rebuilds it, <C>preserve</C> keeps the layout
          </>,
        ],
        [<C key="d">enhancePrompt</C>, 'string', 'no', 'What to change'],
        [
          <C key="e">slideCount</C>,
          'number',
          'no',
          <>
            Target slide count in <C>recreate</C>
          </>,
        ],
      ],
    },
    { k: 'h2', text: 'POST /v1/recordings/edit' },
    {
      k: 'p',
      text: (
        <>
          Cut a screen recording into a demo. Costs 2 credits. Max 500 MB,{' '}
          <C>.mp4 .webm .mov .mkv .avi</C>.
        </>
      ),
    },
    {
      k: 'table',
      head: ['Field', 'Type', 'Required', 'Notes'],
      rows: [
        [<C key="a">fileBase64</C>, 'string', 'yes', 'Base64 of the video'],
        [<C key="b">fileName</C>, 'string', 'yes', 'The extension decides the type'],
        [<C key="c">productName</C>, 'string', 'no', 'Used on the intro card'],
        [<C key="d">productUrl</C>, 'string', 'no', 'Used on the outro card'],
        [<C key="e">instructions</C>, 'string', 'no', 'Guidance for the editor'],
      ],
    },
    { k: 'h2', text: 'GET /v1/jobs' },
    { k: 'p', text: 'List your jobs, newest first. Free.' },
    {
      k: 'table',
      head: ['Query', 'Notes'],
      rows: [
        [
          <C key="a">type</C>,
          <>
            One of <C>video</C>, <C>launch_video</C>, <C>deck</C>, <C>deck.enhance</C>,{' '}
            <C>recording.edit</C>
          </>,
        ],
        [<C key="b">limit</C>, 'Default 50, max 100'],
      ],
    },
    {
      k: 'code',
      lang: 'json',
      code: `{ "data": [ { "id": "cm4x...", "type": "video", "status": "COMPLETED", ... } ], "total": 37 }`,
    },
    { k: 'h2', text: 'GET /v1/jobs/:id' },
    {
      k: 'p',
      text: (
        <>
          One job. Returns <C>404</C> if it does not exist or is not yours. Free.
        </>
      ),
    },
    { k: 'h2', text: 'GET /v1/launch-videos' },
    { k: 'p', text: 'List launch video projects. Free.' },
    {
      k: 'code',
      lang: 'json',
      code: `{ "data": [ { "name": "acme-launch", "hasVideo": true, "videoUrl": "...", "sceneCount": 5 } ] }`,
    },
    { k: 'h2', text: 'GET /v1/launch-videos/:name' },
    {
      k: 'p',
      text: 'One project with its scene breakdown: start, end, duration, voiceover line, and per-scene draft render when one exists. Free.',
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
    { k: 'p', text: 'Current credit prices. No key needed.' },
    { k: 'h2', text: 'Not there yet' },
    {
      k: 'p',
      text: 'Being straight about the edges: there are no webhooks, so you have to poll. There are no idempotency keys, so a retried create is a second charge. There is no cursor pagination on job lists, only a limit. There is no way to cancel a running job through the API. Email support@trypitch.co if you need one of these and we will prioritise it.',
    },
  ],
}

/* ── MCP tools reference ───────────────────────────────────────────────── */

const tools: DocPage = {
  slug: 'tools',
  title: 'MCP tools',
  group: 'Reference',
  nav: 'MCP Tools',
  lede: 'The ten tools an agent gets, and what each one takes.',
  blocks: [
    {
      k: 'p',
      text: (
        <>
          Every tool returns a JSON string in a text block. Create tools return{' '}
          <C>{`{ "jobId", "status" }`}</C>. Read tools return the object. On failure the result has{' '}
          <C>isError: true</C>. See <A to="/docs/errors">Errors</A>.
        </>
      ),
    },
    { k: 'h2', text: 'create_demo_video' },
    { k: 'p', text: 'Demo video from a product URL. 3 credits.' },
    {
      k: 'table',
      head: ['Argument', 'Type', 'Required'],
      rows: [
        [<C key="a">url</C>, 'string', 'yes'],
        [<C key="b">instructions</C>, 'string', 'no'],
        [<C key="c">script</C>, 'string', 'no'],
        [<C key="d">voice</C>, 'string', 'no'],
        [<C key="e">assets</C>, 'string[]', 'no'],
      ],
    },
    { k: 'h2', text: 'create_launch_video' },
    {
      k: 'p',
      text: 'Cinematic launch film. 6 to 13 credits depending on resolution and narration.',
    },
    {
      k: 'table',
      head: ['Argument', 'Type', 'Required', 'Notes'],
      rows: [
        [<C key="a">name</C>, 'string', 'yes', 'Project name, unique per user'],
        [<C key="b">prompt</C>, 'string', 'yes', 'Creative brief'],
        [<C key="c">music</C>, 'string', 'no', 'Track from the shared library'],
        [
          <C key="d">resolution</C>,
          'string',
          'no',
          <>
            <C>720p</C>, <C>1080p</C>, <C>4k</C>
          </>,
        ],
        [<C key="e">narration</C>, 'boolean', 'no', 'Default true'],
      ],
    },
    { k: 'h2', text: 'create_pdf' },
    { k: 'p', text: 'Slide deck from a topic. 1 credit.' },
    {
      k: 'table',
      head: ['Argument', 'Type', 'Required'],
      rows: [
        [<C key="a">topic</C>, 'string', 'yes'],
        [<C key="b">instructions</C>, 'string', 'no'],
      ],
    },
    { k: 'h2', text: 'enhance_presentation' },
    { k: 'p', text: 'Redesign a PDF or PPTX. 1 credit. Max 50 MB.' },
    {
      k: 'table',
      head: ['Argument', 'Type', 'Required'],
      rows: [
        [<C key="a">fileBase64</C>, 'string', 'yes'],
        [<C key="b">fileName</C>, 'string', 'yes'],
        [
          <C key="c">mode</C>,
          <>
            <C>recreate</C> | <C>preserve</C>
          </>,
          'no',
        ],
        [<C key="d">enhancePrompt</C>, 'string', 'no'],
        [<C key="e">slideCount</C>, 'number', 'no'],
      ],
    },
    { k: 'h2', text: 'edit_recording' },
    { k: 'p', text: 'Cut a screen recording. 2 credits. Max 500 MB.' },
    {
      k: 'table',
      head: ['Argument', 'Type', 'Required'],
      rows: [
        [<C key="a">fileBase64</C>, 'string', 'yes'],
        [<C key="b">fileName</C>, 'string', 'yes'],
        [<C key="c">productName</C>, 'string', 'no'],
        [<C key="d">productUrl</C>, 'string', 'no'],
        [<C key="e">instructions</C>, 'string', 'no'],
      ],
    },
    { k: 'h2', text: 'get_job' },
    {
      k: 'p',
      text: (
        <>
          Read one job by id. Takes <C>jobId</C>. Free. This is what the agent polls.
        </>
      ),
    },
    { k: 'h2', text: 'list_jobs' },
    {
      k: 'p',
      text: (
        <>
          Your jobs, newest first. Optional <C>type</C>: <C>video</C>, <C>pdf</C>, <C>enhance</C>,{' '}
          <C>edit-recording</C>. Free.
        </>
      ),
    },
    {
      k: 'note',
      text: (
        <>
          The MCP filter values are the older internal names and differ from the REST ones. REST
          uses <C>deck</C> where MCP uses <C>pdf</C>.
        </>
      ),
    },
    { k: 'h2', text: 'get_launch_video' },
    {
      k: 'p',
      text: (
        <>
          One launch video project by <C>name</C>, with scenes, durations, and the render URL when
          ready. Free.
        </>
      ),
    },
    { k: 'h2', text: 'list_launch_videos' },
    { k: 'p', text: 'All launch video projects for the key owner. Free.' },
    { k: 'h2', text: 'get_credits' },
    {
      k: 'p',
      text: 'Balance, subscription, and transactions. Free. Call it before a create tool.',
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
