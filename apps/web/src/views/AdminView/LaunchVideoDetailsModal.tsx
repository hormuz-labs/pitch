import { formatIST } from './JobDetailsModal'

export function LaunchVideoDetailsModal({
  project,
  onClose,
}: {
  project: any
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div
        className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900">Launch Video Project</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer border-none bg-transparent"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              Project name
            </p>
            <p className="text-sm font-medium text-gray-900">{project.name}</p>
          </div>

          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">User</p>
            <p className="text-sm font-medium text-gray-900">{project.userName || 'Unknown'}</p>
            <p className="text-xs text-gray-500">{project.userEmail}</p>
            <p className="font-mono text-[10px] text-gray-400">{project.userId}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Status</p>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${
                  project.hasVideo
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {project.hasVideo ? 'Rendered' : 'In Progress'}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Scenes</p>
              <p className="text-sm font-medium text-gray-900">{project.sceneCount}</p>
            </div>
          </div>

          {project.createdAt && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Created
              </p>
              <p className="text-xs text-gray-600">{formatIST(project.createdAt)}</p>
            </div>
          )}

          {project.videoUrl && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                Video path
              </p>
              <p className="text-xs text-gray-600 break-all">{project.videoUrl}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer border-none"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
