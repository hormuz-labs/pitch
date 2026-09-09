import { ArrowLeft, Bot, KeyRound, Plus } from 'lucide-solid'
import { createMemo, createSignal, For, Show } from 'solid-js'
import chatgptIcon from '../../assets/chatgpt.png'
import claudeIcon from '../../assets/claude.svg'
import cursorIcon from '../../assets/cursor.png'
import perplexityIcon from '../../assets/perplexity.png'
import { API_URL } from '../../config'
import { CopyButton } from './primitives'

const endpoint = 'https://api.trypitch.co/mcp'
const clients = [
  { id: 'claude', label: 'Claude', icon: claudeIcon },
  { id: 'cursor', label: 'Cursor', icon: cursorIcon },
  { id: 'chatgpt', label: 'ChatGPT', icon: chatgptIcon },
  { id: 'perplexity', label: 'Perplexity', icon: perplexityIcon },
  { id: 'other', label: 'Any agent', icon: null },
] as const
export function McpSettingsPanel(props: { openApi: () => void; showHeading?: boolean }) {
  const [client, setClient] = createSignal<(typeof clients)[number]['id']>('claude')
  const [autonomous, setAutonomous] = createSignal(false)
  const name = createMemo(() => clients.find(item => item.id === client())?.label)
  const prompt = `Set yourself up to use Pitch over MCP. Ask me for a dedicated Pitch API key, store it as PITCH_API_KEY, connect to ${endpoint} with Authorization: Bearer <PITCH_API_KEY>, then call get_credits. Never print or commit the key.`
  return (
    <div class="mcp-settings">
      <Show when={props.showHeading !== false}>
        <div class="mcp-settings__heading">
          <h4>Set up your AI agent</h4>
          <p>Connect an AI agent to Pitch over MCP.</p>
        </div>
      </Show>
      <Show
        when={!autonomous()}
        fallback={
          <div class="mcp-autonomous-view">
            <button class="mcp-back" onClick={() => setAutonomous(false)}>
              <ArrowLeft size={15} />
              Back
            </button>
            <p class="mcp-autonomous-view__intro">
              Give your agent this prompt to configure dedicated, revocable credentials.
            </p>
            <div class="mcp-code mcp-code--prompt">
              <pre>{prompt}</pre>
              <CopyButton value={prompt} />
            </div>
            <div class="mcp-autonomous-security">
              <KeyRound size={14} />
              Never paste a personal session token.
            </div>
          </div>
        }
      >
        <div class="mcp-clients" role="tablist">
          <For each={clients}>
            {item => (
              <button
                role="tab"
                aria-selected={client() === item.id}
                class={client() === item.id ? 'is-active' : ''}
                onClick={() => setClient(item.id)}
              >
                <Show when={item.icon} fallback={<Bot size={14} />}>
                  {icon => <img src={icon()} alt="" />}
                </Show>
                {item.label}
              </button>
            )}
          </For>
        </div>
        <div class="mcp-steps">
          <div class="mcp-step">
            <span>1</span>
            <div>
              <strong>Create a dedicated API key</strong>
              <p>Name it for {name()}.</p>
              <button class="mcp-inline-action" onClick={props.openApi}>
                <Plus size={13} />
                Open API keys
              </button>
            </div>
          </div>
          <div class="mcp-step">
            <span>2</span>
            <div>
              <strong>Add Pitch as a custom connector</strong>
              <div class="mcp-code">
                <code>{endpoint}</code>
                <CopyButton value={endpoint} />
              </div>
            </div>
          </div>
          <div class="mcp-step">
            <span>3</span>
            <div>
              <strong>Connect with your key</strong>
              <div class="mcp-code">
                <code>Authorization: Bearer pk_...</code>
                <CopyButton value="Authorization: Bearer pk_your_key_here" />
              </div>
            </div>
          </div>
        </div>
        <button class="mcp-autonomous-trigger" onClick={() => setAutonomous(true)}>
          <Bot size={15} />
          Let your agent sign itself up
        </button>
      </Show>
    </div>
  )
}
export function McpGuide() {
  const value = `{"mcpServers":{"pitch":{"url":"${API_URL.replace(/\/$/, '')}/mcp","headers":{"Authorization":"Bearer pk_your_api_key_here"}}}}`
  return (
    <div class="space-y-6 pb-8">
      <section class="rounded-2xl border bg-white p-6">
        <h3 class="font-bold">MCP Server</h3>
        <p class="my-3 text-sm text-gray-500">
          Connect external agents to Pitch. Calls are authenticated with an API key and charged to
          your account.
        </p>
        <pre class="overflow-auto rounded-lg bg-gray-50 p-3 text-xs">{value}</pre>
        <CopyButton value={value} label="Copy config" />
      </section>
      <section class="rounded-2xl border bg-white p-6">
        <h3 class="font-bold">Available MCP tools</h3>
        <p class="mt-3 text-sm text-gray-600">
          create_project, prompt_project, get_project, list_projects, get_credits, and get_pricing.
        </p>
      </section>
    </div>
  )
}
