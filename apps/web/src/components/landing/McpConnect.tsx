/**
 * McpConnect — "plug Pitch into your existing agents". A tabbed terminal panel
 * with copy-paste connect steps per client (Claude, Cursor, ChatGPT, Windsurf,
 * any MCP client, or the REST API). Pitch's MCP server is on the official MCP
 * registry as `co.trypitch/pitch`; it's Streamable-HTTP with an X-API-Key
 * header (keys at trypitch.co/api-keys).
 */
import { Bot, SquareTerminal } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import chatgptIco from '../../assets/chatgpt.png'
import claudeIco from '../../assets/claude.svg'
import cursorIco from '../../assets/cursor.png'
import perplexityIco from '../../assets/perplexity.png'

const MCP_URL = 'https://api.trypitch.co/mcp'
const REGISTRY_NAME = 'co.trypitch/pitch'

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

type Line =
  | { kind: 'step'; n: number; text: string }
  | { kind: 'url' }
  | { kind: 'ok'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'code'; text: string }

const BRAND: Record<string, string> = {
  claude: claudeIco,
  cursor: cursorIco,
  chatgpt: chatgptIco,
  perplexity: perplexityIco,
}

const Glyph = ({ id }: { id: string }) => {
  const src = BRAND[id]
  if (src) return <img src={src} alt="" className="mcp-tab-ico" width={14} height={14} />
  const Icon = id === 'api' ? SquareTerminal : Bot
  return <Icon size={13} strokeWidth={1.75} aria-hidden />
}

const TABS: { id: string; label: string }[] = [
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
      { kind: 'step', n: 2, text: 'Add the server with that key as the X-API-Key header:' },
      {
        kind: 'code',
        text: `claude mcp add --transport http pitch \\
  ${MCP_URL} \\
  --header "X-API-Key: pk_your_key"`,
      },
      { kind: 'ok', text: 'Or add it as a custom connector in claude.ai → Settings → Connectors.' },
    ],
  },
  cursor: {
    cmd: 'connect cursor',
    lines: [
      { kind: 'step', n: 1, text: 'Add to .cursor/mcp.json (Settings → MCP → New server):' },
      {
        kind: 'code',
        text: `{
  "mcpServers": {
    "pitch": {
      "url": "${MCP_URL}",
      "headers": { "X-API-Key": "pk_your_key" }
    }
  }
}`,
      },
      { kind: 'ok', text: 'Get the key at trypitch.co/api-keys.' },
    ],
  },
  chatgpt: {
    cmd: 'connect chatgpt',
    lines: [
      { kind: 'step', n: 1, text: 'Settings → Connectors → Advanced → Developer mode → Add' },
      { kind: 'step', n: 2, text: 'Paste this URL:' },
      { kind: 'url' },
      { kind: 'step', n: 3, text: 'Auth: custom header  X-API-Key = your pk_ key' },
      { kind: 'ok', text: 'Works in ChatGPT and the Responses / Agents API.' },
    ],
  },
  perplexity: {
    cmd: 'connect perplexity',
    lines: [
      { kind: 'step', n: 1, text: 'Settings → Connectors → Add connector → Custom (MCP)' },
      { kind: 'step', n: 2, text: 'Paste this URL:' },
      { kind: 'url' },
      { kind: 'step', n: 3, text: 'Auth header  X-API-Key = your pk_ key' },
      { kind: 'ok', text: 'Same setup works in Comet and the Perplexity API.' },
    ],
  },
  any: {
    cmd: 'connect any-mcp-client',
    lines: [
      { kind: 'step', n: 1, text: 'Streamable-HTTP endpoint, header auth (X-API-Key: pk_…):' },
      { kind: 'url' },
      { kind: 'ok', text: `On the official MCP registry — add ${REGISTRY_NAME}.` },
    ],
  },
  api: {
    cmd: 'pitch api',
    lines: [
      { kind: 'step', n: 1, text: 'Same key, plain REST:' },
      {
        kind: 'code',
        text: `curl -X POST https://api.trypitch.co/v1/videos \\
  -H "X-API-Key: pk_your_key" \\
  -d '{ "url": "https://trypitch.co", "brief": "60s launch video" }'`,
      },
      { kind: 'ok', text: 'Poll the returned job id for the finished render.' },
    ],
  },
}

export const McpConnect = () => {
  const [tab, setTab] = useState('claude')
  const [copied, setCopied] = useState(false)
  const [typed, setTyped] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typeIv = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (typeIv.current) clearInterval(typeIv.current)
    },
    [],
  )

  const { cmd, lines } = CONTENT[tab]
  const cmdDone = typed.length >= cmd.length

  // Type the `$ connect x` line whenever the tab changes.
  useEffect(() => {
    if (typeIv.current) clearInterval(typeIv.current)
    setTyped('')
    let i = 0
    typeIv.current = setInterval(() => {
      i += 1
      setTyped(cmd.slice(0, i))
      if (i >= cmd.length && typeIv.current) {
        clearInterval(typeIv.current)
        typeIv.current = null
      }
    }, 30)
    return () => {
      if (typeIv.current) clearInterval(typeIv.current)
    }
  }, [cmd])

  const copy = () => {
    navigator.clipboard?.writeText(MCP_URL).catch(() => {})
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section className="lb-band lb-mcp" id="api" aria-labelledby="mcp-heading">
      <div className="lb-wrap lb-mcp-head lb-reveal">
        <p className="lb-chy">MCP · API</p>
        <h2 id="mcp-heading" className="lb-h2">
          Plug Pitch into your existing agents.
        </h2>
        <p className="lb-sub lb-muted">
          Call Pitch from Claude, Cursor, ChatGPT or any agent over MCP — it visits the URL, films
          the demo and hands the file back. It&rsquo;s on the official MCP registry as{' '}
          <code className="lb-mcp-name">{REGISTRY_NAME}</code>.
        </p>
      </div>

      <div className="lb-wrap lb-mcp-body-wrap lb-reveal">
        <div className="mcp-tabs" role="tablist" aria-label="Connect Pitch to">
          {TABS.map(t => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={cx('mcp-tab', tab === t.id && 'is-on')}
              onClick={() => setTab(t.id)}
            >
              <Glyph id={t.id} />
              {t.label}
            </button>
          ))}
        </div>

        <div className="mcp-panel">
          <div className="mcp-chrome">
            <i />
            <i />
            <i />
            <span>pitch · {tab}</span>
          </div>
          <div className="mcp-term">
            <p className="mcp-cmd">
              <span className="mcp-prompt">$</span> {typed}
              {!cmdDone && <span className="mcp-caret" aria-hidden="true" />}
            </p>
            {cmdDone &&
              lines.map((line, i) => {
                const style = { animationDelay: `${i * 0.05}s` }
                if (line.kind === 'url') {
                  return (
                    <div key={`${tab}-${i}`} className="mcp-url mcp-line" style={style}>
                      <code>{MCP_URL}</code>
                      <button type="button" onClick={copy}>
                        {copied ? '✓ Copied' : 'Copy'}
                      </button>
                    </div>
                  )
                }
                if (line.kind === 'code') {
                  return (
                    <pre key={`${tab}-${i}`} className="mcp-code mcp-line" style={style}>
                      {line.text}
                    </pre>
                  )
                }
                if (line.kind === 'step') {
                  return (
                    <p key={`${tab}-${i}`} className="mcp-step mcp-line" style={style}>
                      <span className="mcp-n">{line.n}</span>
                      {line.text}
                    </p>
                  )
                }
                if (line.kind === 'ok') {
                  return (
                    <p key={`${tab}-${i}`} className="mcp-ok mcp-line" style={style}>
                      <span className="mcp-check">✓</span>
                      {line.text}
                    </p>
                  )
                }
                return (
                  <p key={`${tab}-${i}`} className="mcp-note mcp-line" style={style}>
                    {line.text}
                  </p>
                )
              })}
          </div>
        </div>

        <div className="mcp-cta">
          <a className="lb-cta lb-cta--ghost" href="/docs">
            Read the docs ↗
          </a>
          <a className="lb-cta" href="/api-keys">
            Get an API key
          </a>
        </div>
      </div>
    </section>
  )
}
