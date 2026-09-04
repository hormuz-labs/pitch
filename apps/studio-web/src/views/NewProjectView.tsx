/**
 * New project — one door.
 *
 * There used to be four of these, one per flow, each with its own wall of
 * options. But the agent decides what the request needs, and everything those
 * options set can be said in a sentence or changed later in the studio, where
 * the artifact is on screen to change it against.
 *
 * Dropping a file does not fill in a form — it opens the editor. Nothing is
 * charged and no turn is run, because you cannot say what you want about a
 * video until you are looking at it and can select the part you mean.
 */
import { useAuth } from '@clerk/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../App'
import { CreditPopover } from '../components/CreditPopover'
import { createProject, type UploadRef, uploads as uploadFiles } from '../lib/studio-api'
import { describeStudioError, isCreditsError } from '../lib/studio-errors'
import { cn } from '../lib/utils'
import '../studio/studio.css'

const MAX_UPLOAD_MB = 500

const ACCEPT =
  '.pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a'

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    width="15"
    height="15"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

/**
 * The four things the studio is asked for most often — not a menu of what it
 * can do. Each one drops a real sentence into the composer with the part you
 * have to change already selected, so the chip is a head start on typing
 * rather than a mode you enter.
 */
const STARTERS: { label: string; glyph: ReactNode; prompt: string; select: string }[] = [
  {
    label: 'Launch video',
    glyph: (
      <Glyph>
        <rect x="2.5" y="5" width="13" height="13" rx="3" />
        <path d="m8 9.5 4 2.2-4 2.3z" />
        <path d="m18.5 3.5.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
      </Glyph>
    ),
    prompt:
      'A 60-second cinematic launch video for https://yourproduct.com — bold, fast, end on the pricing page.',
    select: 'https://yourproduct.com',
  },
  {
    label: 'Product walkthrough',
    glyph: (
      <Glyph>
        <rect x="3" y="4.5" width="18" height="14" rx="2" />
        <path d="M3 8.5h18" />
        <path d="m11 12 5.5 2.2-2.3.9-.9 2.3z" />
      </Glyph>
    ),
    prompt:
      'Walk through https://yourproduct.com: sign in, create a project, show the dashboard updating live.',
    select: 'https://yourproduct.com',
  },
  {
    label: 'Slide deck',
    glyph: (
      <Glyph>
        <rect x="3" y="4" width="18" height="11.5" rx="1.5" />
        <path d="M12 15.5v3" />
        <path d="M8.5 20.5h7" />
      </Glyph>
    ),
    prompt: 'A 10-slide investor deck — problem, product, traction, market, team, ask.',
    select: 'investor',
  },
  {
    label: 'Edit a video',
    glyph: (
      <Glyph>
        <path d="M2.5 12h5" />
        <path d="M16.5 12h5" />
        <rect x="7.5" y="7" width="9" height="10" rx="2" />
      </Glyph>
    ),
    prompt: 'Turn the background music down and cut the dead air out of this recording.',
    select: 'the background music down',
  },
]

export function NewProjectView() {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [params] = useSearchParams()

  const [prompt, setPrompt] = useState(() => params.get('prompt') ?? '')
  const [files, setFiles] = useState<UploadRef[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creditsError, setCreditsError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  /** A new object every click, so re-picking the same starter re-selects. */
  const [starter, setStarter] = useState<{ select: string } | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    textarea.current?.focus()
  }, [])

  // A starter is only a head start if the bit you must replace is already
  // selected — otherwise you are hunting for a URL inside a sentence.
  useEffect(() => {
    const el = textarea.current
    if (!starter || !el) return
    el.focus()
    const at = el.value.indexOf(starter.select)
    if (at >= 0) el.setSelectionRange(at, at + starter.select.length)
  }, [starter])

  /**
   * Upload, then go straight to the editor. Anything the user might have typed
   * here rides along as the first prompt; with nothing typed the project just
   * opens, with the file on screen and the composer waiting.
   */
  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return
    const picked = Array.from(list)
    const tooBig = picked.find(f => f.size > MAX_UPLOAD_MB * 1024 * 1024)
    if (tooBig) {
      toast(`${tooBig.name} is over ${MAX_UPLOAD_MB} MB`, 'error')
      return
    }
    setUploading(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const form = new FormData()
      for (const f of picked) form.append('files', f)
      const added = await uploadFiles(token, form)
      setFiles(prev => [...prev, ...added])
      setError(null)
      await open(prompt.trim(), added, token)
    } catch (err) {
      const msg = describeStudioError(err, 'Upload failed')
      toast(msg, 'error')
      if (isCreditsError(err)) setCreditsError(msg)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const open = async (text: string, uploads: UploadRef[], token: string) => {
    const project = await createProject(token, { prompt: text, options: {}, uploads })
    window.dispatchEvent(new Event('credits-changed'))
    navigate(`/p/${project.id}`)
  }

  const submit = async () => {
    if (submitting || uploading) return
    const text = prompt.trim()
    if (!text && files.length === 0) {
      setError('Describe what you want, or attach a file to work on.')
      return
    }
    setSubmitting(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      await open(text, files, token)
    } catch (err) {
      const msg = describeStudioError(err, 'Could not create the project')
      toast(msg, 'error')
      if (isCreditsError(err)) setCreditsError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="lv-studio">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop zone is not a control */}
      <div
        className={cn('create-view', dragging && 'dropping')}
        onDragEnter={e => {
          if (!e.dataTransfer?.types.includes('Files')) return
          dragDepth.current += 1
          setDragging(true)
        }}
        onDragOver={e => {
          if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1)
          if (dragDepth.current === 0) setDragging(false)
        }}
        onDrop={e => {
          if (!e.dataTransfer?.files.length) return
          e.preventDefault()
          dragDepth.current = 0
          setDragging(false)
          void pickFiles(e.dataTransfer.files)
        }}
      >
        <div className="hero">
          <h1 className="hero-title">What are we making?</h1>
          <p className="hero-sub">
            Describe it, or drop a video, deck or PDF anywhere on this page — that opens the editor,
            where you select the part you mean and tell me what to do with it.
          </p>
        </div>

        {dragging && (
          <div className="drop-veil">
            <span>Drop it here — this opens the editor</span>
          </div>
        )}

        <div className="composer-wrap">
          <div className={cn('composer-box', error && 'invalid')}>
            {files.length > 0 && (
              <div className="attach-row">
                {files.map((f, i) => (
                  <span key={`${f.url}-${i}`} className="attach-chip" title={f.name}>
                    <span>{f.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles(list => list.filter((_, j) => j !== i))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <textarea
              ref={textarea}
              rows={3}
              id="new-project-prompt"
              placeholder="A 60-second launch video for https://yourproduct.com…"
              value={prompt}
              onChange={e => {
                setPrompt(e.target.value)
                setError(null)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
            />

            <div className="composer-footer">
              <div className="tool-row">
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  multiple
                  accept={ACCEPT}
                  onChange={e => void pickFiles(e.target.files)}
                />
                <button
                  type="button"
                  className="music-btn"
                  disabled={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  <span className="music-btn-icon">📎</span>
                  {uploading ? 'Opening the editor…' : 'Attach a file'}
                </button>
              </div>
              <div className="tool-row">
                <span className="composer-credits">
                  <CreditPopover variant="marker" />
                </span>
                <button
                  type="button"
                  className="send-btn"
                  id="create-project-btn"
                  disabled={submitting || uploading}
                  onClick={() => void submit()}
                >
                  {submitting && <span className="spinner" />}
                  {submitting ? 'Starting…' : 'Start'}
                </button>
              </div>
            </div>
          </div>

          {error && <div className="create-error">{error}</div>}
          {creditsError && (
            <div className="create-error">
              {creditsError}{' '}
              <button type="button" className="link-btn" onClick={() => navigate('/pricing')}>
                Top up
              </button>
            </div>
          )}

          {!prompt.trim() && files.length === 0 && (
            <div className="starters">
              {STARTERS.map(s => (
                <button
                  key={s.label}
                  type="button"
                  className="starter"
                  title={s.prompt}
                  onClick={() => {
                    setPrompt(s.prompt)
                    setError(null)
                    setStarter({ select: s.select })
                  }}
                >
                  {s.glyph}
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <p className="create-note">
            You are charged for what the work costs — the agent's thinking, and the machine time
            spent recording and rendering. Asking for a change is nearly free.
          </p>
        </div>
      </div>
    </div>
  )
}
