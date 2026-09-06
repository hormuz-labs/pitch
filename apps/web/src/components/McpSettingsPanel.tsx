import { ArrowLeft, Bot, Check, Copy, KeyRound, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import chatgptIcon from '../assets/chatgpt.png'
import claudeIcon from '../assets/claude.svg'
import cursorIcon from '../assets/cursor.png'
import perplexityIcon from '../assets/perplexity.png'

const ENDPOINT = 'https://api.trypitch.co/mcp'
const clients = [
  { id: 'claude', label: 'Claude', icon: claudeIcon },
  { id: 'cursor', label: 'Cursor', icon: cursorIcon },
  { id: 'chatgpt', label: 'ChatGPT', icon: chatgptIcon },
  { id: 'perplexity', label: 'Perplexity', icon: perplexityIcon },
  { id: 'other', label: 'Any agent', icon: null },
] as const

function CopyValue({ value, label = 'Copy value' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="mcp-copy"
      aria-label={label}
      title={copied ? 'Copied' : label}
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

export function McpSettingsPanel({ openApi }: { openApi: () => void }) {
  const [client, setClient] = useState<(typeof clients)[number]['id']>('claude')
  const [view, setView] = useState<'connect' | 'autonomous'>('connect')
  const clientName = clients.find(item => item.id === client)?.label ?? 'your agent'
  const config = useMemo(
    () => `{
  "mcpServers": {
    "pitch": {
      "url": "${ENDPOINT}",
      "headers": {
        "Authorization": "Bearer pk_your_key_here"
      }
    }
  }
}`,
    [],
  )
  const autonomousPrompt = useMemo(
    () => `Set yourself up to use Pitch over MCP. Complete the setup yourself after I provide a dedicated API key.

1. Ask me for a dedicated Pitch API key. Never print it or write it into project files.
2. Store the key in your secret manager as PITCH_API_KEY.
3. Connect to ${ENDPOINT} using this header:
   Authorization: Bearer <PITCH_API_KEY>
4. Call get_credits to confirm the connection and available balance.
5. Use create_project for the first request, poll get_project until it is ready or failed, and use prompt_project for revisions.
6. Tell me when setup is complete and include no secret values in your response.

The account owner can revoke the key at any time from Pitch Settings → API.`,
    [],
  )

  return (
    <div className="mcp-settings">
      <div className="mcp-settings__heading">
        <h4>Set up your AI agent</h4>
        <p>Connect an AI agent to Pitch over the Model Context Protocol (MCP).</p>
      </div>

      {view === 'connect' ? (
        <>
          <div className="mcp-clients" role="tablist" aria-label="MCP client">
            {clients.map(item => {
              return (
                <button
                  type="button"
                  role="tab"
                  aria-selected={client === item.id}
                  className={client === item.id ? 'is-active' : ''}
                  onClick={() => setClient(item.id)}
                  key={item.id}
                >
                  {item.icon ? (
                    <img src={item.icon} alt="" width={15} height={15} />
                  ) : (
                    <Bot size={14} aria-hidden="true" />
                  )}
                  {item.label}
                </button>
              )
            })}
          </div>

          <div className="mcp-steps">
            <div className="mcp-step">
              <span>1</span>
              <div>
                <strong>Create a dedicated Pitch API key</strong>
                <p>
                  Open <b>API keys</b>, choose <b>New key</b>, and name it for {clientName}. The
                  secret is shown only once.
                </p>
                <button type="button" className="mcp-inline-action" onClick={openApi}>
                  <Plus size={13} /> Open API keys
                </button>
              </div>
            </div>

            <div className="mcp-step">
              <span>2</span>
              <div>
                <strong>Add Pitch as a custom connector</strong>
                <p>
                  In {clientName}, open its MCP or connector settings, add a custom server named{' '}
                  <b>Pitch</b>, and paste this URL:
                </p>
                <div className="mcp-code">
                  <code>{ENDPOINT}</code>
                  <CopyValue value={ENDPOINT} label="Copy MCP URL" />
                </div>
              </div>
            </div>

            <div className="mcp-step">
              <span>3</span>
              <div>
                <strong>Connect with your key</strong>
                <p>
                  Use the key as a Bearer token. Pitch scopes projects and credit usage to its
                  owner.
                </p>
                <div className="mcp-code">
                  <code>Authorization: Bearer pk_…</code>
                  <CopyValue
                    value="Authorization: Bearer pk_your_key_here"
                    label="Copy authorization header"
                  />
                </div>
                {(client === 'cursor' || client === 'other') && (
                  <details className="mcp-config-details">
                    <summary>Show complete configuration</summary>
                    <div className="mcp-code mcp-code--block">
                      <pre>{config}</pre>
                      <CopyValue value={config} label="Copy complete configuration" />
                    </div>
                  </details>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            className="mcp-autonomous-trigger"
            onClick={() => setView('autonomous')}
          >
            <Bot size={15} aria-hidden="true" /> Let your agent sign itself up
          </button>
        </>
      ) : (
        <div className="mcp-autonomous-view">
          <button type="button" className="mcp-back" onClick={() => setView('connect')}>
            <ArrowLeft size={15} aria-hidden="true" /> Back
          </button>

          <p className="mcp-autonomous-view__intro">
            Give your agent this prompt and it can configure Pitch with{' '}
            <b>its own dedicated credentials</b>. Pitch currently requires the account owner to
            create and fund the key; everything after that can run without browser sign-in or a
            device code.
          </p>

          <div className="mcp-autonomous-card">
            <div className="mcp-autonomous-step">
              <span>1</span>
              <div>
                <strong>Send this prompt</strong>
                <p>Paste it into your agent’s chat—it will handle the setup from there.</p>
                <div className="mcp-code mcp-code--prompt">
                  <pre>{autonomousPrompt}</pre>
                  <CopyValue value={autonomousPrompt} label="Copy agent setup prompt" />
                </div>
              </div>
            </div>

            <div className="mcp-autonomous-step">
              <span>2</span>
              <div>
                <strong>It runs independently</strong>
                <p>
                  The agent connects with its dedicated key, creates projects, follows their
                  progress, requests revisions, and checks credits without using your browser
                  session.
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            className="mcp-copy-prompt"
            onClick={() => void navigator.clipboard.writeText(autonomousPrompt)}
          >
            <Copy size={14} aria-hidden="true" /> Copy prompt
          </button>

          <div className="mcp-autonomous-security">
            <KeyRound size={14} aria-hidden="true" /> Never paste a personal session token. Use a
            revocable, dedicated Pitch API key.
          </div>
        </div>
      )}
    </div>
  )
}
