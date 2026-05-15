import React from 'react';
import { api } from '../../lib/api';
import { useAuth } from '@clerk/clerk-react';
import { formatIST, formatDuration } from './JobDetailsModal';

export function UserJobsModal({ userId, onClose, onSelectJob }: { userId: string, onClose: () => void, onSelectJob: (job: any) => void }) {
  const { getToken } = useAuth();
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    let isMounted = true;
    const fetchJobs = async () => {
      try {
        const token = await getToken();
        if (!token) return;
        const res = await api.get<any[]>(`/admin/users/${userId}/jobs`, token);
        if (isMounted) setJobs(res);
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load user jobs');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchJobs();
    return () => { isMounted = false; };
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">User Jobs</h3>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          {loading ? (
            <div className="flex justify-center p-8">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="text-center text-red-600 text-sm">{error}</div>
          ) : jobs.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-8">No jobs created by this user yet.</div>
          ) : (
            <div className="space-y-3">
              {jobs.map(job => (
                <div key={job.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{job.id.slice(-6)}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full uppercase ${
                        job.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                        job.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {job.status}
                      </span>
                      {job.isRefunded && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                          Refunded
                        </span>
                      )}
                    </div>
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {job.parameters?.url || 'No URL'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                      <span>{formatIST(job.createdAt)}</span>
                      {job.timeTakenMs !== null && (
                        <span className="flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                          {formatDuration(job.timeTakenMs)}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="shrink-0 flex items-center gap-2">
                    <button 
                      onClick={() => onSelectJob(job)}
                      className="text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-md transition-colors"
                    >
                      View Details
                    </button>
                    {job.videoUrl && (
                      <a href={job.videoUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-md transition-colors">
                        Video
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
