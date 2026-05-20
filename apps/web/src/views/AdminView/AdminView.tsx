import React from 'react';
import { UsersTable } from './UsersTable';
import { StatsCards } from './StatsCards';
import { UserJobsModal } from './UserJobsModal';
import { GlobalJobsTable } from './GlobalJobsTable';
import { JobDetailsModal } from './JobDetailsModal';
import { AffiliatesPanel } from './AffiliatesPanel';
import { FeedbackPanel } from './FeedbackPanel';
import { api } from '../../lib/api';
import { useAuth } from '@clerk/clerk-react';

type AdminTab = 'users' | 'jobs' | 'feedback' | 'affiliates';

const TABS: { key: AdminTab; label: string; icon: string }[] = [
  { key: 'users',      label: 'Users',      icon: '👥' },
  { key: 'jobs',       label: 'Jobs',       icon: '🎬' },
  { key: 'feedback',   label: 'Feedback',   icon: '⭐' },
  { key: 'affiliates', label: 'Affiliates', icon: '🔗' },
];

export function AdminView() {
  const { getToken } = useAuth();
  const [data, setData] = React.useState<any>(null);
  const [globalJobs, setGlobalJobs] = React.useState<any[]>([]);
  const [analytics, setAnalytics] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const [activeTab, setActiveTab] = React.useState<AdminTab>('users');
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [selectedJob, setSelectedJob] = React.useState<any | null>(null);

  // Search / filter state
  const [userSearch, setUserSearch] = React.useState('');
  const [jobSearch, setJobSearch] = React.useState('');

  const fetchDashboard = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await api.get<any>('/admin/dashboard', token);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load admin dashboard');
    }
  };

  const fetchGlobalJobs = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await api.get<any[]>('/admin/jobs', token);
      setGlobalJobs(res);
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await api.get<any>('/admin/analytics', token);
      setAnalytics(res);
    } catch (err: any) {
      console.error('Analytics fetch failed:', err);
    }
  };

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        await Promise.all([fetchDashboard(), fetchGlobalJobs(), fetchAnalytics()]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    load();
    return () => { isMounted = false; };
  }, []);

  const handleToggleQueue = async () => {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await api.post<any>('/admin/queue/toggle', token);
      setData((prev: any) => ({ ...prev, stats: { ...prev.stats, isPaused: res.paused } }));
    } catch (err: any) {
      alert('Failed to toggle queue: ' + err.message);
    }
  };

  const handleJobDeleted = (jobId: string) => {
    setGlobalJobs(prev => prev.filter(j => j.id !== jobId));
    fetchDashboard(); // refresh stats
  };

  // Filtered lists
  const filteredUsers = React.useMemo(() => {
    if (!data?.users) return [];
    const q = userSearch.toLowerCase();
    if (!q) return data.users;
    return data.users.filter((u: any) =>
      u.email.toLowerCase().includes(q) ||
      `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase().includes(q) ||
      (u.subscription?.planKey || '').toLowerCase().includes(q)
    );
  }, [data?.users, userSearch]);

  const filteredJobs = React.useMemo(() => {
    const q = jobSearch.toLowerCase();
    if (!q) return globalJobs;
    return globalJobs.filter(j =>
      j.userEmail?.toLowerCase().includes(q) ||
      j.userName?.toLowerCase().includes(q) ||
      (j.parameters?.url || '').toLowerCase().includes(q) ||
      j.status.toLowerCase().includes(q)
    );
  }, [globalJobs, jobSearch]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 gap-4">
        <div className="w-10 h-10 border-4 border-gray-100 border-t-gray-900 rounded-full animate-spin" />
        <p className="text-sm text-gray-400 font-medium">Loading admin portal…</p>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="flex flex-col items-center gap-4 p-8 bg-red-50 rounded-2xl border border-red-100 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-red-700 mb-1">Access Denied</h2>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Admin Portal</h1>
            <p className="text-xs text-gray-400 mt-0.5">Platform overview · system health · deep insights</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex h-2.5 w-2.5 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${data?.stats?.isPaused ? 'bg-orange-400' : 'bg-emerald-400'}`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${data?.stats?.isPaused ? 'bg-orange-500' : 'bg-emerald-500'}`} />
            </span>
            <span className={`text-xs font-semibold ${data?.stats?.isPaused ? 'text-orange-600' : 'text-emerald-600'}`}>
              {data?.stats?.isPaused ? 'Queue Paused' : 'Queue Running'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 sm:px-6 py-5 space-y-5 max-w-[1400px] mx-auto">

          {/* Stats */}
          <StatsCards stats={data?.stats} onToggleQueue={handleToggleQueue} />

          {/* Main panel — no overflow-hidden so child tables can scroll horizontally */}
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm" style={{ minWidth: 0 }}>

            {/* Tab bar */}
            <div className="flex items-center gap-0.5 px-4 sm:px-5 border-b border-gray-100 shrink-0" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              {TABS.map(tab => {
                const count =
                  tab.key === 'users' ? (data?.users?.length ?? '') :
                  tab.key === 'jobs' ? globalJobs.length :
                  tab.key === 'feedback' ? (analytics?.feedbackSummary?.total ?? '') :
                  tab.key === 'affiliates' ? (analytics?.affiliates?.length ?? '') :
                  '';
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 sm:px-4 py-3.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                      activeTab === tab.key
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                    }`}
                  >
                    <span className="text-base leading-none">{tab.icon}</span>
                    <span>{tab.label}</span>
                    {count !== '' && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        activeTab === tab.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search bar (users & jobs tabs) */}
            {(activeTab === 'users' || activeTab === 'jobs') && (
              <div className="px-4 sm:px-5 py-3 border-b border-gray-50">
                <div className="relative max-w-xs">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <input
                    type="text"
                    placeholder={activeTab === 'users' ? 'Search users…' : 'Search jobs…'}
                    value={activeTab === 'users' ? userSearch : jobSearch}
                    onChange={e => activeTab === 'users' ? setUserSearch(e.target.value) : setJobSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all placeholder:text-gray-400"
                  />
                </div>
              </div>
            )}

            {/* Tab content */}
            {activeTab === 'users' && (
              <UsersTable users={filteredUsers} onSelectUser={setSelectedUserId} />
            )}

            {activeTab === 'jobs' && (
              <GlobalJobsTable jobs={filteredJobs} onSelectJob={setSelectedJob} />
            )}

            {activeTab === 'feedback' && (
              <FeedbackPanel analytics={analytics} />
            )}

            {activeTab === 'affiliates' && (
              <AffiliatesPanel analytics={analytics} />
            )}
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-300 pb-2">
            {data?.users?.length ?? 0} users · {data?.stats?.totalJobs ?? 0} total jobs · data refreshes on page load
          </p>
        </div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {selectedUserId && (
        <UserJobsModal
          userId={selectedUserId}
          onClose={() => setSelectedUserId(null)}
          onSelectJob={setSelectedJob}
        />
      )}

      {selectedJob && (
        <JobDetailsModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onDelete={handleJobDeleted}
        />
      )}
    </div>
  );
}
