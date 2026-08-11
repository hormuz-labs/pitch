import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PdfCard } from '../components/PdfCard'
import { VideoCard } from '../components/VideoCard'
import { launchVideoDestination } from '../launch-video/navigation'
import type { Project } from '../types'

// ── Icons ──────────────────────────────────────────────────────────────────────

const IconSort = () => (
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
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="15" y2="12" />
    <line x1="3" y1="18" x2="9" y2="18" />
  </svg>
)

const IconEmptyVideo = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-300"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
)
const IconEmptyPdf = () => (
  <svg
    width="40"
    height="40"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-gray-300"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
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
const IconChevronUp = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
)
const IconChevronDown = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

// ── Dashboard View ─────────────────────────────────────────────────────────────
interface DashboardViewProps {
  projects: Project[]
  searchQuery: string
  onDelete: (id: string) => void
  onRetry: (id: string) => void
}

export const DashboardView = ({ projects, searchQuery, onDelete, onRetry }: DashboardViewProps) => {
  const navigate = useNavigate()
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest')
  const [activeTab, setActiveTab] = useState<'all' | 'videos' | 'pdfs'>('all')

  const totalPdfsCount = useMemo(
    () =>
      projects.filter(p => p.parameters?.jobType === 'pdf' || p.parameters?.jobType === 'enhance')
        .length,
    [projects],
  )
  const totalVideosCount = useMemo(
    () =>
      projects.filter(p => p.parameters?.jobType !== 'pdf' && p.parameters?.jobType !== 'enhance')
        .length,
    [projects],
  )

  const displayedProjects = useMemo(() => {
    let list = [...projects]

    if (activeTab === 'videos') {
      list = list.filter(
        p => p.parameters?.jobType !== 'pdf' && p.parameters?.jobType !== 'enhance',
      )
    } else if (activeTab === 'pdfs') {
      list = list.filter(
        p => p.parameters?.jobType === 'pdf' || p.parameters?.jobType === 'enhance',
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        p =>
          (p.parameters?.url || '').toLowerCase().includes(q) ||
          (p.parameters?.topic || '').toLowerCase().includes(q) ||
          (p.parameters?.instructions || '').toLowerCase().includes(q) ||
          p.status.toLowerCase().includes(q),
      )
    }

    list.sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      return sortOrder === 'newest' ? -diff : diff
    })

    return list
  }, [projects, searchQuery, sortOrder, activeTab])

  const toggleSort = () => setSortOrder(o => (o === 'newest' ? 'oldest' : 'newest'))

  const pageHeaderTitle =
    activeTab === 'videos'
      ? 'Recent Videos'
      : activeTab === 'pdfs'
        ? 'PDF Presentations'
        : 'Recent Creations'
  const pageHeaderDesc =
    activeTab === 'videos'
      ? 'Manage your generated video content.'
      : activeTab === 'pdfs'
        ? 'Manage your generated PDF slide decks.'
        : 'Manage all generated content.'

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
      {/* Page header */}
      <div className="mb-6">
        {/* Title row */}
        <div className="flex items-start justify-between gap-4 mb-3 md:mb-0">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 leading-tight">{pageHeaderTitle}</h1>
            <p className="text-sm text-gray-500 mt-1">{pageHeaderDesc}</p>
          </div>
          {/* On md+ the controls sit here, right-aligned with the title */}
          <div className="hidden md:flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5 gap-0.5">
              {(['all', 'videos', 'pdfs'] as const).map(tab => {
                const labels: Record<string, string> = {
                  all: `All (${projects.length})`,
                  videos: `Videos (${totalVideosCount})`,
                  pdfs: `PDFs (${totalPdfsCount})`,
                }
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    id={`tab-${tab}-btn`}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-150 cursor-pointer ${
                      activeTab === tab
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {labels[tab]}
                  </button>
                )
              })}
            </div>
            <button
              onClick={toggleSort}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              id="sort-btn"
            >
              <IconSort />
              Sort: {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
              <span className="ml-0.5 text-gray-400">
                {sortOrder === 'newest' ? <IconChevronDown /> : <IconChevronUp />}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile: filters + sort — single fixed row, no scroll, tighter sizing */}
        <div className="flex md:hidden items-center justify-between w-full gap-2">
          <div className="flex items-center bg-gray-100 rounded-md p-0.5 gap-0.5">
            {(['all', 'videos', 'pdfs'] as const).map(tab => {
              const labels: Record<string, string> = {
                all: `All (${projects.length})`,
                videos: `Videos (${totalVideosCount})`,
                pdfs: `PDFs (${totalPdfsCount})`,
              }
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  id={`tab-mobile-${tab}-btn`}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-all duration-150 cursor-pointer whitespace-nowrap ${
                    activeTab === tab
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {labels[tab]}
                </button>
              )
            })}
          </div>
          <button
            onClick={toggleSort}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
            id="sort-btn-mobile"
          >
            <IconSort />
            {sortOrder === 'newest' ? 'Newest' : 'Oldest'}
            <span className="text-gray-400">
              {sortOrder === 'newest' ? <IconChevronDown /> : <IconChevronUp />}
            </span>
          </button>
        </div>
      </div>

      {/* No search results */}
      {searchQuery && displayedProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
            {activeTab === 'pdfs' ? <IconEmptyPdf /> : <IconEmptyVideo />}
          </div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">No results found</h3>
          <p className="text-xs text-gray-400 max-w-xs">
            No items match "<span className="font-medium">{searchQuery}</span>". Try a different
            search.
          </p>
        </div>
      )}

      {/* Empty states when no search query */}
      {!searchQuery && (
        <>
          {/* All Empty */}
          {activeTab === 'all' && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                <IconEmptyVideo />
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">No creations yet</h3>
              <p className="text-xs text-gray-400 mb-5 max-w-xs">
                Generate a video or PDF presentation using AI to get started.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => navigate('/new')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
                  id="empty-create-video-btn"
                >
                  <IconPlus /> Create Video
                </button>
                <button
                  onClick={() => navigate('/pdf')}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white text-gray-900 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  id="empty-create-pdf-btn"
                >
                  <IconPlus /> Create PDF
                </button>
              </div>
            </div>
          )}

          {/* Videos Tab Empty */}
          {activeTab === 'videos' && totalVideosCount === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                <IconEmptyVideo />
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">No videos yet</h3>
              <p className="text-xs text-gray-400 mb-5 max-w-xs">
                Create your first AI demo video and it will appear here.
              </p>
              <button
                onClick={() => navigate('/new')}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
                id="empty-create-video-tab-btn"
              >
                <IconPlus /> Create New Video
              </button>
            </div>
          )}

          {/* PDFs Tab Empty */}
          {activeTab === 'pdfs' && totalPdfsCount === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-xl flex items-center justify-center mb-4">
                <IconEmptyPdf />
              </div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">No PDF presentations yet</h3>
              <p className="text-xs text-gray-400 mb-5 max-w-xs">
                Generate your first premium PDF presentation slide deck.
              </p>
              <button
                onClick={() => navigate('/pdf')}
                className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors border-none cursor-pointer"
                id="empty-create-pdf-tab-btn"
              >
                <IconPlus /> Create New PDF
              </button>
            </div>
          )}
        </>
      )}

      {/* Card grid */}
      {displayedProjects.length > 0 && (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {displayedProjects.map(project => {
            if (
              project.parameters?.jobType === 'pdf' ||
              project.parameters?.jobType === 'enhance'
            ) {
              return (
                <PdfCard
                  key={project.id}
                  project={project}
                  onClick={() => navigate(`/pdfeditor/${project.id}`)}
                  onConfirmDelete={() => onDelete(project.id)}
                />
              )
            }
            return (
              <VideoCard
                key={project.id}
                project={project}
                onClick={() =>
                  project.parameters?.jobType === 'launch-video'
                    ? navigate(launchVideoDestination(project))
                    : navigate(`/editor/${project.id}`)
                }
                onConfirmDelete={() => onDelete(project.id)}
                onRetry={() => onRetry(project.id)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
