import { FLOWS } from '../../lib/studio-api'
import { formatIST } from './format'
import type { AdminProject } from './ProjectsTable'

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
    <div className="text-sm text-gray-900">{children}</div>
  </div>
)

export function ProjectDetailsModal({
  project,
  onClose,
}: {
  project: AdminProject
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 truncate pr-4">
            {project.title || 'Untitled project'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors cursor-pointer border-none bg-transparent"
            aria-label="Close"
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
          <div className="grid grid-cols-2 gap-4">
            <Row label="Project id">
              <span className="font-mono text-xs">{project.id}</span>
            </Row>
            <Row label="Flow">{FLOWS[project.flow]?.title ?? project.flow}</Row>
            <Row label="Status">
              <span className="text-xs font-bold uppercase tracking-wide">{project.status}</span>
              {project.busy && <span className="ml-2 text-xs text-blue-600">busy</span>}
            </Row>
            <Row label="Credits charged">{project.creditsCharged ?? 0}</Row>
            <Row label="Workspace">
              <span className="font-mono text-xs break-all">{project.name}</span>
            </Row>
            <Row label="Legacy job">
              {project.legacyJobId ? (
                <span className="font-mono text-xs">{project.legacyJobId}</span>
              ) : (
                <span className="text-gray-400 text-xs">—</span>
              )}
            </Row>
          </div>

          <Row label="User">
            <p className="font-medium">{project.userName || 'Unknown'}</p>
            <p className="text-xs text-gray-500">{project.userEmail}</p>
            <p className="font-mono text-[10px] text-gray-400">{project.userId}</p>
          </Row>

          <div className="grid grid-cols-2 gap-4">
            <Row label="Created">
              <span className="text-xs text-gray-600">{formatIST(project.createdAt)}</span>
            </Row>
            <Row label="Updated">
              <span className="text-xs text-gray-600">{formatIST(project.updatedAt)}</span>
            </Row>
          </div>

          {project.prompt && (
            <Row label="Prompt">
              <p className="text-xs text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                {project.prompt}
              </p>
            </Row>
          )}

          {project.options && Object.keys(project.options).length > 0 && (
            <Row label="Options">
              <pre className="text-[11px] text-gray-700 bg-gray-50 rounded-lg p-3 overflow-x-auto">
                {JSON.stringify(project.options, null, 2)}
              </pre>
            </Row>
          )}

          {project.lastError && (
            <Row label="Last error">
              <p className="text-xs text-red-600 bg-red-50 rounded-lg p-3 break-words">
                {project.lastError}
              </p>
            </Row>
          )}

          <Row label="Outputs">
            {project.outputs?.length ? (
              <ul className="space-y-1">
                {project.outputs.map(o => (
                  <li key={o.url} className="flex items-center gap-2 text-xs">
                    <span className="w-20 shrink-0 font-semibold text-gray-700">
                      {o.kind}
                      {o.res ? ` · ${o.res}` : ''}
                    </span>
                    <a
                      href={o.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-blue-600 hover:underline"
                    >
                      {o.url}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-gray-400">None yet</span>
            )}
          </Row>

          {project.isPublic && project.shareSlug && (
            <Row label="Share">
              <a
                href={`/d/${project.shareSlug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                /d/{project.shareSlug}
              </a>
              <span className="ml-2 text-xs text-gray-400">{project.shareViews} views</span>
            </Row>
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
