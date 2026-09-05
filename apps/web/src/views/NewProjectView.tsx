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
import { useAuth, useUser } from '@clerk/react'
import { ArrowUp, CircleHelp, Megaphone, Menu, Plus } from 'lucide-react'
import {
  type CSSProperties,
  lazy,
  type ReactNode,
  Suspense,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppShell, useToast } from '../App'
import { CreditPopover } from '../components/CreditPopover'
import { filmPoster } from '../components/landing/filmPoster'
import { SLIDES } from '../components/landing/VideoCarousel'
import { PitchWordmark } from '../components/PitchWordmark'
import { PromptGuideModal } from '../components/PromptGuideModal'
import { SettingsCreditButton } from '../components/SettingsModal'
import { DECK_TEMPLATES } from '../lib/deckTemplates'
import { createProject, type UploadRef, uploads as uploadFiles } from '../lib/studio-api'
import { describeStudioError, isCreditsError } from '../lib/studio-errors'
import { cn } from '../lib/utils'
import '../studio/studio.css'
import '../styles/new-project.css'

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
 * The things the studio is asked for most often — not a menu of what it
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
    prompt: 'A launch video for https://yourproduct.com.',
    select: 'https://yourproduct.com',
  },
  {
    label: 'Brand documentary',
    glyph: (
      <Glyph>
        <rect x="3" y="4.5" width="18" height="14" rx="2" />
        <path d="M3 8.5h18" />
        <path d="m11 12 5.5 2.2-2.3.9-.9 2.3z" />
      </Glyph>
    ),
    prompt: 'A cinematic brand documentary about our origin, customers and point of view.',
    select: 'brand documentary',
  },
  {
    label: 'Deep-dive explainer',
    glyph: (
      <Glyph>
        <rect x="3" y="4" width="18" height="11.5" rx="1.5" />
        <path d="M12 15.5v3" />
        <path d="M8.5 20.5h7" />
      </Glyph>
    ),
    prompt: 'A clear deep-dive explainer that makes this complex topic feel obvious.',
    select: 'complex topic',
  },
  {
    label: 'Match a YouTube video',
    glyph: (
      <Glyph>
        <path d="M2.5 12h5" />
        <path d="M16.5 12h5" />
        <rect x="7.5" y="7" width="9" height="10" rx="2" />
      </Glyph>
    ),
    prompt: 'Match the pacing and visual language of this YouTube video: https://youtube.com/.',
    select: 'https://youtube.com/',
  },
  {
    label: 'Logo animation',
    glyph: (
      <Glyph>
        <circle cx="12" cy="12" r="7" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </Glyph>
    ),
    prompt: 'Create a refined loading animation using this logo.',
    select: 'this logo',
  },
  {
    label: 'Talking head',
    glyph: (
      <Glyph>
        <circle cx="12" cy="8" r="3" />
        <path d="M6 20c.5-4 2.5-6 6-6s5.5 2 6 6" />
      </Glyph>
    ),
    prompt: 'Turn this recording into a polished talking-head video with captions and clean cuts.',
    select: 'this recording',
  },
  {
    label: 'Article → video',
    glyph: (
      <Glyph>
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M9 11h6M9 15h6" />
      </Glyph>
    ),
    prompt: 'Turn this article into a concise visual story: https://example.com/article.',
    select: 'https://example.com/article',
  },
]

/**
 * The decks the studio can already build, three of them, as a way in from the
 * front door. The card is a real slide from the preset rather than a picture
 * of one, so what you pick is what you get — but the designs behind it are a
 * long tail of CSS, so they arrive after the page does, over the palette.
 */
const STRIP_TEMPLATES = DECK_TEMPLATES.slice(0, 3)

/**
 * The empty composer keeps suggesting openings, typed out and erased in place
 * so the box is never a blank stare. It pauses the moment real text is in the
 * field; with reduced motion the first one just sits there, static.
 */
const PLACEHOLDER_PROMPTS = STARTERS.map(s => s.prompt)

function useTypedPlaceholder(paused: boolean) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (paused) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(PLACEHOLDER_PROMPTS[0])
      return
    }
    let phrase = 0
    let char = 0
    let deleting = false
    let timer = 0
    const step = () => {
      const current = PLACEHOLDER_PROMPTS[phrase]
      char += deleting ? -1 : 1
      setText(current.slice(0, char))
      let delay = deleting ? 14 : 32
      if (!deleting && char === current.length) {
        deleting = true
        delay = 2800
      } else if (deleting && char === 0) {
        deleting = false
        phrase = (phrase + 1) % PLACEHOLDER_PROMPTS.length
        delay = 500
      }
      timer = window.setTimeout(step, delay)
    }
    timer = window.setTimeout(step, 800)
    return () => window.clearTimeout(timer)
  }, [paused])
  return text
}

const DeckTemplateThumb = lazy(() =>
  import('../lib/deckTemplateDesigns').then(m => ({ default: m.DeckTemplateThumb })),
)

const playPreview = (event: { currentTarget: HTMLElement }) => {
  const video = event.currentTarget.querySelector('video')
  void video?.play()
}

const pausePreview = (event: { currentTarget: HTMLElement }) => {
  const video = event.currentTarget.querySelector('video')
  video?.pause()
}

const smoothstep = (from: number, to: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

function FeaturedVideos() {
  const section = useRef<HTMLElement | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let frame = 0
    const scrollContainer = section.current?.closest('.app-shell-main')
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const node = section.current
        if (!node) return
        const rect = node.getBoundingClientRect()
        const viewport = window.innerHeight
        const distance = Math.max(1, node.offsetHeight - viewport)
        setProgress(Math.max(0, Math.min(1, (viewport - rect.top) / (viewport + distance))))
      })
    }
    measure()
    window.addEventListener('scroll', measure, { passive: true })
    scrollContainer?.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', measure)
      scrollContainer?.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
    }
  }, [])

  const enter = smoothstep(0.04, 0.3, progress)
  const exit = smoothstep(0.72, 0.98, progress)
  const gridTravel = smoothstep(0.27, 0.78, progress)
  const fade = smoothstep(0.92, 1, progress)
  const frameStyle = {
    '--featured-width': `${70 + enter * 30 - exit * 14}%`,
    '--featured-height': `${86 + enter * 14 - exit * 20}vh`,
    '--featured-radius': `${18 * (1 - enter) + exit * 16}px`,
    '--featured-y': `${-10 * exit}vh`,
    '--featured-grid-y': `${-52 * gridTravel}vh`,
    '--featured-opacity': String(1 - fade),
  } as CSSProperties

  return (
    <section
      id="featured-videos"
      ref={section}
      className="new-featured"
      aria-label="Featured videos"
    >
      <div className="new-featured__sticky">
        <div className="new-featured__panel" style={frameStyle}>
          <div className="new-featured__content">
            <div className="new-featured__head">
              <h2>Featured videos</h2>
              <div>
                {['All', 'Explainers', 'Launch & promo', 'Product demos', 'Typography'].map(
                  (filter, index) => (
                    <span className={index === 0 ? 'is-active' : ''} key={filter}>
                      {filter}
                    </span>
                  ),
                )}
              </div>
            </div>
            <div className="new-featured__grid">
              {SLIDES.map(slide => (
                <button
                  type="button"
                  className="new-featured__video"
                  key={slide.src}
                  onMouseEnter={playPreview}
                  onMouseLeave={pausePreview}
                  onFocus={playPreview}
                  onBlur={pausePreview}
                  onClick={event => {
                    const video = event.currentTarget.querySelector('video')
                    void video?.requestFullscreen?.()
                    void video?.play()
                  }}
                >
                  <video
                    src={`${slide.src}#t=0.5`}
                    poster={filmPoster(slide.title ?? 'Made with Pitch')}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                  />
                  <span>{slide.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function NewProjectView() {
  const { getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { isMobile, toggleSidebar, openSettings } = useAppShell()
  const [params] = useSearchParams()

  const [prompt, setPrompt] = useState(() => params.get('prompt') ?? '')
  const [files, setFiles] = useState<UploadRef[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creditsError, setCreditsError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [promptGuideOpen, setPromptGuideOpen] = useState(false)
  /** A new object every click, so re-picking the same starter re-selects. */
  const [starter, setStarter] = useState<{ select: string } | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const textarea = useRef<HTMLTextAreaElement | null>(null)
  const dragDepth = useRef(0)
  const typedPlaceholder = useTypedPlaceholder(prompt.length > 0)

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
    <div className="lv-studio new-project-page">
      {isMobile && (
        <button
          type="button"
          className="new-project-menu"
          onClick={toggleSidebar}
          aria-label="Open navigation"
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
      )}
      <div
        className={cn('create-view new-create-view', dragging && 'dropping')}
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
        {promptGuideOpen && <PromptGuideModal onClose={() => setPromptGuideOpen(false)} />}
        {dragging && (
          <div className="drop-veil">
            <span>Drop it here — this opens the editor</span>
          </div>
        )}

        <nav className="new-project-topnav" aria-label="Pitch links">
          <div className="new-project-topnav__links">
            <button type="button" onClick={() => openSettings('plans')}>
              Pricing
            </button>
            <button type="button" onClick={() => openSettings('rewards')}>
              Affiliates
            </button>
            <a href="mailto:support@trypitch.co">Need an epic launch video?</a>
            <button type="button" onClick={() => openSettings('mcp')}>
              API / MCP
            </button>
          </div>
          <div className="new-project-topnav__actions">
            <button
              type="button"
              aria-label="Support"
              title="Support"
              onClick={() => openSettings('support')}
            >
              <CircleHelp size={15} />
            </button>
            <button
              type="button"
              aria-label="Announcements"
              title="Announcements"
              onClick={() => toast("You're all caught up.", 'info')}
            >
              <Megaphone size={15} />
            </button>
            <div className="new-project-topnav__credits">
              <SettingsCreditButton onClick={() => openSettings('credits')} />
            </div>
            <button
              type="button"
              className="new-project-topnav__profile"
              onClick={() => openSettings('account')}
              aria-label="Open account settings"
            >
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="" />
              ) : (
                <span>
                  {user?.firstName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? 'P'}
                </span>
              )}
            </button>
          </div>
        </nav>

        <section className="new-create-hero">
          <div className="new-create-hero__intro">
            <PitchWordmark className="new-create-wordmark" />
            <p>One agent for motion design.</p>
            <button type="button" onClick={() => navigate('/affiliate')}>
              Share Pitch <i /> Earn 25% per customer
            </button>
          </div>

          <div className="composer-wrap new-composer-wrap">
            <div className={cn('composer-box', error && 'invalid')}>
              <button
                type="button"
                className="composer-prompt-guide"
                onClick={() => setPromptGuideOpen(true)}
                aria-label="Open prompt guide"
                title="Prompt guide"
              >
                <CircleHelp size={16} />
              </button>
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
                placeholder={typedPlaceholder}
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
                    className="attach-plus"
                    disabled={uploading}
                    onClick={() => fileInput.current?.click()}
                    aria-label="Attach a file"
                    title="Attach a file"
                  >
                    {uploading ? <span className="spinner" /> : <Plus size={18} />}
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
                    aria-label={submitting ? 'Starting…' : 'Start project'}
                    title="Start"
                  >
                    {submitting ? <span className="spinner" /> : <ArrowUp size={17} />}
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

            <div className="starters">
              {STARTERS.map(s => (
                <button
                  key={s.label}
                  type="button"
                  className={cn('starter', prompt === s.prompt && 'is-active')}
                  aria-pressed={prompt === s.prompt}
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

            <a className="new-featured-cue" href="#featured-videos">
              See featured videos <span>↓</span>
            </a>
          </div>
        </section>

        <section className="new-template-strip">
          <div className="new-template-strip__head">
            <span>
              Start from a template <i>Pro</i>
            </span>
            <button type="button" onClick={() => navigate('/templates')}>
              View all
            </button>
          </div>
          <div className="new-template-strip__cards">
            {STRIP_TEMPLATES.map(template => (
              <button
                type="button"
                key={template.id}
                title={template.blurb}
                onClick={() => navigate(`/templates?t=${template.id}`)}
              >
                <span
                  className="new-template-strip__thumb"
                  style={
                    {
                      '--swatch-bg': template.swatch[0],
                      '--swatch-accent': template.swatch[2],
                    } as CSSProperties
                  }
                >
                  <Suspense fallback={null}>
                    <DeckTemplateThumb templateId={template.id} />
                  </Suspense>
                </span>
                <span>{template.name}</span>
              </button>
            ))}
          </div>
        </section>

        <FeaturedVideos />
      </div>
    </div>
  )
}
