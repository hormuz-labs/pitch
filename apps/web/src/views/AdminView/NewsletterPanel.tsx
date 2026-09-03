import { useAuth } from '@clerk/react'
import React from 'react'
import { api } from '../../lib/api'

type Contact = {
  id: string
  email: string
  firstName?: string | null
  source: string
  status: string
  createdAt: string
}

type Audience = {
  subscribers: Contact[]
  subscribed: number
  unsubscribed: number
}

export function NewsletterPanel({
  audience,
  onRefresh,
}: {
  audience: Audience | null
  onRefresh: () => void | Promise<void>
}) {
  const { getToken } = useAuth()
  const [subject, setSubject] = React.useState('')
  const [message, setMessage] = React.useState('')
  const [ctaLabel, setCtaLabel] = React.useState('See what is new at Pitch')
  const [ctaUrl, setCtaUrl] = React.useState('https://trypitch.co')
  const [sending, setSending] = React.useState(false)
  const [result, setResult] = React.useState('')
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [previewHtml, setPreviewHtml] = React.useState('')
  const [previewWidth, setPreviewWidth] = React.useState<'mobile' | 'desktop'>('desktop')
  const [previewing, setPreviewing] = React.useState(false)
  const [addingContact, setAddingContact] = React.useState(false)
  const [newEmail, setNewEmail] = React.useState('')
  const [newFirstName, setNewFirstName] = React.useState('')
  const [audienceMessage, setAudienceMessage] = React.useState('')
  const selectionInitialized = React.useRef(false)

  const subscribedContacts = React.useMemo(
    () => audience?.subscribers.filter(contact => contact.status === 'subscribed') ?? [],
    [audience?.subscribers],
  )

  React.useEffect(() => {
    const validIds = new Set(subscribedContacts.map(contact => contact.id))
    setSelectedIds(previous => {
      if (!selectionInitialized.current) {
        selectionInitialized.current = true
        return validIds
      }
      return new Set([...previous].filter(id => validIds.has(id)))
    })
  }, [subscribedContacts])

  const showPreview = async () => {
    if (!subject.trim() || !message.trim()) return
    setPreviewing(true)
    setResult('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Authentication required')
      const preview = await api.post<{ html: string }>('/admin/newsletter/preview', token, {
        subject,
        message,
        ctaLabel,
        ctaUrl,
      })
      setPreviewHtml(preview.html)
    } catch (error: any) {
      setResult(error?.message || 'The preview could not be created.')
    } finally {
      setPreviewing(false)
    }
  }

  const addContact = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!newEmail.trim()) return
    setAddingContact(true)
    setAudienceMessage('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Authentication required')
      await api.post('/admin/newsletter/subscribers', token, {
        email: newEmail,
        firstName: newFirstName,
      })
      setNewEmail('')
      setNewFirstName('')
      setAudienceMessage('Contact added.')
      await onRefresh()
    } catch (error: any) {
      setAudienceMessage(
        error?.status === 409
          ? 'This address previously unsubscribed and was not added.'
          : 'Contact could not be added.',
      )
    } finally {
      setAddingContact(false)
    }
  }

  const deleteContact = async (contact: Contact) => {
    if (!window.confirm(`Remove ${contact.email} from the audience?`)) return
    setAudienceMessage('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Authentication required')
      await api.delete(`/admin/newsletter/subscribers/${encodeURIComponent(contact.id)}`, token)
      setSelectedIds(previous => {
        const next = new Set(previous)
        next.delete(contact.id)
        return next
      })
      setAudienceMessage('Contact removed.')
      await onRefresh()
    } catch {
      setAudienceMessage('Contact could not be removed.')
    }
  }

  const send = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!subject.trim() || !message.trim() || !selectedIds.size) return
    if (!window.confirm(`Send this update to ${selectedIds.size} selected contacts?`)) return

    setSending(true)
    setResult('')
    try {
      const token = await getToken()
      if (!token) throw new Error('Authentication required')
      const response = await api.post<{ sent: number; failed: number }>(
        '/admin/newsletter/send',
        token,
        { subject, message, ctaLabel, ctaUrl, recipientIds: [...selectedIds] },
      )
      setResult(
        `Sent to ${response.sent} contact${response.sent === 1 ? '' : 's'}${response.failed ? ` · ${response.failed} failed` : ''}.`,
      )
      if (!response.failed) {
        setSubject('')
        setMessage('')
      }
      onRefresh()
    } catch (error: any) {
      setResult(error?.message || 'The update could not be sent.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)]">
      <form
        onSubmit={send}
        className="p-5 sm:p-6 border-b lg:border-b-0 lg:border-r border-gray-100"
      >
        <div className="mb-5">
          <h2 className="text-base font-bold text-gray-900">Send a product update</h2>
          <p className="text-xs text-gray-400 mt-1">
            Write like you are emailing one customer. Keep it warm, specific, and free of em dashes.
          </p>
        </div>
        <label
          className="block text-xs font-semibold text-gray-600 mb-1.5"
          htmlFor="newsletter-subject"
        >
          Subject
        </label>
        <input
          id="newsletter-subject"
          maxLength={180}
          value={subject}
          onChange={event => setSubject(event.target.value)}
          placeholder="A new way to create launch videos"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        />
        <label
          className="block text-xs font-semibold text-gray-600 mt-4 mb-1.5"
          htmlFor="newsletter-message"
        >
          Message
        </label>
        <textarea
          id="newsletter-message"
          rows={9}
          maxLength={20_000}
          value={message}
          onChange={event => setMessage(event.target.value)}
          placeholder={
            'I wanted to share something we have been working on.\n\nYou can now...\n\nI would love to hear what you think.'
          }
          className="w-full px-3 py-2.5 text-sm leading-6 border border-gray-200 rounded-xl resize-y focus:outline-none focus:ring-2 focus:ring-gray-900/10"
        />
        <p className="mt-1.5 text-[11px] text-gray-400">
          Add code with triple backticks, for example: ```json on one line, then your code, then
          ```.
        </p>
        <div className="grid sm:grid-cols-[0.8fr_1.2fr] gap-3 mt-4">
          <div>
            <label
              className="block text-xs font-semibold text-gray-600 mb-1.5"
              htmlFor="newsletter-cta-label"
            >
              Button text
            </label>
            <input
              id="newsletter-cta-label"
              maxLength={60}
              value={ctaLabel}
              onChange={event => setCtaLabel(event.target.value)}
              placeholder="Try the new feature"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
          <div>
            <label
              className="block text-xs font-semibold text-gray-600 mb-1.5"
              htmlFor="newsletter-cta-url"
            >
              Button link
            </label>
            <input
              id="newsletter-cta-url"
              type="url"
              inputMode="url"
              value={ctaUrl}
              onChange={event => setCtaUrl(event.target.value)}
              placeholder="https://trypitch.co/new"
              className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/10"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <button
            type="submit"
            disabled={sending || !subject.trim() || !message.trim() || !selectedIds.size}
            className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40"
          >
            {sending ? 'Sending…' : `Send to ${selectedIds.size} contacts`}
          </button>
          <button
            type="button"
            onClick={showPreview}
            disabled={previewing || !subject.trim() || !message.trim()}
            className="px-4 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-800 text-sm font-semibold disabled:opacity-40"
          >
            {previewing ? 'Preparing…' : 'Preview email'}
          </button>
          {result && <span className="text-xs text-gray-500">{result}</span>}
        </div>
      </form>

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Audience</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {audience?.subscribed ?? 0} subscribed · {audience?.unsubscribed ?? 0} opted out
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(subscribedContacts.map(contact => contact.id)))}
              className="text-xs font-semibold text-gray-500 hover:text-gray-900"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-semibold text-gray-500 hover:text-gray-900"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs font-semibold text-gray-500 hover:text-gray-900"
            >
              Refresh
            </button>
          </div>
        </div>
        <form
          onSubmit={addContact}
          className="grid gap-2 border-b border-gray-100 bg-gray-50 p-3 sm:grid-cols-[0.8fr_1.2fr_auto]"
        >
          <input
            value={newFirstName}
            onChange={event => setNewFirstName(event.target.value)}
            maxLength={100}
            placeholder="First name"
            aria-label="First name"
            className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={newEmail}
            onChange={event => setNewEmail(event.target.value)}
            placeholder="name@company.com"
            aria-label="Email address"
            required
            className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
          <button
            type="submit"
            disabled={addingContact || !newEmail.trim()}
            className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            {addingContact ? 'Adding…' : 'Add contact'}
          </button>
          {audienceMessage && (
            <p className="text-[11px] text-gray-500 sm:col-span-3">{audienceMessage}</p>
          )}
        </form>
        <div className="px-5 py-2 border-b border-gray-100 bg-gray-50 text-[11px] font-medium text-gray-500">
          {selectedIds.size} of {subscribedContacts.length} subscribed contacts selected
        </div>
        <div className="max-h-[520px] overflow-auto divide-y divide-gray-50">
          {audience?.subscribers.map(contact => (
            <div
              key={contact.id}
              className={`flex items-center justify-between gap-3 px-5 py-3 ${contact.status === 'subscribed' ? 'hover:bg-gray-50' : 'opacity-60'}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <input
                  type="checkbox"
                  aria-label={`Select ${contact.email}`}
                  checked={selectedIds.has(contact.id)}
                  disabled={contact.status !== 'subscribed'}
                  onChange={event =>
                    setSelectedIds(previous => {
                      const next = new Set(previous)
                      if (event.target.checked) next.add(contact.id)
                      else next.delete(contact.id)
                      return next
                    })
                  }
                  className="size-4 rounded border-gray-300 accent-gray-900 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {contact.firstName || '—'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{contact.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${contact.status === 'subscribed' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {contact.status}
                  </span>
                  <p className="text-[10px] text-gray-400 mt-1 capitalize">{contact.source}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteContact(contact)}
                  aria-label={`Remove ${contact.email}`}
                  title="Remove contact"
                  className="grid size-8 place-items-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {!audience?.subscribers.length && (
            <p className="p-8 text-center text-sm text-gray-400">No contacts yet.</p>
          )}
        </div>
      </div>

      {previewHtml && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-3 sm:p-6">
          <div className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Email preview</h3>
                <p className="text-[11px] text-gray-400">Exact HTML sent through Resend</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-gray-100 p-1">
                  {(['desktop', 'mobile'] as const).map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setPreviewWidth(size)}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${previewWidth === size ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewHtml('')}
                  aria-label="Close preview"
                  className="grid size-9 place-items-center rounded-lg border border-gray-200 text-lg text-gray-500 hover:text-gray-900"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="flex flex-1 justify-center overflow-auto bg-gray-200 p-3 sm:p-6">
              <iframe
                title="Newsletter email preview"
                srcDoc={previewHtml}
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                className="h-full min-h-[680px] border-0 bg-white shadow-lg transition-[width] duration-200"
                style={{ width: previewWidth === 'mobile' ? 390 : 760, maxWidth: '100%' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
