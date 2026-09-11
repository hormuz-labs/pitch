import { Bot, SquareTerminal } from 'lucide-solid'
import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from 'solid-js'
import chatgptIco from '../../assets/chatgpt.png'
import claudeIco from '../../assets/claude.svg'
import cursorIco from '../../assets/cursor.png'
import perplexityIco from '../../assets/perplexity.png'

export const MCP_URL = 'https://api.trypitch.co/mcp'
export const REGISTRY_NAME = 'co.trypitch/pitch'
const BRAND: Record<string, string> = {
  claude: claudeIco,
  cursor: cursorIco,
  chatgpt: chatgptIco,
  perplexity: perplexityIco,
}
export const Glyph = (props: { id: string }) => (
  <Show
    when={BRAND[props.id]}
    fallback={props.id === 'api' ? <SquareTerminal size={13} /> : <Bot size={13} />}
  >
    <img
      src={BRAND[props.id]}
      alt=""
      class={`mcp-tab-ico${props.id === 'chatgpt' ? ' mcp-icon--invert' : ''}${props.id === 'cursor' || props.id === 'perplexity' ? ' mcp-icon--tile' : ''}`}
      width="14"
      height="14"
    />
  </Show>
)
type Line =
  | { kind: 'step'; n: number; text: string }
  | { kind: 'url' }
  | { kind: 'ok' | 'note' | 'code'; text: string }
const TABS = [
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'any', label: 'Any agent' },
  { id: 'api', label: 'API' },
]
const CONTENT: Record<string, { cmd: string; lines: Line[] }> = {
  claude: {
    cmd: 'connect claude',
    lines: [
      { kind: 'step', n: 1, text: 'Create an API key at trypitch.co/api-keys (pk_…)' },
      { kind: 'step', n: 2, text: 'Add the server with that key as the Authorization header:' },
      {
        kind: 'code',
        text: `claude mcp add --transport http pitch \\\n+  ${MCP_URL} \\\n+  --header "Authorization: Bearer pk_your_key"`,
      },
      {
        kind: 'ok',
        text: 'Or add it as a custom connector in claude.ai under Settings, then Connectors.',
      },
    ],
  },
  cursor: {
    cmd: 'connect cursor',
    lines: [
      { kind: 'step', n: 1, text: 'Add to .cursor/mcp.json under Settings, MCP, then New server:' },
      {
        kind: 'code',
        text: `{\n  "mcpServers": {\n    "pitch": {\n      "url": "${MCP_URL}",\n      "headers": { "Authorization": "Bearer pk_your_key" }\n    }\n  }\n}`,
      },
      { kind: 'ok', text: 'Get the key at trypitch.co/api-keys.' },
    ],
  },
  chatgpt: {
    cmd: 'connect chatgpt',
    lines: [
      {
        kind: 'step',
        n: 1,
        text: 'Open Settings, Connectors, Advanced, Developer mode, then Add.',
      },
      { kind: 'step', n: 2, text: 'Paste this URL:' },
      { kind: 'url' },
      { kind: 'step', n: 3, text: 'Auth: custom header  Authorization = Bearer pk_your_key' },
      { kind: 'ok', text: 'Works in ChatGPT and the Responses / Agents API.' },
    ],
  },
  perplexity: {
    cmd: 'connect perplexity',
    lines: [
      { kind: 'step', n: 1, text: 'Open Settings, Connectors, Add connector, then Custom (MCP).' },
      { kind: 'step', n: 2, text: 'Paste this URL:' },
      { kind: 'url' },
      { kind: 'step', n: 3, text: 'Auth header  Authorization = Bearer pk_your_key' },
      { kind: 'ok', text: 'Same setup works in Comet and the Perplexity API.' },
    ],
  },
  any: {
    cmd: 'connect any-mcp-client',
    lines: [
      { kind: 'step', n: 1, text: 'Streamable-HTTP endpoint, bearer-token auth:' },
      { kind: 'url' },
      { kind: 'ok', text: `On the official MCP registry, add ${REGISTRY_NAME}.` },
    ],
  },
  api: {
    cmd: 'pitch rest api',
    lines: [
      { kind: 'step', n: 1, text: 'Same key, plain REST. Create a project:' },
      {
        kind: 'code',
        text: `curl -X POST https://api.trypitch.co/v1/projects \\\n+  -H "Authorization: Bearer pk_your_key" \\\n+  -H "Content-Type: application/json" \\\n+  -d '{ "flow": "demo-video", "prompt": "https://trypitch.co — 60 second demo" }'`,
      },
      { kind: 'step', n: 2, text: 'It returns a project id. Poll it until status is ready:' },
      {
        kind: 'code',
        text: `curl https://api.trypitch.co/v1/projects/PROJECT_ID \\\n+  -H "Authorization: Bearer pk_your_key"`,
      },
      {
        kind: 'ok',
        text: 'Read the video url off outputs. Follow-up prompts are free. Full reference in the docs.',
      },
    ],
  },
}
export const McpSetup = (props: { instant?: boolean }) => {
  const [tab, setTab] = createSignal('claude'),
    [typed, setTyped] = createSignal(''),
    [copied, setCopied] = createSignal(false)
  let interval: number | undefined, timer: number | undefined
  createEffect(() => {
    clearInterval(interval)
    const cmd = CONTENT[tab()].cmd
    if (props.instant) {
      setTyped(cmd)
      return
    }
    setTyped('')
    let i = 0
    interval = window.setInterval(() => {
      setTyped(cmd.slice(0, ++i))
      if (i >= cmd.length) clearInterval(interval)
    }, 30)
  })
  onCleanup(() => {
    clearInterval(interval)
    clearTimeout(timer)
  })
  const copy = () => {
    navigator.clipboard?.writeText(MCP_URL).catch(() => {})
    setCopied(true)
    timer = window.setTimeout(() => setCopied(false), 1600)
  }
  return (
    <>
      <div class="mcp-tabs" role="tablist" aria-label="Connect Pitch to">
        <For each={TABS}>
          {item => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === item.id}
              class={`mcp-tab${tab() === item.id ? ' is-on' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <Glyph id={item.id} />
              {item.label}
            </button>
          )}
        </For>
      </div>
      <div class="mcp-panel">
        <div class="mcp-chrome">
          <i />
          <i />
          <i />
          <span>pitch · {tab()}</span>
        </div>
        <div class={`mcp-term${props.instant ? ' mcp-term--instant' : ''}`}>
          <p class="mcp-cmd">
            <span class="mcp-prompt">$</span> {typed()}
            <Show when={typed().length < CONTENT[tab()].cmd.length}>
              <span class="mcp-caret" />
            </Show>
          </p>
          <Show when={typed().length >= CONTENT[tab()].cmd.length}>
            <For each={CONTENT[tab()].lines}>
              {line => (
                <Switch>
                  <Match when={line.kind === 'url'}>
                    <div class="mcp-url mcp-line">
                      <code>{MCP_URL}</code>
                      <button type="button" onClick={copy}>
                        {copied() ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  </Match>
                  <Match when={line.kind === 'code'}>
                    <pre class="mcp-code mcp-line">{(line as any).text}</pre>
                  </Match>
                  <Match when={line.kind === 'step'}>
                    <p class="mcp-step mcp-line">
                      <span class="mcp-n">{(line as any).n}</span>
                      {(line as any).text}
                    </p>
                  </Match>
                  <Match when={line.kind === 'ok'}>
                    <p class="mcp-ok mcp-line">
                      <span class="mcp-check">✓</span>
                      {(line as any).text}
                    </p>
                  </Match>
                  <Match when={line.kind === 'note'}>
                    <p class="mcp-note mcp-line">{(line as any).text}</p>
                  </Match>
                </Switch>
              )}
            </For>
          </Show>
        </div>
      </div>
    </>
  )
}
