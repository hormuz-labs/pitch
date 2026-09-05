import { useAuth } from '@clerk/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../App'
import { FlowGlyph } from '../components/FlowGlyph'
import { LoadingCoin } from '../components/LoadingCoin'
import {
  deleteProject,
  FLOWS,
  type FlowId,
  listProjects,
  type Project,
  type ProjectStatus,
  share,
  shareUrl,
  thumbnailUrl,
  unshare,
} from '../lib/studio-api'
import { describeStudioError } from '../lib/studio-errors'
import { cn } from '../lib/utils'

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconDots = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="12" cy="19" r="1.8" />
  </svg>
)
const IconPlus = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export const projectPath = (p: Pick<Project, 'id'>) => `/p/${p.id}`

const STATUS: Record<ProjectStatus, { label: string; cls: string }> = {
  working: { label: 'Working', cls: 'bg-blue-50 text-blue-700 border-blue-100' },
  ready: { label: 'Ready', cls: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-600 border-red-100' },
  empty: { label: 'Draft', cls: 'bg-amber-50 text-amber-700 border-amber-100' },
}

export const StatusPill = ({
  status,
  className,
}: {
  status: ProjectStatus
  className?: string
}) => {
  const s = STATUS[status] ?? STATUS.empty
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        s.cls,
        className,
      )}
    >
      {status === 'working' && (
        <span className="h-2.5 w-2.5 animate-spin rounded-full border-[1.5px] border-blue-200 border-t-blue-600" />
      )}
      {s.label}
    </span>
  )
}

export const FlowBadge = ({ flow, className }: { flow: FlowId; className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-md bg-gray-900/85 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur',
      className,
    )}
  >
    <FlowGlyph flow={flow} size={11} />
    {FLOWS[flow]?.short ?? flow}
  </span>
)

/** Best thumbnail for a card: published thumbnail, thumbnail output, or a live frame. */
function cardThumb(p: Project, token: string | null): string | null {
  if (p.thumbnailUrl) return p.thumbnailUrl
  const out = p.outputs.find(o => o.kind === 'thumbnail')
  if (out) return out.url
  if (token && (p.status === 'ready' || p.status === 'working')) {
    return thumbnailUrl(p.id, 0.5, token, Date.parse(p.updatedAt) || undefined)
  }
  return null
}

// ── Card ──────────────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  token,
  onOpen,
  onShare,
  onDelete,
}: {
  project: Project
  token: string | null
  onOpen: () => void
  onShare: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const thumb = thumbFailed ? null : cardThumb(project, token)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  return (
    // No `overflow-hidden` here: it used to clip the card's own menu, so the
    // items below the fold could not be seen or clicked. The thumbnail rounds
    // its own top corners instead. The card lifts above its neighbours while
    // the menu is open, because the hover transform makes each card a
    // stacking context and a later sibling would otherwise paint over it.
    <div
      className={cn(
        'group relative flex cursor-pointer flex-col rounded-xl border border-gray-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-400 hover:shadow-lg',
        menuOpen && 'z-20',
      )}
      onClick={onOpen}
      role="link"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter') onOpen()
      }}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-t-xl bg-gray-100">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-gray-300">
            <FlowGlyph flow={project.flow} size={30} />
          </div>
        )}
        <FlowBadge flow={project.flow} className="absolute left-2 top-2" />
        <StatusPill status={project.status} className="absolute right-2 top-2 bg-white/90" />
        {project.isPublic && (
          <span className="absolute bottom-2 left-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
            Shared
          </span>
        )}
      </div>

      <div className="flex items-start gap-2 p-3.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900" title={project.title}>
            {project.title || 'Untitled'}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400">
            <span>{formatDate(project.createdAt)}</span>
            {project.status === 'failed' && project.lastError && (
              <span className="truncate text-red-500" title={project.lastError}>
                · {project.lastError}
              </span>
            )}
          </p>
        </div>

        <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            aria-label="Project menu"
            onClick={e => {
              e.stopPropagation()
              setMenuOpen(v => !v)
            }}
            className="rounded-md p-1 text-gray-400 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-700 group-hover:opacity-100 focus:opacity-100"
          >
            <IconDots />
          </button>
          {menuOpen && (
            <div
              role="menu"
              onClick={e => e.stopPropagation()}
              className="absolute right-0 top-8 z-30 w-40 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-150"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onOpen()
                }}
                className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                Open
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onShare()
                }}
                className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                {project.isPublic ? 'Copy share link' : 'Share'}
              </button>
              <div className="my-1 border-t border-gray-100" />
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  onDelete()
                }}
                className="w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── View ──────────────────────────────────────────────────────────────────────

const POLL_MS = 6000

export function ProjectsView({ searchQuery = '' }: { searchQuery?: string }) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [flowFilter] = useState<'all' | FlowId>('all')
  const [mediaToken, setMediaToken] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)

  const load = useCallback(async () => {
    try {
      const token = await getToken()
      if (!token) return
      setMediaToken(token)
      const rows = await listProjects(token)
      setProjects(rows)
      setError(null)
    } catch (err) {
      setError(describeStudioError(err, 'Could not load projects'))
      setProjects(prev => prev ?? [])
    }
  }, [getToken])

  useEffect(() => {
    void load()
  }, [load])

  // Poll while something is working so status pills and thumbnails catch up.
  const anyWorking = useMemo(() => projects?.some(p => p.status === 'working') ?? false, [projects])
  useEffect(() => {
    if (!anyWorking) return
    const t = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(t)
  }, [anyWorking, load])

  const visible = useMemo(() => {
    if (!projects) return []
    const q = searchQuery.trim().toLowerCase()
    return projects.filter(p => {
      if (flowFilter !== 'all' && p.flow !== flowFilter) return false
      if (!q) return true
      return (
        p.title.toLowerCase().includes(q) ||
        p.prompt.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q)
      )
    })
  }, [projects, flowFilter, searchQuery])

  const handleShare = async (p: Project) => {
    try {
      const token = await getToken()
      if (!token) return
      let slug = p.shareSlug
      if (!p.isPublic || !slug) {
        const updated = await share(token, p.id)
        slug = updated.shareSlug
        setProjects(prev =>
          prev ? prev.map(x => (x.id === p.id ? { ...x, ...updated, status: x.status } : x)) : prev,
        )
      }
      if (!slug) throw new Error('No share link returned')
      await navigator.clipboard.writeText(shareUrl(slug))
      toast('Share link copied', 'success')
    } catch (err) {
      toast(describeStudioError(err, 'Could not share project'), 'error')
    }
  }

  const handleUnshare = async (p: Project) => {
    try {
      const token = await getToken()
      if (!token) return
      const updated = await unshare(token, p.id)
      setProjects(prev =>
        prev ? prev.map(x => (x.id === p.id ? { ...x, ...updated, status: x.status } : x)) : prev,
      )
    } catch (err) {
      toast(describeStudioError(err, 'Could not unshare project'), 'error')
    }
  }

  const handleDelete = async (p: Project) => {
    setConfirmDelete(null)
    const snapshot = projects
    setProjects(prev => (prev ? prev.filter(x => x.id !== p.id) : prev))
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      await deleteProject(token, p.id)
      toast('Project deleted', 'success')
    } catch (err) {
      setProjects(snapshot)
      toast(describeStudioError(err, 'Could not delete project'), 'error')
    }
  }

  if (projects === null) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <LoadingCoin className="h-10 w-10" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="mt-1 text-sm text-gray-500">
            Every launch video, demo, deck and edit — open one to keep working with the agent.
          </p>
        </div>
        <button
          onClick={() => navigate('/new')}
          className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          <IconPlus />
          New project
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
          {error}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-16 text-center">
          <p className="text-sm font-medium text-gray-700">
            {projects.length === 0 ? 'No projects yet' : 'Nothing matches'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {projects.length === 0
              ? 'Describe what you want, or drop in a file, and the agent builds it live.'
              : 'Try another search term.'}
          </p>
          {projects.length === 0 && (
            <button
              onClick={() => navigate('/new')}
              className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-gray-900"
            >
              New project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map(p => (
            <ProjectCard
              key={p.id}
              project={p}
              token={mediaToken}
              onOpen={() => navigate(projectPath(p))}
              onShare={() => void handleShare(p)}
              onDelete={() => setConfirmDelete(p)}
            />
          ))}
        </div>
      )}

      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-5 shadow-xl"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2 className="text-base font-bold text-gray-900">Delete this project?</h2>
            <p className="mt-1.5 text-sm text-gray-500">
              “{confirmDelete.title || 'Untitled'}” and its workspace will be removed. Published
              files stay where you downloaded them.
            </p>
            {confirmDelete.isPublic && (
              <button
                onClick={() => {
                  void handleUnshare(confirmDelete)
                  setConfirmDelete(null)
                }}
                className="mt-3 text-xs font-medium text-gray-500 underline-offset-2 hover:underline"
              >
                Just stop sharing instead
              </button>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete(confirmDelete)}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
