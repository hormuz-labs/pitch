import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../App'
import { CreditChip } from '../components/CreditChip'
import { LoadingCoin } from '../components/LoadingCoin'
import {
  createProject,
  FLOWS,
  getProject,
  type Output,
  type ProjectDetail,
  share,
  shareUrl,
  unshare,
} from '../lib/studio-api'
import { describeStudioError } from '../lib/studio-errors'
import { FlowBadge, StatusPill } from './ProjectsView'

const IconDownload = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
)

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const OUTPUT_LABEL: Record<Output['kind'], string> = {
  video: 'Video',
  pdf: 'PDF',
  html: 'HTML',
  thumbnail: 'Thumbnail',
}

/** Legacy flows re-open at the base price of the flow; the server is authoritative. */
const REOPEN_CREDITS: Record<string, number> = {
  'launch-video': 9,
  'demo-video': 3,
  deck: 1,
  'recording-edit': 2,
}

/**
 * Read-only page for a project imported from the old Job table. Shows what
 * it produced, lets the user download/share it, and offers "Edit in studio",
 * which creates a fresh project of the same flow hydrated from the outputs.
 */
export function LegacyProjectView({ projectId }: { projectId: string }) {
  const { getToken } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const token = await getToken()
        if (!token) return
        const p = await getProject(token, projectId)
        if (cancelled) return
        if (p.status !== 'legacy') {
          navigate(`/p/${p.id}`, { replace: true })
          return
        }
        setProject(p)
      } catch (err) {
        if (!cancelled) setError(describeStudioError(err, 'Could not load project'))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [getToken, projectId, navigate])

  const outputs: Output[] = project
    ? [...project.outputs, ...(project.description?.outputs ?? [])].filter(
        (o, i, arr) => arr.findIndex(x => x.url === o.url) === i,
      )
    : []
  const video = outputs.find(o => o.kind === 'video')
  const pdf = outputs.find(o => o.kind === 'pdf')
  const html = outputs.find(o => o.kind === 'html')

  const editInStudio = async () => {
    if (!project) return
    setOpening(true)
    try {
      const token = await getToken()
      if (!token) throw new Error('Not signed in')
      const created = await createProject(token, {
        flow: project.flow,
        prompt: project.prompt || `Continue editing "${project.title}"`,
        options: {
          ...project.options,
          fromProjectId: project.id,
          legacyJobId: project.legacyJobId ?? undefined,
          htmlUrl: html?.url ?? project.options?.htmlUrl,
          videoUrl: video?.url ?? project.options?.videoUrl,
          pdfUrl: pdf?.url ?? project.options?.pdfUrl,
          storyboard: project.options?.storyboard,
        },
      })
      window.dispatchEvent(new Event('credits-changed'))
      navigate(`/p/${created.id}`)
    } catch (err) {
      toast(describeStudioError(err, 'Could not open in studio'), 'error')
    } finally {
      setOpening(false)
    }
  }

  const toggleShare = async () => {
    if (!project) return
    try {
      const token = await getToken()
      if (!token) return
      if (project.isPublic && project.shareSlug) {
        await navigator.clipboard.writeText(shareUrl(project.shareSlug))
        toast('Share link copied', 'success')
        return
      }
      const updated = await share(token, project.id)
      setProject({
        ...project,
        ...updated,
        status: project.status,
        description: project.description,
      })
      if (updated.shareSlug) {
        await navigator.clipboard.writeText(shareUrl(updated.shareSlug))
        toast('Public link created and copied', 'success')
      }
    } catch (err) {
      toast(describeStudioError(err, 'Could not share'), 'error')
    }
  }

  const stopSharing = async () => {
    if (!project) return
    try {
      const token = await getToken()
      if (!token) return
      const updated = await unshare(token, project.id)
      setProject({
        ...project,
        ...updated,
        status: project.status,
        description: project.description,
      })
      toast('Sharing turned off', 'info')
    } catch (err) {
      toast(describeStudioError(err, 'Could not unshare'), 'error')
    }
  }

  if (error) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center p-8">
        <div className="max-w-sm rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
          <p className="text-sm font-semibold text-red-700">{error}</p>
          <button
            onClick={() => navigate('/projects')}
            className="mt-4 rounded-lg bg-gray-900 px-4 py-2 text-xs font-semibold text-white"
          >
            Back to projects
          </button>
        </div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <LoadingCoin className="h-10 w-10" />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-6 md:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <FlowBadge flow={project.flow} />
            <StatusPill status={project.status} />
          </div>
          <h1 className="truncate text-2xl font-bold text-gray-900">{project.title}</h1>
          <p className="mt-1 text-xs text-gray-400">
            {FLOWS[project.flow]?.title} · created {formatDate(project.createdAt)} · read-only
            import
          </p>
        </div>
        <button
          onClick={() => void editInStudio()}
          disabled={opening}
          className="flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {opening ? 'Opening…' : 'Edit in studio'}
          {!opening && (
            <CreditChip
              amount={REOPEN_CREDITS[project.flow] ?? 1}
              className="bg-white text-gray-900"
            />
          )}
        </button>
      </div>

      {video ? (
        <div className="overflow-hidden rounded-2xl bg-gray-950 shadow-lg ring-1 ring-black/5">
          <video
            controls
            src={video.url}
            poster={project.thumbnailUrl ?? undefined}
            className="aspect-video w-full object-contain"
          />
        </div>
      ) : pdf ? (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
          <iframe src={pdf.url} title={project.title} className="h-[70vh] w-full" />
        </div>
      ) : project.thumbnailUrl ? (
        <img
          src={project.thumbnailUrl}
          alt=""
          className="aspect-video w-full rounded-2xl object-cover"
        />
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-200 px-6 py-14 text-center text-sm text-gray-400">
          This project has no stored output.
        </div>
      )}

      {project.prompt && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Original prompt
          </p>
          <p className="whitespace-pre-wrap text-sm text-gray-700">{project.prompt}</p>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Outputs</p>
        {outputs.length === 0 ? (
          <p className="text-sm text-gray-400">None.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
            {outputs.map(o => (
              <li key={o.url} className="flex items-center gap-3 px-4 py-3">
                <span className="w-20 shrink-0 text-xs font-semibold text-gray-700">
                  {OUTPUT_LABEL[o.kind]}
                  {o.res ? ` · ${o.res}` : ''}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-gray-400" title={o.url}>
                  {o.label ?? o.url}
                </span>
                <a
                  href={o.url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-900"
                >
                  <IconDownload />
                  Download
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void toggleShare()}
          className="rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-gray-700 hover:border-gray-900"
        >
          {project.isPublic ? 'Copy share link' : 'Share publicly'}
        </button>
        {project.isPublic && (
          <button
            onClick={() => void stopSharing()}
            className="rounded-lg px-3 py-2 text-xs font-medium text-gray-500 hover:text-gray-900"
          >
            Stop sharing
          </button>
        )}
        {project.isPublic && project.shareViews > 0 && (
          <span className="text-xs text-gray-400">{project.shareViews} views</span>
        )}
      </div>
    </div>
  )
}
