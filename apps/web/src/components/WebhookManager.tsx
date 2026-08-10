import { useAuth } from '@clerk/react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Globe,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { API_URL } from '../config'

interface WebhookEndpoint {
  id: string
  url: string
  secret: string
  events: string[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface WebhookDelivery {
  id: string
  endpointId?: string
  userId: string
  jobId: string
  event: string
  payload: any
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  statusCode?: number
  responseBody?: string
  error?: string
  attempts: number
  maxAttempts: number
  nextRetryAt?: string
  createdAt: string
}

const CopyButton = ({ text, label }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }
  return (
    <button
      onClick={copy}
      title="Copy to clipboard"
      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition cursor-pointer"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : (label ?? 'Copy')}
    </button>
  )
}

export const WebhookManager = () => {
  const { getToken } = useAuth()
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState<string[]>(['job.completed', 'job.failed'])
  const [creating, setCreating] = useState(false)
  const [testResult, setTestResult] = useState<{
    id: string
    success: boolean
    msg: string
  } | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getToken()
      if (!token) return

      const [epRes, delRes] = await Promise.all([
        fetch(`${API_URL}/webhooks/endpoints`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/webhooks/deliveries`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (epRes.ok) {
        const epData = await epRes.json()
        setEndpoints(epData)
      }
      if (delRes.ok) {
        const delData = await delRes.json()
        setDeliveries(delData)
      }
    } catch (err) {
      console.error('Failed to load webhook data', err)
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreateEndpoint = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl.trim()) return

    setCreating(true)
    try {
      const token = await getToken()
      if (!token) return

      const res = await fetch(`${API_URL}/webhooks/endpoints`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: newUrl.trim(),
          events: newEvents,
        }),
      })

      if (res.ok) {
        setNewUrl('')
        setIsAdding(false)
        fetchData()
      } else {
        const errData = await res.json()
        alert(errData.error || 'Failed to create endpoint')
      }
    } catch (err: any) {
      alert(err.message || 'Error creating endpoint')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const token = await getToken()
      if (!token) return

      const res = await fetch(`${API_URL}/webhooks/endpoints/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !currentActive }),
      })

      if (res.ok) {
        fetchData()
      }
    } catch (err) {
      console.error('Failed to toggle active status', err)
    }
  }

  const handleDeleteEndpoint = async (id: string) => {
    if (!confirm('Are you sure you want to delete this webhook endpoint?')) return

    try {
      const token = await getToken()
      if (!token) return

      const res = await fetch(`${API_URL}/webhooks/endpoints/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        fetchData()
      }
    } catch (err) {
      console.error('Failed to delete endpoint', err)
    }
  }

  const handleSendTest = async (endpointId: string) => {
    setTestingId(endpointId)
    setTestResult(null)
    try {
      const token = await getToken()
      if (!token) return

      const res = await fetch(`${API_URL}/webhooks/test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ endpointId }),
      })

      const data = await res.json()
      if (res.ok && data.success) {
        setTestResult({
          id: endpointId,
          success: true,
          msg: `Ping delivered! HTTP ${data.result?.statusCode ?? 200}`,
        })
      } else {
        setTestResult({
          id: endpointId,
          success: false,
          msg: data.error || 'Webhook test failed',
        })
      }
      fetchData()
    } catch (err: any) {
      setTestResult({
        id: endpointId,
        success: false,
        msg: err.message || 'Webhook ping failed',
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleRetryDelivery = async (deliveryId: string) => {
    setRetryingId(deliveryId)
    try {
      const token = await getToken()
      if (!token) return

      const res = await fetch(`${API_URL}/webhooks/deliveries/${deliveryId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        fetchData()
      } else {
        const err = await res.json()
        alert(err.error || 'Retry failed')
      }
    } catch (err: any) {
      alert(err.message || 'Retry request failed')
    } finally {
      setRetryingId(null)
    }
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header card */}
      <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Webhook className="w-5 h-5 text-gray-900" />
              <h3 className="text-xl font-bold text-gray-900">Webhook Endpoints</h3>
            </div>
            <p className="text-sm text-gray-500">
              Receive real-time HTTP POST notifications when your AI agents finish generating videos
              or PDFs.
            </p>
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white font-medium text-sm rounded-xl transition cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Endpoint
          </button>
        </div>

        {/* Add Endpoint Form */}
        {isAdding && (
          <form
            onSubmit={handleCreateEndpoint}
            className="mt-6 pt-6 border-t border-gray-100 space-y-4"
          >
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Webhook URL
              </label>
              <input
                type="url"
                required
                placeholder="https://your-api.com/webhooks/pitch"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Subscribed Events
              </label>
              <div className="flex flex-wrap gap-3 text-sm text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEvents.includes('job.completed')}
                    onChange={e => {
                      if (e.target.checked) setNewEvents([...newEvents, 'job.completed'])
                      else setNewEvents(newEvents.filter(x => x !== 'job.completed'))
                    }}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <span>job.completed</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEvents.includes('job.failed')}
                    onChange={e => {
                      if (e.target.checked) setNewEvents([...newEvents, 'job.failed'])
                      else setNewEvents(newEvents.filter(x => x !== 'job.failed'))
                    }}
                    className="rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                  />
                  <span>job.failed</span>
                </label>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-gray-900 text-white font-medium text-sm rounded-xl hover:bg-gray-800 disabled:opacity-50 transition cursor-pointer"
              >
                {creating ? 'Saving…' : 'Save Endpoint'}
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 border border-gray-200 text-gray-600 font-medium text-sm rounded-xl hover:bg-gray-50 transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Endpoints List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h4 className="font-bold text-gray-900 text-sm">Active Webhooks</h4>
          <button
            onClick={fetchData}
            title="Refresh"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {endpoints.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No webhook endpoints configured yet. Add one above or pass{' '}
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">webhookUrl</code> in your
            job parameters.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {endpoints.map(ep => (
              <div key={ep.id} className="p-6 space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-xl border ${ep.isActive ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                    >
                      <Globe className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-semibold text-gray-900 truncate">
                        {ep.url}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                        <span>Events: {ep.events.join(', ')}</span>
                        <span>•</span>
                        <span>Created {new Date(ep.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleSendTest(ep.id)}
                      disabled={testingId === ep.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {testingId === ep.id ? 'Sending…' : 'Test Ping'}
                    </button>
                    <button
                      onClick={() => handleToggleActive(ep.id, ep.isActive)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer ${
                        ep.isActive
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {ep.isActive ? 'Active' : 'Disabled'}
                    </button>
                    <button
                      onClick={() => handleDeleteEndpoint(ep.id)}
                      title="Delete webhook endpoint"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Secret section */}
                <div className="bg-gray-50/80 rounded-xl p-3 border border-gray-100 flex items-center justify-between text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">
                      Signing Secret
                    </span>
                    <code className="font-mono bg-white px-2 py-0.5 rounded border border-gray-200 text-gray-800">
                      {ep.secret}
                    </code>
                  </div>
                  <CopyButton text={ep.secret} label="Copy Secret" />
                </div>

                {/* Test Result Message */}
                {testResult && testResult.id === ep.id && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${
                      testResult.success
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : 'bg-red-50 border-red-200 text-red-800'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 shrink-0" />
                    )}
                    <span>{testResult.msg}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deliveries History */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h4 className="font-bold text-gray-900 text-sm">Recent Deliveries & Retries</h4>
        </div>

        {deliveries.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-500">
            No delivery logs yet. When your jobs finish, delivery logs will appear here.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {deliveries.map(del => {
              const statusColor =
                del.status === 'SUCCESS'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : del.status === 'PENDING'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-red-50 text-red-700 border-red-200'

              return (
                <div key={del.id} className="p-4 text-sm flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${statusColor}`}
                      >
                        {del.status}
                      </span>
                      <span className="font-mono text-xs font-semibold text-gray-800">
                        {del.event}
                      </span>
                      <span className="text-xs text-gray-400">Job: {del.jobId.slice(0, 12)}</span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400">
                        {new Date(del.createdAt).toLocaleString()}
                      </span>
                      {del.status !== 'SUCCESS' && (
                        <button
                          onClick={() => handleRetryDelivery(del.id)}
                          disabled={retryingId === del.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded transition cursor-pointer"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${retryingId === del.id ? 'animate-spin' : ''}`}
                          />
                          Retry
                        </button>
                      )}
                    </div>
                  </div>

                  {del.error && (
                    <div className="text-xs text-red-600 font-mono bg-red-50/60 p-2 rounded border border-red-100">
                      Error: {del.error} (Attempt {del.attempts}/{del.maxAttempts})
                    </div>
                  )}

                  {del.statusCode && (
                    <div className="text-xs text-gray-500">
                      HTTP Status: <code className="font-mono">{del.statusCode}</code> | Attempts:{' '}
                      {del.attempts}/{del.maxAttempts}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
