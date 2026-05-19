import { formatIST } from './JobDetailsModal';

interface FeedbackJob {
  id: string;
  userId: string;
  rating?: string | null;
  feedback?: string | null;
  status: string;
  cost: number;
  createdAt: string;
  updatedAt: string;
  parameters: { url?: string };
  userProfile: { email: string; firstName?: string; lastName?: string };
}

interface FeedbackSummary {
  thumbsUp: number;
  thumbsDown: number;
  withText: number;
  total: number;
}

interface Analytics {
  affiliates: any[];
  feedbackSummary: FeedbackSummary;
  jobsWithFeedback: FeedbackJob[];
}

export function FeedbackPanel({ analytics }: { analytics: Analytics | null }) {
  if (!analytics) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    );
  }

  const { feedbackSummary, jobsWithFeedback } = analytics;

  if (jobsWithFeedback.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 opacity-40">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p className="text-sm font-medium">No feedback received yet</p>
        <p className="text-xs mt-1">Feedback appears here once users rate their generated videos.</p>
      </div>
    );
  }

  const satisfactionRate = feedbackSummary.total > 0
    ? Math.round((feedbackSummary.thumbsUp / feedbackSummary.total) * 100)
    : 0;

  return (
    <div className="p-4 sm:p-5 space-y-5">
      {/* Summary cards — 2 col mobile, 4 col sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Satisfaction Rate', value: `${satisfactionRate}%`,        sub: `${feedbackSummary.total} total`, icon: '📊', color: 'from-indigo-50 to-indigo-100/50',   text: 'text-indigo-700' },
          { label: 'Thumbs Up',         value: feedbackSummary.thumbsUp,       sub: 'positive',                       icon: '👍', color: 'from-emerald-50 to-emerald-100/50', text: 'text-emerald-700' },
          { label: 'Thumbs Down',       value: feedbackSummary.thumbsDown,     sub: 'negative',                       icon: '👎', color: 'from-red-50 to-red-100/50',         text: 'text-red-600' },
          { label: 'Written Feedback',  value: feedbackSummary.withText,       sub: 'with comments',                  icon: '💬', color: 'from-amber-50 to-amber-100/50',    text: 'text-amber-700' },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.color} rounded-2xl p-4 border border-white/80`}>
            <span className="text-xl">{s.icon}</span>
            <p className={`text-2xl font-bold mt-2 ${s.text}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-medium leading-tight">{s.label}</p>
            <p className="text-[10px] text-gray-400">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Satisfaction bar */}
      {feedbackSummary.total > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Satisfaction</span>
            <span className="text-sm font-bold text-gray-900">{satisfactionRate}%</span>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-700"
              style={{ width: `${satisfactionRate}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-400">
            <span>👍 {feedbackSummary.thumbsUp} positive</span>
            <span>👎 {feedbackSummary.thumbsDown} negative</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">All Feedback</h3>
        <span className="text-xs text-gray-400">{jobsWithFeedback.length} entries</span>
      </div>

      {/* Unified scrollable table — works on every screen size */}
      <div
        className="bg-white border border-gray-100 rounded-2xl shadow-sm"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
      >
        <table className="text-sm text-left" style={{ minWidth: 600 }}>
          <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">User</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Job / URL</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Rating</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Feedback</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Status</th>
              <th className="px-4 py-3 font-semibold tracking-wider whitespace-nowrap">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {jobsWithFeedback.map(job => (
              <tr key={job.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap">
                  <p className="font-medium text-gray-900 text-sm">
                    {job.userProfile.firstName} {job.userProfile.lastName}
                  </p>
                  <p className="text-xs text-gray-400">{job.userProfile.email}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono text-[10px] text-gray-400 mb-0.5">{job.id.slice(-8)}</p>
                  <p
                    className="text-xs text-gray-700"
                    style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={job.parameters?.url}
                  >
                    {job.parameters?.url || '—'}
                  </p>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {job.rating === 'up' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                      👍 Positive
                    </span>
                  ) : job.rating === 'down' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600">
                      👎 Negative
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3" style={{ maxWidth: 200 }}>
                  {job.feedback ? (
                    <p
                      className="text-xs text-gray-700 italic"
                      style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as any}
                    >
                      "{job.feedback}"
                    </p>
                  ) : (
                    <span className="text-xs text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    job.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' :
                    job.status === 'FAILED'    ? 'bg-red-100 text-red-700' :
                                                 'bg-blue-100 text-blue-700'
                  }`}>
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                  {formatIST(job.updatedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
