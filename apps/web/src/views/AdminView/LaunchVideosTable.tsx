import { formatIST } from './JobDetailsModal'

export function LaunchVideosTable({
  projects,
  onSelectProject,
}: {
  projects: any[]
  onSelectProject: (project: any) => void
}) {
  if (!projects || projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="mb-3 opacity-40"
        >
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
        <p className="text-sm font-medium">No launch video projects in the system</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="text-sm text-left" style={{ minWidth: 640 }}>
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Project</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">User</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Status</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Scenes</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Video</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">
                Created (IST)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {projects.map(project => (
              <tr
                key={`${project.userId}-${project.name}`}
                onClick={() => onSelectProject(project)}
                className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-800 text-xs">{project.name}</div>
                  <div className="font-mono text-[10px] text-gray-400">
                    {project.userId.slice(-12)}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 text-sm whitespace-nowrap">
                    {project.userName || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap">{project.userEmail}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${
                      project.hasVideo
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {project.hasVideo ? 'Rendered' : 'In Progress'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">
                  {project.sceneCount}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {project.videoUrl ? (
                    <span className="text-xs font-medium text-emerald-600">Available</span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {formatIST(project.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
