import { Bot, Check, Copy, SquareTerminal } from 'lucide-solid'
import { createEffect, createSignal, createUniqueId, For, onCleanup, Show } from 'solid-js'
import chatgptIco from '../../assets/chatgpt.png'
import claudeIco from '../../assets/claude.svg'
import cursorIco from '../../assets/cursor.png'
import perplexityIco from '../../assets/perplexity.png'

export const MCP_URL = 'https://api.trypitch.co/mcp'
export const API_URL = 'https://api.trypitch.co/v1'
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
    fallback={props.id === 'api' ? <SquareTerminal size={14} /> : <Bot size={14} />}
  >
    <img
      src={BRAND[props.id]}
      alt=""
      class={`mcp-tab-ico${props.id === 'chatgpt' ? ' mcp-icon--invert' : ''}${props.id === 'cursor' || props.id === 'perplexity' ? ' mcp-icon--tile' : ''}`}
      width="16"
      height="16"
    />
  </Show>
)

type Line =
  | { kind: 'step'; n: number; text: string }
  | { kind: 'url' }
  | { kind: 'ok' | 'note' | 'code'; text: string }

const command = (...lines: string[]) => lines.join('\n')

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
      { kind: 'step', n: 2, text: 'Add Pitch with that key as the Authorization header:' },
      {
        kind: 'code',
        text: command(
          'claude mcp add --transport http pitch \\',
          `  ${MCP_URL} \\`,
          '  --header "Authorization: Bearer pk_your_key"',
        ),
      },
      {
        kind: 'ok',
        text: 'Or add a custom connector in claude.ai under Settings, then Connectors.',
      },
    ],
  },
  cursor: {
    cmd: 'connect cursor',
    lines: [
      { kind: 'step', n: 1, text: 'Open Settings, MCP, then New server.' },
      {
        kind: 'code',
        text: command(
          '{',
          '  "mcpServers": {',
          '    "pitch": {',
          `      "url": "${MCP_URL}",`,
          '      "headers": { "Authorization": "Bearer pk_your_key" }',
          '    }',
          '  }',
          '}',
        ),
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
      { kind: 'step', n: 2, text: 'Paste the Streamable HTTP endpoint:' },
      { kind: 'url' },
      { kind: 'step', n: 3, text: 'Set Authorization to Bearer pk_your_key.' },
      { kind: 'ok', text: 'The same connector works with the Responses and Agents APIs.' },
    ],
  },
  perplexity: {
    cmd: 'connect perplexity',
    lines: [
      { kind: 'step', n: 1, text: 'Open Settings, Connectors, Add connector, then Custom (MCP).' },
      { kind: 'step', n: 2, text: 'Paste the Streamable HTTP endpoint:' },
      { kind: 'url' },
      { kind: 'step', n: 3, text: 'Set Authorization to Bearer pk_your_key.' },
      { kind: 'ok', text: 'The same setup works in Comet and the Perplexity API.' },
    ],
  },
  any: {
    cmd: 'connect any-mcp-client',
    lines: [
      { kind: 'step', n: 1, text: 'Use this Streamable HTTP endpoint with bearer-token auth:' },
      { kind: 'url' },
      { kind: 'ok', text: `Registry name: ${REGISTRY_NAME}.` },
    ],
  },
  api: {
    cmd: 'use the pitch rest api',
    lines: [
      { kind: 'step', n: 1, text: 'Use the same key to create a project:' },
      {
        kind: 'code',
        text: command(
          `curl -X POST ${API_URL}/projects \\`,
          '  -H "Authorization: Bearer pk_your_key" \\',
          '  -H "Content-Type: application/json" \\',
          `  -d '{ "prompt": "Create a 60 second demo of https://trypitch.co" }'`,
        ),
      },
      { kind: 'step', n: 2, text: 'Poll the returned project id until it is ready:' },
      {
        kind: 'code',
        text: command(
          `curl ${API_URL}/projects/PROJECT_ID \\`,
          '  -H "Authorization: Bearer pk_your_key"',
        ),
      },
      {
        kind: 'ok',
        text: 'Read the result from outputs. Creation, prompts, and exports are usage-metered.',
      },
    ],
  },
}

export const McpSetup = (props: { instant?: boolean }) => {
  const panelId = createUniqueId()
  const [tab, setTab] = createSignal('claude')
  const [typed, setTyped] = createSignal('')
  const [copied, setCopied] = createSignal<string | null>(null)
  let interval: number | undefined
  let timer: number | undefined

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

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(text)
    clearTimeout(timer)
    timer = window.setTimeout(() => setCopied(null), 1600)
  }

  return (
    <div class="mcp-setup">
      <div class="mcp-tabs" role="tablist" aria-label="Connect Pitch to">
        <For each={TABS}>
          {item => (
            <button
              type="button"
              role="tab"
              aria-selected={tab() === item.id}
              aria-controls={panelId}
              class={`mcp-tab${tab() === item.id ? ' is-on' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <Glyph id={item.id} />
              {item.label}
            </button>
          )}
        </For>
      </div>
      <div class="mcp-panel" id={panelId} role="tabpanel" aria-live="polite">
        <div class="mcp-chrome">
          <span class="mcp-chrome-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>pitch / {tab()}</span>
        </div>
        <div class={`mcp-term${props.instant ? ' mcp-term--instant' : ''}`}>
          <p class="mcp-cmd">
            <span class="mcp-prompt">$</span> {typed()}
            <Show when={typed().length < CONTENT[tab()].cmd.length}>
              <span class="mcp-caret" />
            </Show>
          </p>
          <Show when={typed().length >= CONTENT[tab()].cmd.length}>
            <div class="mcp-lines">
              <For each={CONTENT[tab()].lines}>
                {line => {
                  if (line.kind === 'url') {
                    return (
                      <div class="mcp-url mcp-line">
                        <code>{MCP_URL}</code>
                        <button
                          type="button"
                          onClick={() => copy(MCP_URL)}
                          aria-label="Copy MCP URL"
                        >
                          <Show when={copied() === MCP_URL} fallback={<Copy size={13} />}>
                            <Check size={13} />
                          </Show>
                          {copied() === MCP_URL ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )
                  }
                  if (line.kind === 'code') {
                    return (
                      <div class="mcp-code-wrap mcp-line">
                        <pre class="mcp-code">{line.text}</pre>
                        <button
                          type="button"
                          onClick={() => copy(line.text)}
                          aria-label="Copy command"
                        >
                          <Show when={copied() === line.text} fallback={<Copy size={13} />}>
                            <Check size={13} />
                          </Show>
                        </button>
                      </div>
                    )
                  }
                  if (line.kind === 'step') {
                    return (
                      <p class="mcp-step mcp-line">
                        <span class="mcp-n">{line.n}</span>
                        <span>{line.text}</span>
                      </p>
                    )
                  }
                  if (line.kind === 'ok') {
                    return (
                      <p class="mcp-ok mcp-line">
                        <span class="mcp-check">✓</span>
                        <span>{line.text}</span>
                      </p>
                    )
                  }
                  return <p class="mcp-note mcp-line">{line.text}</p>
                }}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  )
}
