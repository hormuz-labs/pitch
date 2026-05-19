import { formatIST, formatDuration } from './JobDetailsModal';

export function GlobalJobsTable({ jobs, onSelectJob }: { jobs: any[]; onSelectJob: (job: any) => void }) {
  if (!jobs || jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
          <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
        <p className="text-sm font-medium">No jobs in the system</p>
      </div>
    );
  }

  const statusStyle = (status: string) => {
    if (status === 'COMPLETED') return 'bg-emerald-100 text-emerald-700';
    if (status === 'FAILED') return 'bg-red-100 text-red-700';
    if (status === 'PROCESSING') return 'bg-blue-100 text-blue-700';
    return 'bg-amber-100 text-amber-700';
  };

  return (
    <div className="w-full">
      {/* Scrollable table wrapper — isolated scroll, never clipped by parent */}
      <div className="overflow-x-auto w-full" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="text-sm text-left" style={{ minWidth: 720 }}>
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Job / URL</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">User</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Status</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Rating</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap text-right">Cost</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Created (IST)</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Duration</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Worker</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {jobs.map(job => (
              <tr
                key={job.id}
                onClick={() => onSelectJob(job)}
                className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <div className="font-mono text-[10px] text-gray-400 mb-0.5">{job.id.slice(-8)}</div>
                  <div className="font-medium text-gray-800 text-xs" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={job.parameters?.url}>
                    {job.parameters?.url || <span className="text-gray-400">No URL</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900 text-sm whitespace-nowrap">{job.userName || 'Unknown'}</div>
                  <div className="text-xs text-gray-400 whitespace-nowrap">{job.userEmail}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${statusStyle(job.status)}`}>
                    {job.status}
                  </span>
                  {job.isRefunded && (
                    <div className="text-[10px] text-purple-600 font-semibold mt-1">↩ REFUNDED</div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {job.rating === 'up'   ? <span className="text-base" title="Positive">👍</span>
                  : job.rating === 'down' ? <span className="text-base" title="Negative">👎</span>
                  : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="text-xs font-semibold text-gray-600">
                    {job.cost ? `$${job.cost.toFixed(4)}` : '—'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {formatIST(job.createdAt)}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">
                  {formatDuration(job.timeTakenMs)}
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                    {job.workerId ? job.workerId.slice(0, 14) : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
