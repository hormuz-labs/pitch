import { useAuth } from '@clerk/react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { FaInstagram, FaWhatsapp, FaXTwitter } from 'react-icons/fa6'
import { FiLink } from 'react-icons/fi'
import { useNavigate, useParams } from 'react-router-dom'
import { CreditChip } from '../components/CreditChip'
import { FeedbackComponent } from '../components/FeedbackComponent'
import { PitchLogoAnimation } from '../components/PitchLogoAnimation'
import { ShareSheet } from '../components/ShareSheet'
import { TimedUndoAction } from '../components/TimedUndoAction'
import { Alert27 } from '../components/ui/alert-27'
import { Button35 } from '../components/ui/button-35'
import { VideoProgressWidget } from '../components/VideoProgressWidget'
import { VideoStoryboardEditor } from '../components/VideoStoryboardEditor'
import { api } from '../lib/api'
import type { LogEntry, Project, VideoEdition } from '../types'

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconXCircle = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
)
const IconVideo = ({ className, size = 15 }: { className?: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
)
const IconAudio = ({ className, size = 15 }: { className?: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
  </svg>
)
const IconShare = ({ className, size = 15 }: { className?: string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <polyline points="16 6 12 2 8 6" />
    <line x1="12" y1="2" x2="12" y2="15" />
  </svg>
)
const IconTrashSm = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
)
const IconEdit = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" />
  </svg>
)

export const VideoEditionHistory = ({
  editions,
  activeEditionId,
  onSelect,
}: {
  editions: VideoEdition[]
  activeEditionId?: string
  onSelect: (editionId: string) => void
}) => (
  <section className="rounded-xl border border-gray-200 bg-white p-4">
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Video history</h3>
        <p className="mt-0.5 text-xs text-gray-500">
          Every successful render stays available to play, download, or edit again.
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
        {editions.length} {editions.length === 1 ? 'edition' : 'editions'}
      </span>
    </div>
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {editions.map((edition, index) => {
        const active = edition.id === activeEditionId
        return (
          <button
            key={edition.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(edition.id)}
            className={`min-w-36 rounded-lg border px-3 py-2 text-left transition-colors ${
              active
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="flex items-center gap-2 text-xs font-semibold">
              Edition {edition.editionNumber}
              {index === 0 && (
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    active ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700'
                  }`}
                >
                  Latest
                </span>
              )}
            </span>
            <span
              className={`mt-1 block text-[11px] ${active ? 'text-gray-300' : 'text-gray-400'}`}
            >
              {new Date(edition.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>
          </button>
        )
      })}
    </div>
  </section>
)

const shareOptions = [
  {
    id: 'copy',
    name: 'Copy URL',
    icon: (
      <FiLink
        size={13}
        className="text-indigo-600 transition-transform duration-300 group-hover:scale-110"
      />
    ),
    bgClass: 'bg-indigo-50 border border-indigo-100/50 text-indigo-600',
    immediate: true,
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: (
      <FaWhatsapp
        size={14}
        className="text-emerald-600 transition-transform duration-300 group-hover:scale-110"
      />
    ),
    bgClass: 'bg-emerald-50 border border-emerald-100/50 text-emerald-600',
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    icon: (
      <FaXTwitter
        size={13}
        className="text-zinc-900 transition-transform duration-300 group-hover:scale-110"
      />
    ),
    bgClass: 'bg-zinc-100 border border-zinc-200/50 text-zinc-900',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    icon: (
      <FaInstagram
        size={14}
        className="text-rose-600 transition-transform duration-300 group-hover:scale-110"
      />
    ),
    bgClass: 'bg-rose-50 border border-rose-100/50 text-rose-600',
  },
]

// ── Editor View ────────────────────────────────────────────────────────────────
interface EditorViewProps {
  projects: Project[]
  jobLogs: Record<string, LogEntry[]>
  isMobile: boolean
  onDelete: (id: string) => Promise<void>
  onUpdate: (project: Project) => void
}

export const EditorView = ({
  projects,
  jobLogs,
  isMobile,
  onDelete,
  onUpdate,
}: EditorViewProps) => {
  const navigate = useNavigate()
  const { id } = useParams()
  const { getToken } = useAuth()

  const selectedProject = projects.find(p => p.id === id)
  const [isFeedbackSubmitted, setIsFeedbackSubmitted] = useState(false)
  const [isPendingDelete, setIsPendingDelete] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [videoEditions, setVideoEditions] = useState<VideoEdition[]>([])
  const [activeEditionId, setActiveEditionId] = useState<string | null>(null)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)
  const logs = jobLogs[id || ''] || []
  const latestScreenshot = [...logs].reverse().find(l => l.screenshot)?.screenshot

  useEffect(() => {
    if (selectedProject?.status !== 'COMPLETED' || !selectedProject.parameters?.storyboard) {
      setVideoEditions([])
      setActiveEditionId(null)
      return
    }

    let cancelled = false
    void getToken()
      .then(token => api.get<VideoEdition[]>(`/jobs/${selectedProject.id}/editions`, token!))
      .then(editions => {
        if (cancelled) return
        setVideoEditions(editions)
        setActiveEditionId(current =>
          editions.some(edition => edition.id === current) ? current : editions[0]?.id || null,
        )
      })
      .catch(() => {
        if (!cancelled) setVideoEditions([])
      })

    return () => {
      cancelled = true
    }
  }, [getToken, selectedProject])

  if (!selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-12">
        <div className="w-48 sm:w-64 mb-8">
          <PitchLogoAnimation startAnimation={true} loop={true} />
        </div>
        <p className="font-bold text-gray-900 tracking-tight leading-none text-xl mb-4 animate-pulse">
          Loading project…
        </p>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors border-none cursor-pointer mt-2"
        >
          Cancel
        </button>
      </div>
    )
  }

  const isProcessing =
    selectedProject.status === 'PROCESSING' || selectedProject.status === 'PENDING'
  const isAwaitingReview =
    selectedProject.status === 'AWAITING_REVIEW' &&
    selectedProject.parameters?.workflowStage === 'AWAITING_REVIEW' &&
    Boolean(selectedProject.parameters?.storyboard)
  const isCompleted = selectedProject.status === 'COMPLETED'
  const isFailed = selectedProject.status === 'FAILED'
  const isEditJob = selectedProject.parameters?.jobType === 'edit-recording'
  const activeEdition =
    videoEditions.find(edition => edition.id === activeEditionId) || videoEditions[0]
  const activeVideoUrl = activeEdition?.videoUrl || selectedProject.videoUrl
  const activeAudioUrl =
    activeEdition?.audioUrl || selectedProject.audioUrl || activeVideoUrl?.replace('.mp4', '.wav')

  const handleFeedbackSubmit = async (data: { rating: 'up' | 'down'; feedback: string }) => {
    console.log('Feedback submitted:', data)
    setIsFeedbackSubmitted(true)
    try {
      const token = await getToken()
      await api.post(`/jobs/${selectedProject?.id}/feedback`, token!, data)
    } catch (err) {
      console.error('Error submitting feedback:', err)
    }
  }

  const handleShareComplete = (option: { id: string; name: string }, videoUrl: string) => {
    const text = encodeURIComponent(
      'Just generated a cinematic product demo using Pitch. Create your own at https://trypitch.co 🚀',
    )
    const twitterText = encodeURIComponent(
      'Just generated a cinematic product demo using @trypitchdotco. Create your own at https://trypitch.co 🚀',
    )
    const url = encodeURIComponent(videoUrl)

    if (option.id === 'copy') {
      navigator.clipboard.writeText(videoUrl)
    } else if (option.id === 'whatsapp') {
      window.open(`https://wa.me/?text=${text}%20${url}`, '_blank')
    } else if (option.id === 'twitter') {
      window.open(`https://twitter.com/intent/tweet?text=${twitterText}&url=${url}`, '_blank')
    } else if (option.id === 'instagram') {
      navigator.clipboard.writeText(videoUrl)
      alert('Video URL copied! Open Instagram to share.')
    }
  }

  const handleBeginEdit = async () => {
    if (!selectedProject) return
    setEditBusy(true)
    setEditError('')
    try {
      const token = await getToken()
      const updated = await api.post<Project>(`/jobs/${selectedProject.id}/edit`, token!, {
        editionId: activeEdition?.id,
      })
      onUpdate(updated)
      setShowEditModal(false)
      window.dispatchEvent(new Event('credits-changed'))
    } catch (error: any) {
      setEditError(
        error?.status === 402
          ? 'You need at least 3 credits to edit this video.'
          : error?.message || 'Could not open this video for editing.',
      )
    } finally {
      setEditBusy(false)
    }
  }

  const handleConfirmDelete = async () => {
    try {
      await onDelete(selectedProject.id)
      navigate('/dashboard')
    } catch (err) {
      console.error('Failed to delete video:', err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div
        className={`min-h-0 flex-1 p-6 md:p-8 ${
          isAwaitingReview ? 'overflow-y-auto lg:overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        <div
          className={`${isAwaitingReview ? 'max-w-[1500px] lg:h-full' : 'max-w-5xl'} mx-auto w-full`}
        >
          {isAwaitingReview && <VideoStoryboardEditor project={selectedProject} />}

          {/* Processing state */}
          {isProcessing && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-8">
              <div className="flex flex-col items-center text-center mb-8">
                <h2 className="text-lg font-bold text-gray-900">
                  {isEditJob ? 'Editing your recording…' : 'Generating your video…'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  This typically takes 5–10 minutes. Hang tight!
                </p>

                {/* Real-time phase progress widget — always visible during processing */}
                <div className="mt-5 w-full max-w-2xl mx-auto">
                  <VideoProgressWidget project={selectedProject} />
                </div>
              </div>

              {latestScreenshot && (
                <div className="flex justify-center">
                  <div className={isMobile ? 'w-full' : 'w-72 shrink-0'}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 text-center">
                      Live Preview
                    </p>
                    <div className="rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                      <img src={latestScreenshot} alt="Live screenshot" className="w-full block" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Completed state */}
          {isCompleted && (
            <div className="space-y-4">
              {/* Success banner — top */}
              <Alert27
                title="Video is Ready!"
                description="Successfully generated and ready for download."
              />

              {/* Video player — full width */}
              <div className="rounded-xl overflow-hidden border border-gray-200 bg-black">
                <video
                  key={activeVideoUrl}
                  src={activeVideoUrl}
                  controls
                  autoPlay
                  className="w-full block"
                />
              </div>

              {videoEditions.length > 0 && (
                <VideoEditionHistory
                  editions={videoEditions}
                  activeEditionId={activeEdition?.id}
                  onSelect={setActiveEditionId}
                />
              )}

              {selectedProject.parameters.storyboard && (
                <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Want to make changes?</p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      Reopen the saved storyboard, edit it, and render an updated version.
                    </p>
                  </div>
                  <button
                    type="button"
                    id="edit-video-btn"
                    onClick={() => {
                      setEditError('')
                      setShowEditModal(true)
                    }}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-gray-800"
                  >
                    <IconEdit />
                    Edit this edition
                    <CreditChip amount={3} className="bg-white/15 text-white" />
                  </button>
                </div>
              )}

              {/* Feedback */}
              {!(isFeedbackSubmitted || selectedProject.rating) && (
                <div className="flex items-center justify-start">
                  <FeedbackComponent onSubmit={handleFeedbackSubmit} />
                </div>
              )}

              {/* Action buttons */}
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2.5">Download Assets</p>
                <div className="grid grid-cols-4 gap-2.5 w-full">
                  <button
                    onClick={() => window.open(activeVideoUrl)}
                    className="w-full flex items-center justify-center gap-0 sm:gap-2 px-3 py-2 h-[38px] bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors border border-transparent cursor-pointer"
                    id="download-video-asset-btn"
                  >
                    <IconVideo className="shrink-0" />
                    <span className="truncate hidden sm:inline">Video</span>
                  </button>

                  <button
                    onClick={() => activeAudioUrl && window.open(activeAudioUrl)}
                    disabled={!activeAudioUrl}
                    className="w-full flex items-center justify-center gap-0 sm:gap-2 px-3 py-2 h-[38px] bg-white text-gray-700 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    id="download-audio-btn"
                  >
                    <IconAudio className="shrink-0" />
                    <span className="truncate hidden sm:inline">Voiceover</span>
                  </button>

                  <ShareSheet
                    users={shareOptions}
                    onShareComplete={option => handleShareComplete(option, activeVideoUrl!)}
                    containerClassName="w-full"
                    className="w-full flex items-center justify-center gap-0 sm:gap-2 px-3 py-2 h-[38px] bg-white text-gray-700 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    placement="top"
                    triggerContent={
                      <>
                        <IconShare className="shrink-0" />
                        <span className="truncate hidden sm:inline">Share Video</span>
                      </>
                    }
                  />

                  {isPendingDelete ? (
                    <div className="w-full flex items-center justify-center h-[38px] bg-red-50/10 border border-dashed border-red-200 rounded-lg">
                      <TimedUndoAction
                        initialSeconds={5}
                        deleteLabel="Deleting..."
                        undoLabel="Cancel"
                        icon={
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="text-white"
                          >
                            <path d="M3 7v6h6" />
                            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                          </svg>
                        }
                        onConfirm={handleConfirmDelete}
                        onUndo={() => setIsPendingDelete(false)}
                        onDismiss={() => setIsPendingDelete(false)}
                      />
                    </div>
                  ) : (
                    <Button35
                      onClick={() => {
                        if (selectedProject.status === 'FAILED') setIsPendingDelete(true)
                        else setShowModal(true)
                      }}
                      className="w-full"
                      id="delete-video-btn"
                      title="Delete"
                    >
                      <span className="hidden sm:inline">Delete Video</span>
                    </Button35>
                  )}
                </div>
              </div>

              {/* Project details — collapsible */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden text-xs">
                <button
                  onClick={() => setIsDetailsOpen(o => !o)}
                  className="w-full flex items-center justify-between px-4 py-3 cursor-pointer bg-transparent border-none text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-700">Project Details</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={`text-gray-400 transition-transform duration-200 ${isDetailsOpen ? 'rotate-180' : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isDetailsOpen && (
                  <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
                    <div className="pt-3">
                      <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                        Target URL
                      </span>
                      <p className="text-gray-700 font-medium mt-0.5 break-all">
                        {selectedProject.parameters.url}
                      </p>
                    </div>

                    {selectedProject.parameters.instructions && (
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                          Instructions
                        </span>
                        <p className="text-gray-700 mt-0.5 leading-relaxed line-clamp-4">
                          {selectedProject.parameters.instructions}
                        </p>
                      </div>
                    )}

                    {selectedProject.parameters.script && (
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                          Custom Script
                        </span>
                        <p className="text-gray-700 mt-0.5 leading-relaxed line-clamp-3">
                          {selectedProject.parameters.script}
                        </p>
                      </div>
                    )}

                    {selectedProject.parameters.audio && (
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                          Voice / Audio
                        </span>
                        <p className="text-gray-700 font-medium mt-0.5 capitalize">
                          {selectedProject.parameters.audio}
                        </p>
                      </div>
                    )}

                    {(selectedProject.parameters.theme ||
                      selectedProject.parameters.subtitles !== undefined) && (
                      <div className="grid grid-cols-2 gap-3">
                        {selectedProject.parameters.theme && (
                          <div>
                            <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                              Theme
                            </span>
                            <p className="text-gray-700 font-medium mt-0.5 capitalize">
                              {selectedProject.parameters.theme}
                            </p>
                          </div>
                        )}
                        {selectedProject.parameters.subtitles !== undefined && (
                          <div>
                            <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                              Subtitles
                            </span>
                            <p className="text-gray-700 font-medium mt-0.5">
                              {selectedProject.parameters.subtitles ? 'Enabled' : 'Disabled'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedProject.parameters.headers && (
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                          Custom Headers
                        </span>
                        <pre className="text-gray-700 mt-0.5 whitespace-pre-wrap break-all font-mono text-[10px] bg-gray-50 rounded-md p-2 border border-gray-100 max-h-24 overflow-y-auto">
                          {typeof selectedProject.parameters.headers === 'string'
                            ? JSON.stringify(
                                JSON.parse(selectedProject.parameters.headers),
                                null,
                                2,
                              )
                            : JSON.stringify(selectedProject.parameters.headers, null, 2)}
                        </pre>
                      </div>
                    )}

                    {selectedProject.parameters.cookies && (
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                          Cookies
                        </span>
                        <pre className="text-gray-700 mt-0.5 whitespace-pre-wrap break-all font-mono text-[10px] bg-gray-50 rounded-md p-2 border border-gray-100 max-h-24 overflow-y-auto">
                          {typeof selectedProject.parameters.cookies === 'string'
                            ? JSON.stringify(
                                JSON.parse(selectedProject.parameters.cookies),
                                null,
                                2,
                              )
                            : JSON.stringify(selectedProject.parameters.cookies, null, 2)}
                        </pre>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                          Created
                        </span>
                        <p className="text-gray-700 font-medium mt-0.5">
                          {new Date(selectedProject.createdAt).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px] font-semibold">
                          Completed
                        </span>
                        <p className="text-gray-700 font-medium mt-0.5">
                          {new Date(selectedProject.updatedAt).toLocaleString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Failed state */}
          {isFailed && (
            <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-8">
              <div className="flex flex-col items-center text-center">
                <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mb-4 text-red-400">
                  <IconXCircle />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Generation Failed</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Something went wrong during the video generation process.
                </p>

                {/* Real-time phase progress widget — visible even during failure to show where it failed */}
                <div className="mt-5 w-full max-w-2xl mx-auto">
                  <VideoProgressWidget project={selectedProject} />
                </div>

                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer mt-6"
                  id="failed-back-btn"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showEditModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => !editBusy && setShowEditModal(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full border border-gray-200 bg-gray-50 text-gray-800">
                <IconEdit />
              </div>
              <h3 className="text-center text-lg font-bold text-gray-900">Edit this edition?</h3>
              <p className="mt-2 text-center text-sm leading-relaxed text-gray-500">
                This charges 3 credits now. Its saved storyboard will open for review, and rendering
                the updated edition will not charge again.
              </p>
              <div className="mt-4 flex items-center justify-center">
                <CreditChip amount={3} className="bg-gray-100 text-gray-700" />
              </div>
              {editError && (
                <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-center text-xs font-medium text-red-700">
                  {editError}
                </p>
              )}
              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  disabled={editBusy}
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 rounded-xl border border-gray-200 bg-gray-100 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  id="confirm-edit-video-btn"
                  disabled={editBusy}
                  onClick={() => void handleBeginEdit()}
                  className="flex-1 rounded-xl bg-gray-900 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60"
                >
                  {editBusy ? 'Opening editor…' : 'Pay 3 & edit'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {showModal &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={e => {
              e.stopPropagation()
              setShowModal(false)
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-center animate-in fade-in zoom-in-95 duration-200"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                <IconTrashSm />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Video</h3>
              <p className="text-sm text-gray-500 mb-6 text-balance leading-relaxed">
                Are you sure you want to delete this video? Please note that the credits used for
                this generation are{' '}
                <span className="font-semibold text-gray-700">non-refundable</span> because the
                video has already started rendering or is completed.
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold text-sm rounded-xl transition-colors cursor-pointer border border-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowModal(false)
                    setIsPendingDelete(true)
                  }}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer border border-red-700"
                >
                  Proceed
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
