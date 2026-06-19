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
  if (ms === null || ms < 0) return '—';
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function JobDetailsModal({ job, onClose, onDelete, onUpdate }: { job: any; onClose: () => void; onDelete: (id: string) => void; onUpdate: (job: any) => void }) {
  const { getToken } = useAuth();
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [phasesExpanded, setPhasesExpanded] = React.useState(false);
  const [status, setStatus] = React.useState(job?.status || 'PENDING');
  const [updatingStatus, setUpdatingStatus] = React.useState(false);

  React.useEffect(() => {
    if (job) setStatus(job.status);
  }, [job]);

  if (!job) return null;

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const token = await getToken();
      if (!token) return;
      
      const res = await api.post<{ success: boolean; job: any }>(
        `/admin/jobs/${job.id}/status`,
        token,
        { status: newStatus }
      );

      if (res.success) {
        setStatus(newStatus);
        onUpdate({ ...job, status: newStatus });
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update job status');
    } finally {
      setUpdatingStatus(false);
    }
  };

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

  const statusStyle =
    status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
    status === 'FAILED'    ? 'bg-red-100 text-red-700' :
                             'bg-blue-100 text-blue-700';

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full sm:rounded-2xl sm:max-w-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h3 className="text-base font-semibold text-gray-900">Job Details</h3>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-lg uppercase tracking-wide ${statusStyle}`}>
              {job.status}
            </span>
            {job.isRefunded && (
              <span className="text-xs font-bold px-2 py-1 rounded-lg bg-purple-100 text-purple-700 uppercase">↩ Refunded</span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Core info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-4">
              {/* Job ID */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Job ID</p>
                <div className="font-mono text-xs text-gray-700 bg-gray-50 border border-gray-100 px-3 py-2 rounded-xl break-all">{job.id}</div>
              </div>

              {/* User */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">User</p>
                <div className="text-sm text-gray-900 font-medium">{job.userName || 'Unknown'}</div>
                <div className="text-xs text-gray-500">{job.userEmail || job.userId}</div>
              </div>

              {/* Timing */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Timing</p>
                <div className="text-sm text-gray-700">{formatIST(job.createdAt)}</div>
                {job.timeTakenMs !== null && (
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    Duration: <span className="font-semibold text-gray-800">{formatDuration(job.timeTakenMs)}</span>
                  </div>
                )}
                {job.workerId && (
                  <div className="text-xs text-gray-500 mt-1">
                    Worker: <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-700">{job.workerId}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {/* Job Status (Admin Editable) */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Set Job Status</p>
                <div className="flex items-center gap-2">
                  <select
                    value={status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={updatingStatus}
                    className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 cursor-pointer disabled:opacity-50"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="PROCESSING">PROCESSING</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="FAILED">FAILED</option>
                  </select>
                  {updatingStatus && (
                    <div className="w-4 h-4 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                  )}
                </div>
              </div>

              {/* Cost */}
              {job.cost > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Processing Cost</p>
                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 text-emerald-700 font-bold text-sm px-3 py-1.5 rounded-xl">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    ${job.cost.toFixed(4)}
                  </div>
                </div>
              )}

              {/* User Feedback */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">User Feedback</p>
                {job.rating ? (
                  <div className="space-y-2">
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold ${
                      job.rating === 'up'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-red-50 text-red-600 border border-red-100'
                    }`}>
                      <span className="text-base">{job.rating === 'up' ? '👍' : '👎'}</span>
                      {job.rating === 'up' ? 'Positive' : 'Negative'}
                    </div>
                    {job.feedback && (
                      <div className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <p className="text-sm text-gray-700 italic leading-relaxed">"{job.feedback}"</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">No feedback given</span>
                )}
              </div>

              {/* Failure reason */}
              {job.status === 'FAILED' && job.error && (
                <div>
                  <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1.5">Failure Reason</p>
                  <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                    <p className="text-xs text-red-800 break-words whitespace-pre-wrap font-mono leading-relaxed">{job.error}</p>
                  </div>
                </div>
              )}

              {/* Media links */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Media</p>
                <div className="flex flex-wrap gap-2">
                  {job.videoUrl ? (
                    <a href={job.videoUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors border border-blue-100">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                      Video
                    </a>
                  ) : job.pdfUrl ? (
                    <a href={job.pdfUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-colors border border-rose-100">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                      PDF
                    </a>
                  ) : <span className="text-xs text-gray-400">No media</span>}
                  {job.audioUrl && (
                    <a href={job.audioUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-xl transition-colors border border-purple-100">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                      Audio
                    </a>
                  )}
                  {job.thumbnailUrl && (
                    <a href={job.thumbnailUrl} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-600 hover:text-teal-800 bg-teal-50 hover:bg-teal-100 px-3 py-1.5 rounded-xl transition-colors border border-teal-100">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                      Thumbnail
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Processing Phases */}
          {job.phases && (
            <div>
              <button
                onClick={() => setPhasesExpanded(p => !p)}
                className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 hover:text-gray-800 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`transition-transform ${phasesExpanded ? 'rotate-90' : ''}`}>
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
                Processing Phases
              </button>
              {phasesExpanded && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 shadow-inner space-y-2">
                  {(job.phases as any[]).map((phase, idx, arr) => {
                    let durationStr = '—';
                    if (phase.status === 'completed') {
                      if (phase.durationMs !== undefined) {
                        durationStr = formatDuration(phase.durationMs);
                      } else if (phase.completedAt) {
                        const startStr = phase.startedAt || (idx === 0 ? job.createdAt : (arr[idx - 1].completedAt || job.createdAt));
                        const start = new Date(startStr).getTime();
                        const end = new Date(phase.completedAt).getTime();
                        const diff = end - start;
                        if (diff >= 0) durationStr = formatDuration(diff);
                      }
                      if (phase.retryDurationMs) {
                        const retryText = phase.retryCount ? `${phase.retryCount} failed retries` : 'Failed retries';
                        durationStr += ` (${retryText}: ${formatDuration(phase.retryDurationMs)})`;
                      }
                    } else if (phase.status === 'running') {
                      let liveDuration = '';
                      if (phase.startedAt) {
                        const start = new Date(phase.startedAt).getTime();
                        const diff = Date.now() - start;
                        if (diff >= 0) liveDuration = formatDuration(diff);
                      }
                      durationStr = liveDuration ? `Running… (${liveDuration})` : 'Running…';
                      if (phase.retryDurationMs) {
                        const retryText = phase.retryCount ? `${phase.retryCount} retries` : 'Retries';
                        durationStr += ` | ${retryText}: ${formatDuration(phase.retryDurationMs)}`;
                      }
                    } else if (phase.status === 'failed') {
                      durationStr = 'Failed';
                      if (phase.retryDurationMs) {
                        const retryText = phase.retryCount ? `${phase.retryCount} attempts` : 'Total time';
                        durationStr += ` (${retryText}: ${formatDuration(phase.retryDurationMs)})`;
                      }
                    }

                    return (
                      <div key={phase.phase} className="flex flex-col text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0 gap-1.5 pt-2 first:pt-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={
                              phase.status === 'completed' ? 'text-green-600' :
                              phase.status === 'failed' ? 'text-red-600' :
                              phase.status === 'running' ? 'text-blue-600' :
                              'text-gray-400'
                            }>
                              {phase.status === 'completed' ? '✅' :
                               phase.status === 'failed' ? '❌' :
                               phase.status === 'running' ? '🔄' : '⏳'}
                            </span>
                            <span className="text-gray-800 font-medium">{phase.label || phase.phase}</span>
                          </div>
                          <span className="text-gray-500 font-mono text-xs">{durationStr}</span>
                        </div>
                        {phase.failedAttempts && phase.failedAttempts.length > 0 && (
                          <div className="pl-6 space-y-1 mt-0.5">
                            {phase.failedAttempts.map((attempt: any, i: number) => {
                              const startStr = new Date(attempt.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
                              const endStr = new Date(attempt.endedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' });
                              return (
                                <div key={i} className="flex items-center justify-between text-[11px] text-gray-500 bg-gray-100/50 px-2 py-1 rounded-md">
                                  <span>{i + 1}{i === 0 ? 'st' : i === 1 ? 'nd' : i === 2 ? 'rd' : 'th'} retry: {formatDuration(attempt.durationMs)}</span>
                                  <span className="font-mono text-gray-400">{startStr} - {endStr}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Job Parameters */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Parameters</p>
            <div className="bg-gray-900 rounded-xl p-4 overflow-x-auto shadow-inner">
              <pre className="text-xs text-emerald-400 font-mono leading-relaxed">
                {JSON.stringify(job.parameters, null, 2)}
              </pre>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between shrink-0">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 font-medium text-sm rounded-xl transition-colors border border-red-200 disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
            </svg>
            {isDeleting ? 'Deleting…' : (job.status === 'PENDING' || job.status === 'PROCESSING') ? 'Cancel Job' : 'Delete Job'}
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 font-medium text-sm rounded-xl transition-colors text-gray-700">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
