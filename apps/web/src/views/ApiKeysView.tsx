import { useAuth } from '@clerk/react'
import { Check, Copy, Key, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { API_URL } from '../config'
import { api } from '../lib/api'

interface ApiKey {
  id: string
  name: string
  prefix: string
  lastUsedAt?: string | null
  revokedAt?: string | null
  createdAt: string
}

interface CreateApiKeyResponse extends ApiKey {
  key: string
}

// The config snippet users paste into their MCP client needs an absolute URL —
// API_URL can be relative ('/api') in dev behind the Vite proxy.
const MCP_URL = API_URL.startsWith('http') ? API_URL : `${window.location.origin}${API_URL}`
const MCP_ENDPOINT = `${MCP_URL}/mcp`
const MCP_CONFIG_SNIPPET = `{
  "mcpServers": {
    "pitch": {
      "url": "${MCP_ENDPOINT}",
      "headers": { "Authorization": "Bearer <your-api-key>" }
    }
  }
}`

const formatDate = (iso: string) => new Date(iso).toLocaleDateString()

const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable (e.g. non-secure context) — leave uncopied
    }
  }
  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-emerald-600" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {copied ? 'Copied' : (label ?? 'Copy')}
    </button>
  )
}

interface CreateKeyModalProps {
  name: string
  onNameChange: (v: string) => void
  creating: boolean
  onCreate: () => void
  onClose: () => void
}

const CreateKeyModal = ({
  name,
  onNameChange,
  creating,
  onCreate,
  onClose,
}: CreateKeyModalProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-[fadeIn_160ms_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-key-modal-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
            <Key className="w-4 h-4" />
          </span>
          <h2 id="create-key-modal-title" className="text-lg font-semibold text-gray-900">
            Create API key
          </h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Give the key a name so you can recognize it later — e.g. the client or machine that will
          use it.
        </p>
        <label htmlFor="key-name-input" className="block text-xs font-medium text-gray-700 mb-1.5">
          Key name
        </label>
        <input
          id="key-name-input"
          ref={inputRef}
          type="text"
          placeholder="e.g. Claude Desktop"
          value={name}
          onChange={e => onNameChange(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none transition-colors focus:border-gray-400"
          onKeyDown={e => {
            if (e.key === 'Enter' && !creating) onCreate()
          }}
        />
        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            disabled={creating}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={onCreate}
            disabled={creating || !name.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30"
          >
            {creating && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            {creating ? 'Creating…' : 'Create key'}
          </button>
        </div>
      </div>
    </div>
  )
}

const KeyRevealModal = ({
  created,
  onClose,
}: {
  created: CreateApiKeyResponse
  onClose: () => void
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-[fadeIn_160ms_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-reveal-modal-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-1.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
            <Check className="w-4 h-4" />
          </span>
          <h2 id="key-reveal-modal-title" className="text-lg font-semibold text-gray-900">
            Key created
          </h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-medium text-gray-700">{created.name}</span> is ready to use.
        </p>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
          <code className="flex-1 min-w-0 truncate text-xs font-mono text-gray-800">
            {created.key}
          </code>
          <CopyButton text={created.key} />
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <TriangleAlert className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>
            This is the only time the full key will be shown. Copy it now and store it somewhere
            safe — if you lose it, revoke it and create a new one.
          </span>
        </div>
        <div className="flex items-center justify-end mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer border-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900/30"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

export const ApiKeysView = ({ embedded = false }: { embedded?: boolean }) => {
  const { getToken } = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [keyName, setKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreateApiKeyResponse | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const fetchKeys = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return
      const data = await api.get<ApiKey[]>('/api-keys', token)
      setKeys(data)
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void fetchKeys()
  }, [fetchKeys])

  const handleCreate = async () => {
    const name = keyName.trim()
    if (!name || creating) return
    setActionError(null)
    setCreating(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      const res = await api.post<CreateApiKeyResponse>('/api-keys', token, { name })
      setCreated(res)
      setCreateOpen(false)
      setKeyName('')
      await fetchKeys()
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to create API key')
      setCreateOpen(false)
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    setActionError(null)
    setRevokingId(id)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')
      await api.delete(`/api-keys/${id}`, token)
      setConfirmingId(null)
      await fetchKeys()
    } catch (err: any) {
      setActionError(err?.message ?? 'Failed to revoke API key')
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <div className={embedded ? 'settings-api-keys' : 'p-6 md:p-8 max-w-5xl mx-auto w-full'}>
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">API Keys</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-xl">
            {embedded
              ? 'Call the Pitch REST API directly at https://api.trypitch.co/v1, or use a key as an MCP credential when browser sign-in is unavailable.'
              : 'API keys let MCP clients and software integrations create Pitch projects programmatically.'}
          </p>
        </div>
        <button
          onClick={() => {
            setActionError(null)
            setKeyName('')
            setCreateOpen(true)
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
          id="create-api-key-btn"
        >
          <Plus className="w-3.5 h-3.5" /> Create key
        </button>
      </div>

      {actionError && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* MCP server explainer */}
      {!embedded && (
        <div className="mb-8 bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-50">
            <h4 className="font-bold text-gray-900 text-sm">Connect your MCP client</h4>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Server endpoint:</span>
              <code className="text-xs font-mono text-gray-800 bg-gray-50 border border-gray-200 rounded px-2 py-1">
                {MCP_ENDPOINT}
              </code>
              <CopyButton text={MCP_ENDPOINT} />
            </div>
            <div className="relative rounded-lg border border-gray-200 bg-gray-900 px-4 py-3">
              <pre className="text-xs font-mono text-gray-100 overflow-x-auto whitespace-pre">
                {MCP_CONFIG_SNIPPET}
              </pre>
              <div className="absolute top-2 right-2">
                <CopyButton text={MCP_CONFIG_SNIPPET} label="Copy config" />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Replace <code className="font-mono">&lt;your-api-key&gt;</code> with a key created
              below.
            </p>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Your keys</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50">
            <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center mb-4 shadow-sm border border-gray-200">
              <Key className="w-6 h-6 text-gray-300" />
            </div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">No API keys yet</h3>
            <p className="text-xs text-gray-400 max-w-xs">
              Click <span className="font-medium">Create key</span> to generate one, then paste it
              into your MCP client config above.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="divide-y divide-gray-50">
              {keys.map(k => {
                const revoked = !!k.revokedAt
                const confirming = confirmingId === k.id
                const revoking = revokingId === k.id
                return (
                  <div
                    key={k.id}
                    className="flex items-center justify-between px-6 py-3 text-sm gap-4 flex-wrap"
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 truncate">{k.name}</span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                            revoked
                              ? 'bg-gray-100 text-gray-500 border-gray-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {revoked ? 'Revoked' : 'Active'}
                        </span>
                      </div>
                      <code className="text-xs font-mono text-gray-400">{k.prefix}…</code>
                      <span className="text-xs text-gray-400">
                        Created {formatDate(k.createdAt)} · Last used{' '}
                        {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Never'}
                      </span>
                    </div>
                    {!revoked && (
                      <div className="flex items-center gap-2 shrink-0">
                        {confirming ? (
                          <>
                            <span className="text-xs text-gray-500">Revoke this key?</span>
                            <button
                              onClick={() => handleRevoke(k.id)}
                              disabled={revoking}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors cursor-pointer border-none disabled:opacity-50 flex items-center gap-1.5"
                            >
                              {revoking && <RefreshCw className="w-3 h-3 animate-spin" />}
                              {revoking ? 'Revoking…' : 'Revoke'}
                            </button>
                            <button
                              onClick={() => setConfirmingId(null)}
                              disabled={revoking}
                              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmingId(k.id)}
                            className="px-3 py-1.5 text-xs font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateKeyModal
          name={keyName}
          onNameChange={setKeyName}
          creating={creating}
          onCreate={handleCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {created && <KeyRevealModal created={created} onClose={() => setCreated(null)} />}
    </div>
  )
}
