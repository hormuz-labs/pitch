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
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useToast } from '../App'
import { createProject, type UploadRef, uploads as uploadFiles } from '../lib/studio-api'
import { describeStudioError, isCreditsError } from '../lib/studio-errors'
import { cn } from '../lib/utils'
import '../studio/studio.css'

const MAX_UPLOAD_MB = 500

const ACCEPT =
  '.pdf,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.avif,.svg,.mp4,.webm,.mov,.mkv,.mp3,.wav,.m4a'

const EXAMPLES = [
  'A 60-second cinematic launch video for https://yourproduct.com — bold, fast, end on the pricing page.',
  'Walk through https://yourproduct.com: sign in, create a project, show the dashboard updating live.',
  'A 10-slide investor deck: problem, product, traction, market, team, ask.',
  'Cut the dead air out of this recording, zoom on the clicks, add an intro card.',
  'Turn the background music down and trim the first eight seconds.',
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
  const fileInput = useRef<HTMLInputElement | null>(null)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const dragDepth = useRef(0)

  useEffect(() => {
    textarea.current?.focus()
  }, [])

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
            <div className="examples">
              {EXAMPLES.map(example => (
                <button
                  key={example}
                  type="button"
                  className="example"
                  onClick={() => {
                    setPrompt(example)
                    textarea.current?.focus()
                  }}
                >
                  {example}
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
