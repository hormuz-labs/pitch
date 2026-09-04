import { FlowGlyph } from '../../components/FlowGlyph'
import { FLOWS, type Project } from '../../lib/studio-api'
import { formatIST } from './format'

export type AdminProject = Project & { userEmail?: string | null; userName?: string | null }

const statusStyle = (status: string) => {
  if (status === 'ready') return 'bg-emerald-100 text-emerald-700'
  if (status === 'failed') return 'bg-red-100 text-red-700'
  if (status === 'working') return 'bg-blue-100 text-blue-700'
  if (status === 'legacy') return 'bg-gray-100 text-gray-600'
  return 'bg-amber-100 text-amber-700'
}

export function ProjectsTable({
  projects,
  onSelectProject,
}: {
  projects: AdminProject[]
  onSelectProject: (project: AdminProject) => void
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
        <p className="text-sm font-medium">No projects in the system</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="text-sm text-left" style={{ minWidth: 820 }}>
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Project</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Flow</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">User</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Status</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap text-right">
                Credits
              </th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">
                Created (IST)
              </th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Outputs</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {projects.map(p => (
              <tr
                key={p.id}
                onClick={() => onSelectProject(p)}
                className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="font-mono text-[10px] text-gray-400 mb-0.5">{p.id.slice(-8)}</div>
                  <div
                    className="font-medium text-gray-800 text-xs"
                    style={{
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={p.title}
                  >
                    {p.title || <span className="text-gray-400">Untitled</span>}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700">
                    <FlowGlyph flow={p.flow} size={12} />
                    {FLOWS[p.flow]?.title ?? p.flow}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 text-sm whitespace-nowrap">
                    {p.userName || 'Unknown'}
                  </div>
                  <div className="text-xs text-gray-400 whitespace-nowrap">{p.userEmail}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span
                    className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${statusStyle(p.status)}`}
                  >
                    {p.status}
                  </span>
                  {p.lastError && (
                    <div
                      className="text-[10px] text-red-500 mt-1 truncate max-w-[160px]"
                      title={p.lastError}
                    >
                      {p.lastError}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="text-xs font-semibold text-gray-600 tabular-nums">
                    {p.creditsCharged ?? 0}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {formatIST(p.createdAt)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.outputs?.length ? (
                    <span className="text-xs font-medium text-emerald-600">
                      {p.outputs.map(o => o.kind + (o.res ? ` ${o.res}` : '')).join(', ')}
                    </span>
                  ) : (
                    <span className="text-gray-300 text-xs">—</span>
                  )}
                  {p.isPublic && (
                    <div className="text-[10px] text-purple-600 font-semibold mt-1">
                      SHARED · {p.shareViews} views
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
