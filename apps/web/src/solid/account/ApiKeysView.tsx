import { Check, Key, Plus, RefreshCw, TriangleAlert } from 'lucide-solid'
import { createSignal, For, onMount, Show } from 'solid-js'
import { API_URL } from '../../config'
import { api } from '../../lib/api'
import { useAuth } from '../core/auth'
import { CopyButton, Dialog, Loading } from './primitives'

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
    <div class={props.embedded ? 'settings-api-keys' : 'mx-auto w-full max-w-5xl p-6 md:p-8'}>
      <header class="settings-api-header mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold">API keys</h1>
          <p class="mt-1 text-sm text-gray-500">
            API keys let MCP clients and integrations create Pitch projects programmatically.
          </p>
        </div>
        <button
          id="create-api-key-btn"
          class="flex items-center gap-1.5 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={14} />
          New key
        </button>
      </header>
      <Show when={error()}>
        <div
          role="alert"
          class="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error()}
        </div>
      </Show>
      <Show when={!props.embedded}>
        <section class="mb-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 class="text-sm font-bold">Connect your MCP client</h2>
          <div class="mt-3 flex items-center gap-2">
            <code class="rounded bg-gray-50 p-2 text-xs">{endpoint}</code>
            <CopyButton value={endpoint} />
          </div>
          <div class="mt-3 flex items-start gap-2 rounded-lg bg-gray-900 p-3 text-gray-100">
            <pre class="min-w-0 flex-1 overflow-auto text-xs">{config}</pre>
            <CopyButton value={config} label="Copy config" />
          </div>
        </section>
      </Show>
      <Show when={!loading()} fallback={<Loading label="Loading..." />}>
        <Show
          when={keys().length}
          fallback={
            <div class="settings-api-empty rounded-xl border border-dashed py-16 text-center">
              <Key class="mx-auto text-gray-300" />
              <p class="mt-3 text-sm text-gray-500">No API keys yet</p>
            </div>
          }
        >
          <div class="divide-y rounded-2xl border bg-white">
            <For each={keys()}>
              {key => (
                <div class="flex flex-wrap items-center justify-between gap-4 px-6 py-3">
                  <div>
                    <div class="flex items-center gap-2">
                      <b class="text-sm">{key.name}</b>
                      <span
                        class={`rounded-full border px-2 py-0.5 text-[10px] ${key.revokedAt ? 'bg-gray-100' : 'bg-emerald-50 text-emerald-700'}`}
                      >
                        {key.revokedAt ? 'Revoked' : 'Active'}
                      </span>
                    </div>
                    <code class="text-xs text-gray-400">{key.prefix}...</code>
                    <p class="text-xs text-gray-400">
                      Created {new Date(key.createdAt).toLocaleDateString()} · Last used{' '}
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                    </p>
                  </div>
                  <Show when={!key.revokedAt}>
                    <Show
                      when={confirming() === key.id}
                      fallback={
                        <button
                          class="rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-600"
                          onClick={() => setConfirming(key.id)}
                        >
                          Revoke
                        </button>
                      }
                    >
                      <div class="flex items-center gap-2">
                        <span class="text-xs">Revoke this key?</span>
                        <button
                          class="rounded-lg bg-red-600 px-3 py-1.5 text-xs text-white"
                          disabled={revoking() === key.id}
                          onClick={() => void revoke(key.id)}
                        >
                          {revoking() === key.id ? (
                            <RefreshCw class="animate-spin" size={12} />
                          ) : (
                            'Revoke'
                          )}
                        </button>
                        <button class="text-xs" onClick={() => setConfirming('')}>
                          Cancel
                        </button>
                      </div>
                    </Show>
                  </Show>
                </div>
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
          class="w-full rounded-lg border p-2 text-sm"
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
