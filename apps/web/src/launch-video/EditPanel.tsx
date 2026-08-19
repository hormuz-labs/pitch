import { useAuth } from '@clerk/react'
import { ArrowLeft, Download, Film, Loader2, Share2 } from 'lucide-react'
import { FaInstagram, FaWhatsapp, FaXTwitter } from 'react-icons/fa6'
import { FiLink } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { ShareSheet } from '../components/ShareSheet'
import { api } from '../lib/api'
import type { Project } from '../types'
import { EditSidebar } from './EditSidebar'
import { launchVideoProjectDestination } from './navigation'
import { SceneTimeline } from './SceneTimeline'
import { useLaunchVideo } from './store'
import { VideoPlayer } from './VideoPlayer'

const shareOptions = [
  {
    id: 'copy',
    name: 'Copy URL',
    icon: <FiLink size={13} className="text-indigo-600" />,
    bgClass: 'bg-indigo-50 border border-indigo-100/50 text-indigo-600',
    immediate: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: <FaWhatsapp size={14} className="text-emerald-600" />,
    bgClass: 'bg-emerald-50 border border-emerald-100/50 text-emerald-600',
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: <FaXTwitter size={13} className="text-zinc-900" />,
    bgClass: 'bg-zinc-100 border border-zinc-200/50 text-zinc-900',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: <FaInstagram size={14} className="text-rose-600" />,
    bgClass: 'bg-rose-50 border border-rose-100/50 text-rose-600',
  },
]

export function EditPanel() {
  const navigate = useNavigate()
  const { getToken } = useAuth()
  const {
    activity,
    busy,
    clearProject,
    currentProject,
    mediaUrl,
    projects,
    projectsLoading,
    projectsError,
    refreshProjects,
    videoVersion,
  } = useLaunchVideo()

  if (!currentProject) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <h1 className="font-[family-name:var(--font-serif)] text-3xl text-[var(--text-primary)] tracking-tight">
            Pick a project to edit
          </h1>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map(p => (
              <button
                key={p.name}
                onClick={() => navigate(launchVideoProjectDestination(p))}
                className="group flex flex-col items-start gap-1.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-left shadow-[var(--shadow-sm)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] transition-all cursor-pointer"
              >
                <span className="text-[var(--text-faint)] group-hover:text-[var(--text-muted)] transition-colors">
                  <Film size={16} strokeWidth={1.75} />
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)] truncate w-full font-[family-name:var(--font-mono)]">
                  {p.displayName ?? p.name}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {p.jobId && (p.status === 'PENDING' || p.status === 'PROCESSING')
                    ? 'Creating · view progress'
                    : p.status === 'FAILED'
                      ? 'Generation failed · view details'
                      : p.hasVideo
                        ? `${p.sceneCount} scenes · rendered`
                        : 'No finished render'}
                </span>
              </button>
            ))}
          </div>
          {projectsLoading && (
            <div className="flex items-center gap-2 mt-8 text-sm text-[var(--text-muted)]">
              <Loader2 size={14} className="animate-spin" />
              Loading projects…
            </div>
          )}
          {!projectsLoading && projectsError && (
            <div className="mt-8 flex flex-col items-start gap-3">
              <p className="text-sm text-[var(--text-muted)]">Couldn't load projects.</p>
              <button
                onClick={() => void refreshProjects()}
                className="h-8 px-3 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-transparent text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}
          {!projectsLoading && !projectsError && projects.length === 0 && (
            <p className="mt-8 text-sm text-[var(--text-muted)]">
              No projects yet — generate one from the Create tab.
            </p>
          )}
        </div>
      </div>
    )
  }

  const downloadUrl = mediaUrl(currentProject.videoUrl, videoVersion)
  const projectInfo = projects.find(project => project.name === currentProject.name)
  const displayName = projectInfo?.displayName ?? currentProject.name
  const jobId = projectInfo?.jobId

  const handleShareComplete = async (option: { id: string; name: string }) => {
    // Share the branded public page rather than the raw video file — same
    // reasoning as the demo-video share flow (VideoCard/EditorView). Falls
    // back to the raw download URL if the share endpoint is unreachable.
    let shareUrl = downloadUrl ?? ''
    if (jobId) {
      try {
        const token = await getToken()
        const updated = await api.post<Project>(`/jobs/${jobId}/share`, token!)
        shareUrl = `${window.location.origin}/d/${updated.shareSlug}`
      } catch (err) {
        console.error('Failed to create share link, falling back to raw video URL:', err)
      }
    }

    const text = encodeURIComponent(
      'Just generated a cinematic launch video using Pitch. Create your own at https://trypitch.co 🚀',
    )
    const twitterText = encodeURIComponent(
      'Just generated a cinematic launch video using @trypitchdotco. Create your own at https://trypitch.co 🚀',
    )
    const url = encodeURIComponent(shareUrl)

    if (option.id === 'copy') {
      navigator.clipboard.writeText(shareUrl)
    } else if (option.id === 'whatsapp') {
      window.open(`https://wa.me/?text=${text}%20${url}`, '_blank')
    } else if (option.id === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${twitterText}&url=${url}`, '_blank')
    } else if (option.id === 'instagram') {
      navigator.clipboard.writeText(shareUrl)
      alert('Video URL copied! Open Instagram to share.')
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-5 py-3.5 border-b border-[var(--border-subtle)]">
        <button
          onClick={() => clearProject()}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[var(--radius-md)] bg-transparent text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text-primary)] transition-colors cursor-pointer border-none"
        >
          <ArrowLeft size={13} />
          Projects
        </button>
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-faint)] leading-none mb-0.5">
            Launch video
          </div>
          <span className="text-sm font-semibold text-[var(--text-primary)] font-[family-name:var(--font-mono)] truncate block">
            {displayName}
          </span>
        </div>
        {busy && (
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] truncate">
            <Loader2 size={12} className="animate-spin shrink-0" />
            {activity ?? 'working…'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {jobId && (
            <ShareSheet
              users={shareOptions}
              onShareComplete={option => handleShareComplete(option)}
              placement="bottom"
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] hover:text-[var(--text-primary)] transition-colors"
              triggerContent={
                <>
                  <Share2 size={13} />
                  Share
                </>
              }
            />
          )}
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={`${displayName}.mp4`}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-[var(--radius-md)] bg-[var(--interactive-bg)] text-[var(--interactive-text)] text-xs font-medium hover:bg-[var(--interactive-bg-hover)] transition-colors no-underline border-none"
            >
              <Download size={13} />
              Download video
            </a>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-5 py-5 flex flex-col gap-5">
            <VideoPlayer />
            <SceneTimeline />
          </div>
        </div>
        <EditSidebar />
      </div>
    </div>
  )
}
