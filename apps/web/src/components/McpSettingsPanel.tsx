import { Bot, Check, Copy, KeyRound, Plus, Settings2 } from 'lucide-react'
import { useMemo, useState } from 'react'

const ENDPOINT = 'https://api.trypitch.co/mcp'
const clients = [
  { id: 'claude', label: 'Claude' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'chatgpt', label: 'ChatGPT' },
  { id: 'perplexity', label: 'Perplexity' },
  { id: 'other', label: 'Any agent' },
] as const

function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="mcp-copy"
      aria-label="Copy value"
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
  const [autonomousOpen, setAutonomousOpen] = useState(false)
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

  return (
    <div className="mcp-settings">
      <div className="mcp-settings__heading">
        <h4>Set up your AI agent</h4>
        <p>Connect an AI agent to Pitch over the Model Context Protocol (MCP).</p>
      </div>
      <div className="mcp-clients" role="tablist" aria-label="MCP client">
        {clients.map(item => (
          <button
            type="button"
            role="tab"
            aria-selected={client === item.id}
            className={client === item.id ? 'is-active' : ''}
            onClick={() => setClient(item.id)}
            key={item.id}
          >
            <Bot size={13} /> {item.label}
          </button>
        ))}
      </div>
      <div className="mcp-steps">
        <div className="mcp-step">
          <span>1</span>
          <div>
            <strong>Create a Pitch API key</strong>
            <p>
              Open the API tab, choose <b>New key</b>, and name it for {clientName}. The secret is
              shown only once.
            </p>
            <button type="button" className="mcp-inline-action" onClick={openApi}>
              <Plus size={13} /> Open API keys
            </button>
          </div>
        </div>
        <div className="mcp-step">
          <span>2</span>
          <div>
            <strong>Add a custom MCP server</strong>
            <p>
              In {clientName}, open its MCP or connector settings and add a custom server named{' '}
              <b>Pitch</b>.
            </p>
            <div className="mcp-code">
              <code>{ENDPOINT}</code>
              <CopyValue value={ENDPOINT} />
            </div>
          </div>
        </div>
        <div className="mcp-step">
          <span>3</span>
          <div>
            <strong>Authenticate and connect</strong>
            <p>
              Add the API key as a Bearer token. Pitch scopes every project and credit charge to the
              key owner.
            </p>
            <div className="mcp-code">
              <code>Authorization: Bearer pk_…</code>
              <CopyValue value="Authorization: Bearer pk_your_key_here" />
            </div>
          </div>
        </div>
        <div className="mcp-step mcp-step--config">
          <span>4</span>
          <div>
            <strong>Or paste the complete configuration</strong>
            <div className="mcp-code mcp-code--block">
              <pre>{config}</pre>
              <CopyValue value={config} />
            </div>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="mcp-autonomous-trigger"
        aria-expanded={autonomousOpen}
        onClick={() => setAutonomousOpen(value => !value)}
      >
        <KeyRound size={15} /> Run your agent autonomously <span>{autonomousOpen ? '−' : '+'}</span>
      </button>
      {autonomousOpen && (
        <div className="mcp-autonomous">
          <div className="mcp-autonomous__intro">
            <Settings2 size={17} />
            <p>
              Run an agent against Pitch without browser sign-in or a device code. Pitch currently
              uses an operator-issued API key instead of OAuth client-credentials registration.
            </p>
          </div>
          <ol>
            <li>
              <span>1</span>
              <p>
                Have the account owner create a dedicated key in{' '}
                <button type="button" onClick={openApi}>
                  API keys
                </button>
                . This is the only interactive setup step.
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                Store the <code>pk_…</code> secret in the agent’s secret manager. It is shown once;
                Pitch stores only its SHA-256 hash.
              </p>
            </li>
            <li>
              <span>3</span>
              <p>
                Fund the owning Pitch account from <b>Credits</b> or <b>Plans & billing</b>. MCP
                usage draws from the same ledger as the web app.
              </p>
            </li>
            <li>
              <span>4</span>
              <p>
                Connect to <code>{ENDPOINT}</code> with <code>Authorization: Bearer pk_…</code>. No
                user session or device code is required after this.
              </p>
            </li>
            <li>
              <span>5</span>
              <p>
                Call <code>create_project</code>, then poll <code>get_project</code> until its
                status is <code>ready</code> or <code>failed</code>.
              </p>
            </li>
            <li>
              <span>6</span>
              <p>
                Use <code>prompt_project</code> for revisions and <code>get_credits</code> to
                monitor balance. Revoke the key from the API tab at any time.
              </p>
            </li>
          </ol>
          <p className="mcp-autonomous__note">
            Credit purchases and auto-top-ups are not currently exposed as MCP tools; they remain
            protected account actions in Pitch settings.
          </p>
        </div>
      )}
    </div>
  )
}
