import { formatIST, formatDuration } from './JobDetailsModal';

export function GlobalJobsTable({ jobs, onSelectJob }: { jobs: any[], onSelectJob: (job: any) => void }) {
  if (!jobs || jobs.length === 0) {
    return <div className="p-8 text-center text-gray-500 text-sm">No jobs found in the system.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-5 py-3 font-medium">Job ID / URL</th>
            <th className="px-5 py-3 font-medium">User</th>
            <th className="px-5 py-3 font-medium">Status</th>
            <th className="px-5 py-3 font-medium">Created (IST)</th>
            <th className="px-5 py-3 font-medium">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {jobs.map(job => (
            <tr 
              key={job.id} 
              onClick={() => onSelectJob(job)}
              className="hover:bg-gray-50/80 transition-colors cursor-pointer group"
            >
              <td className="px-5 py-3">
                <div className="font-mono text-xs text-gray-500 mb-1">{job.id.slice(-8)}</div>
                <div className="font-medium text-gray-900 truncate max-w-[200px]" title={job.parameters?.url}>
                  {job.parameters?.url || 'No URL'}
                </div>
              </td>
              <td className="px-5 py-3">
                <div className="font-medium text-gray-900">{job.userName || 'Unknown'}</div>
                <div className="text-xs text-gray-500 mt-0.5">{job.userEmail}</div>
              </td>
              <td className="px-5 py-3">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full uppercase ${
                  job.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                  job.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                  'bg-blue-100 text-blue-800'
                }`}>
                  {job.status}
                </span>
                {job.isRefunded && <div className="text-[10px] text-purple-600 font-medium mt-1">REFUNDED</div>}
              </td>
              <td className="px-5 py-3 text-gray-600 text-xs whitespace-nowrap">
                {formatIST(job.createdAt)}
              </td>
              <td className="px-5 py-3 text-gray-600 text-xs">
                {formatDuration(job.timeTakenMs)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
