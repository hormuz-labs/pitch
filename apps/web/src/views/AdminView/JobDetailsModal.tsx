import React from 'react';
import { api } from '../../lib/api';
import { useAuth } from '@clerk/clerk-react';

export function formatIST(dateString: string) {
  const d = new Date(dateString);
  return d.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).toUpperCase() + ' IST';
}

export function formatDuration(ms: number | null) {
  if (ms === null || ms < 0) return '-';
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function JobDetailsModal({ job, onClose, onDelete }: { job: any, onClose: () => void, onDelete: (id: string) => void }) {
  const { getToken } = useAuth();
  const [isDeleting, setIsDeleting] = React.useState(false);

  if (!job) return null;

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to permanently delete/cancel this job?')) return;
    setIsDeleting(true);
    try {
      const token = await getToken();
      if (!token) return;
      await api.delete(`/admin/jobs/${job.id}`, token);
      onDelete(job.id);
      onClose();
    } catch (err: any) {
      alert(err.message || 'Failed to delete job');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-900">Job Details</h3>
            <span className={`text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider ${
                job.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                job.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                'bg-blue-100 text-blue-800'
            }`}>
              {job.status}
            </span>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Job ID</div>
                <div className="font-mono text-sm text-gray-900 bg-gray-50 p-2 rounded border border-gray-100">{job.id}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">User</div>
                <div className="text-sm text-gray-900">{job.userName || 'Unknown'} <span className="text-gray-500">({job.userEmail || job.userId})</span></div>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Timing</div>
                <div className="text-sm text-gray-900">{formatIST(job.createdAt)}</div>
                {job.timeTakenMs !== null && (
                  <div className="text-sm text-gray-600 mt-1">Duration: <span className="font-medium text-gray-900">{formatDuration(job.timeTakenMs)}</span></div>
                )}
              </div>
            </div>

            <div className="space-y-4">
               <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Refund Status</div>
                {job.isRefunded ? (
                  <span className="inline-flex text-sm font-medium px-2 py-1 rounded bg-purple-100 text-purple-700 items-center gap-1 mb-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                    Refunded Successfully
                  </span>
                ) : job.status === 'FAILED' ? (
                  <span className="inline-block text-sm text-red-600 bg-red-50 px-2 py-1 rounded mb-2">No Refund / Pending</span>
                ) : (
                  <span className="inline-block text-sm text-gray-500 mb-2">Not Applicable</span>
                )}
                {job.status === 'FAILED' && job.error && (
                  <div className="mt-2 bg-red-50 border border-red-100 p-3 rounded-lg">
                    <div className="text-[11px] font-bold text-red-800 uppercase tracking-wide mb-1">Failure Reason</div>
                    <div className="text-sm text-red-900 break-words whitespace-pre-wrap">{job.error}</div>
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Media Links</div>
                <div className="space-y-2">
                  {job.videoUrl ? (
                    <a href={job.videoUrl} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-800 hover:underline">
                      View Generated Video
                    </a>
                  ) : <span className="text-sm text-gray-400">No Video Available</span>}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Job Parameters</div>
            <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto shadow-inner">
              <pre className="text-xs text-green-400 font-mono">
                {JSON.stringify(job.parameters, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <button 
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 font-medium text-sm rounded-lg transition-colors border border-red-200 disabled:opacity-50"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
            {isDeleting ? 'Deleting...' : (job.status === 'PENDING' || job.status === 'PROCESSING') ? 'Cancel Job' : 'Delete Job'}
          </button>
          
          <button 
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 font-medium text-sm rounded-lg transition-colors text-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
