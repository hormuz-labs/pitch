import { Check, Key, Plus, RefreshCw, Server, TriangleAlert } from 'lucide-solid'
import { createSignal, For, onMount, Show } from 'solid-js'
import { API_URL } from '../../config'
import { api } from '../../lib/api'
import { useAuth } from '../core/auth'
import { CopyButton, Dialog, Loading } from './primitives'
import '../../styles/api-keys.css'

interface ApiKey {
  id: string
  name: string
  prefix: string
  lastUsedAt?: string | null
  revokedAt?: string | null
  createdAt: string
}
interface CreatedKey extends ApiKey {
  key: string
}
const endpoint = `${API_URL.startsWith('http') ? API_URL : `${window.location.origin}${API_URL}`}/mcp`
const config = `{"mcpServers":{"pitch":{"url":"${endpoint}","headers":{"Authorization":"Bearer <your-api-key>"}}}}`

export function ApiKeysView(props: { embedded?: boolean }) {
  const { getToken } = useAuth()
  const [keys, setKeys] = createSignal<ApiKey[]>([])
  const [loading, setLoading] = createSignal(true)
  const [error, setError] = createSignal('')
  const [createOpen, setCreateOpen] = createSignal(false)
  const [name, setName] = createSignal('')
  const [creating, setCreating] = createSignal(false)
  const [created, setCreated] = createSignal<CreatedKey | null>(null)
  const [confirming, setConfirming] = createSignal('')
  const [revoking, setRevoking] = createSignal('')
  const load = async () => {
    try {
      const token = await getToken()
      if (token) setKeys(await api.get<ApiKey[]>('/api-keys', token))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }
  onMount(() => void load())
  const create = async () => {
    if (!name().trim()) return
    setCreating(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      setCreated(await api.post<CreatedKey>('/api-keys', token, { name: name().trim() }))
      setCreateOpen(false)
      setName('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to create API key')
      setCreateOpen(false)
    } finally {
      setCreating(false)
    }
  }
  const revoke = async (id: string) => {
    setRevoking(id)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      await api.delete(`/api-keys/${id}`, token)
      setConfirming('')
      await load()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to revoke API key')
    } finally {
      setRevoking('')
    }
  }
  return (
    <div class={`api-keys-page${props.embedded ? ' settings-api-keys is-embedded' : ''}`}>
      <header class="api-keys-header">
        <div class="api-keys-heading">
          <span class="api-keys-heading-icon" aria-hidden="true">
            <Key size={17} />
          </span>
          <div>
            <h1>API keys</h1>
            <p>Let MCP clients and integrations create Pitch projects programmatically.</p>
          </div>
        </div>
        <button
          id="create-api-key-btn"
          class="api-keys-primary"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} />
          New key
        </button>
      </header>
      <Show when={error()}>
        <div role="alert" class="api-keys-alert">
          {error()}
        </div>
      </Show>
      <Show when={!props.embedded}>
        <section class="api-keys-connect" aria-labelledby="mcp-connect-heading">
          <div class="api-keys-connect-intro">
            <span class="api-keys-connect-icon" aria-hidden="true">
              <Server size={18} />
            </span>
            <div>
              <h2 id="mcp-connect-heading">Connect your MCP client</h2>
              <p>Use the server URL directly, or copy the complete configuration.</p>
            </div>
          </div>
          <div class="api-keys-field">
            <span>Server URL</span>
            <div>
              <code>{endpoint}</code>
              <CopyButton value={endpoint} />
            </div>
          </div>
          <div class="api-keys-config">
            <div>
              <span>JSON configuration</span>
              <CopyButton value={config} label="Copy config" />
            </div>
            <pre>{config}</pre>
          </div>
        </section>
      </Show>
      <Show when={!loading()} fallback={<Loading label="Loading..." />}>
        <div class="api-keys-list-head">
          <h2>Your keys</h2>
          <span>{keys().length} total</span>
        </div>
        <Show
          when={keys().length}
          fallback={
            <div class="api-keys-empty settings-api-empty">
              <span aria-hidden="true">
                <Key size={20} />
              </span>
              <p>No API keys yet</p>
              <small>Create a dedicated key for each client or integration.</small>
            </div>
          }
        >
          <div class="api-keys-list">
            <For each={keys()}>
              {key => (
                <article class="api-key-row">
                  <div class="api-key-main">
                    <div class="api-key-title">
                      <b>{key.name}</b>
                      <span class={`api-key-status${key.revokedAt ? ' is-revoked' : ' is-active'}`}>
                        {key.revokedAt ? 'Revoked' : 'Active'}
                      </span>
                    </div>
                    <code>{key.prefix}••••••••••••••••</code>
                    <div class="api-key-meta">
                      <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                      <span>
                        Last used{' '}
                        {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                      </span>
                    </div>
                  </div>
                  <Show when={!key.revokedAt}>
                    <Show
                      when={confirming() === key.id}
                      fallback={
                        <button class="api-key-revoke" onClick={() => setConfirming(key.id)}>
                          Revoke
                        </button>
                      }
                    >
                      <div class="api-key-confirm">
                        <span>Revoke this key?</span>
                        <button
                          class="api-key-confirm-danger"
                          disabled={revoking() === key.id}
                          onClick={() => void revoke(key.id)}
                        >
                          {revoking() === key.id ? (
                            <RefreshCw class="animate-spin" size={12} />
                          ) : (
                            'Revoke'
                          )}
                        </button>
                        <button class="api-key-confirm-cancel" onClick={() => setConfirming('')}>
                          Cancel
                        </button>
                      </div>
                    </Show>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </Show>
      </Show>
      <Dialog open={createOpen()} title="Create API key" onClose={() => setCreateOpen(false)}>
        <div class="flex items-center gap-2">
          <Key size={18} />
          <h2 class="text-lg font-semibold">Create API key</h2>
        </div>
        <p class="my-3 text-sm text-gray-500">Name the client or machine that will use this key.</p>
        <input
          autofocus
          class="api-key-name-input"
          placeholder="e.g. Claude Desktop"
          value={name()}
          onInput={event => setName(event.currentTarget.value)}
          onKeyDown={event => event.key === 'Enter' && void create()}
        />
        <div class="mt-5 flex justify-end gap-2">
          <button onClick={() => setCreateOpen(false)}>Cancel</button>
          <button
            class="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
            disabled={creating() || !name().trim()}
            onClick={() => void create()}
          >
            {creating() ? 'Creating...' : 'Create key'}
          </button>
        </div>
      </Dialog>
      <Dialog open={!!created()} title="Key created" onClose={() => setCreated(null)}>
        <div class="flex items-center gap-2 text-emerald-700">
          <Check />
          <h2 class="text-lg font-semibold">Key created</h2>
        </div>
        <div class="my-4 flex gap-2 rounded-lg border bg-gray-50 p-3">
          <code class="min-w-0 flex-1 truncate text-xs">{created()?.key}</code>
          <Show when={created()}>{value => <CopyButton value={value().key} />}</Show>
        </div>
        <p class="flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
          <TriangleAlert size={15} />
          This is the only time the full key will be shown.
        </p>
        <button
          class="mt-5 rounded-lg bg-gray-900 px-4 py-2 text-sm text-white"
          onClick={() => setCreated(null)}
        >
          Done
        </button>
      </Dialog>
    </div>
  )
}
