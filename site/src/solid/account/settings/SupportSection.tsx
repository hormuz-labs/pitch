import { AlertCircle, ExternalLink, ImagePlus, Mail, Send, Trash2 } from 'lucide-solid'
import { createSignal, For, Show } from 'solid-js'
import {
  getRecentAppErrors,
  type IssueReportCategory,
  submitIssueReport,
} from '../../core/analytics'
import { useAuth, useUser } from '../../core/auth'

const CATEGORIES: Array<{ value: IssueReportCategory; label: string }> = [
  { value: 'bug', label: 'Bug or crash' },
  { value: 'video', label: 'Video or voiceover issue' },
  { value: 'billing', label: 'Billing or credits' },
  { value: 'feedback', label: 'Product feedback' },
]

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Could not read screenshot'))
    reader.readAsDataURL(file)
  })
}

export function IssueReportCard() {
  let user: () => { primaryEmailAddress?: { emailAddress?: string } } | null | undefined = () =>
    null
  let getToken: () => Promise<string | null> = async () => null
  try {
    user = useUser().userAccessor
  } catch {
    user = () => null
  }
  try {
    getToken = useAuth().getToken
  } catch {
    getToken = async () => null
  }
  const [category, setCategory] = createSignal<IssueReportCategory>('bug')
  const [message, setMessage] = createSignal('')
  const [includeDiagnostics, setIncludeDiagnostics] = createSignal(true)
  const [screenshot, setScreenshot] = createSignal<{ name: string; dataUrl: string } | null>(null)
  const [attachmentError, setAttachmentError] = createSignal('')
  const [sentMessage, setSentMessage] = createSignal('')
  let fileInput!: HTMLInputElement

  const recentErrors = () => getRecentAppErrors()

  const attachFile = async (file: File | null | undefined) => {
    if (!file) return
    setAttachmentError('')
    if (!file.type.startsWith('image/')) {
      setAttachmentError('Please attach a PNG, JPG, or WebP screenshot.')
      return
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setAttachmentError('Screenshot must be under 2 MB.')
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      if (dataUrl) setScreenshot({ name: file.name || 'screenshot.png', dataUrl })
    } catch {
      setAttachmentError('Could not read that image.')
    }
  }

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault()
    const text = message().trim()
    if (!text) return
    submitIssueReport({
      category: category(),
      message: text,
      email: user()?.primaryEmailAddress?.emailAddress,
      includeDiagnostics: includeDiagnostics(),
      screenshot: screenshot(),
      token: Promise.resolve().then(() => getToken()),
    })
    setMessage('')
    setScreenshot(null)
    setAttachmentError('')
    setSentMessage(
      'Report sent. Your issue and session diagnostics have been logged for the Pitch team.',
    )
  }

  return (
    <section class="settings-card settings-issue-report">
      <div class="settings-support-panel__heading">
        <strong>Report an issue</strong>
        <small>
          Send a bug report, missing voiceover or render issue, or feedback with your session error
          log.
        </small>
      </div>

      <form class="settings-issue-form" onSubmit={handleSubmit}>
        <div class="settings-issue-form__row">
          <label for="issue-category">Topic</label>
          <select
            id="issue-category"
            aria-label="Issue category"
            value={category()}
            onChange={event => {
              setCategory(event.currentTarget.value as IssueReportCategory)
              setSentMessage('')
            }}
          >
            <For each={CATEGORIES}>{item => <option value={item.value}>{item.label}</option>}</For>
          </select>
        </div>

        <div class="settings-issue-form__row">
          <label for="issue-description">What happened?</label>
          <textarea
            id="issue-description"
            aria-label="Describe the issue"
            rows={4}
            required
            placeholder="Describe what went wrong or what you expected (you can also paste a screenshot here)…"
            value={message()}
            onInput={event => {
              setMessage(event.currentTarget.value)
              setSentMessage('')
            }}
            onPaste={event => {
              const files = Array.from(event.clipboardData?.files ?? [])
              const image = files.find(file => file.type.startsWith('image/'))
              if (image) void attachFile(image)
            }}
          />
        </div>

        <Show when={recentErrors().length > 0}>
          <div class="settings-issue-errors" role="note">
            <div class="settings-issue-errors__head">
              <AlertCircle size={14} />
              <span>
                {recentErrors().length === 1
                  ? '1 recent error captured in this session'
                  : `${recentErrors().length} recent errors captured in this session`}
              </span>
            </div>
            <code>{recentErrors()[0]?.message}</code>
          </div>
        </Show>

        <label class="settings-issue-checkbox">
          <input
            type="checkbox"
            checked={includeDiagnostics()}
            onChange={event => setIncludeDiagnostics(event.currentTarget.checked)}
          />
          <span>Include session error log and page diagnostics</span>
        </label>

        <div class="settings-issue-actions">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            aria-label="Upload screenshot"
            onChange={event => {
              void attachFile(event.currentTarget.files?.[0])
              event.currentTarget.value = ''
            }}
          />
          <Show
            when={screenshot()}
            fallback={
              <button type="button" class="settings-secondary" onClick={() => fileInput.click()}>
                <ImagePlus size={14} />
                Attach screenshot
              </button>
            }
          >
            {attached => (
              <div class="settings-issue-attachment">
                <span>{attached().name}</span>
                <button
                  type="button"
                  class="settings-secondary"
                  aria-label="Remove screenshot"
                  onClick={() => setScreenshot(null)}
                >
                  <Trash2 size={13} />
                  Remove
                </button>
              </div>
            )}
          </Show>

          <button type="submit" class="settings-primary" disabled={!message().trim()}>
            <Send size={14} />
            Send report
          </button>
        </div>

        <Show when={attachmentError()}>
          <small class="settings-field__error" role="alert">
            {attachmentError()}
          </small>
        </Show>
        <Show when={sentMessage()}>
          <small class="settings-field__success" role="status">
            {sentMessage()}
          </small>
        </Show>
      </form>
    </section>
  )
}

export function SupportSection() {
  return (
    <>
      <IssueReportCard />

      <section class="settings-card settings-support-panel">
        <div class="settings-support-panel__heading">
          <strong>Help &amp; support</strong>
          <small>Get help, share feedback, or reach the Pitch team.</small>
          <a class="settings-primary" href="mailto:support@trypitch.co">
            <Mail size={14} />
            Contact support
          </a>
        </div>
        <div class="settings-support">
          <a href="https://discord.gg/a4SBW36mD" target="_blank" rel="noreferrer">
            <span>
              <strong>Join our Discord</strong>
              <small>Chat with the community and get fast answers.</small>
            </span>
            <ExternalLink size={14} />
          </a>
          <a href="/docs" target="_blank" rel="noopener">
            <span>
              <strong>Read the documentation</strong>
              <small>Find guides for the API, MCP, and studio.</small>
            </span>
            <ExternalLink size={14} />
          </a>
        </div>
        <p class="settings-support-panel__footer">
          Prefer email? Reach us at <a href="mailto:support@trypitch.co">support@trypitch.co</a>.
        </p>
      </section>
    </>
  )
}
