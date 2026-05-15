import React from 'react';
import { UsersTable } from './UsersTable';
import { StatsCards } from './StatsCards';
import { UserJobsModal } from './UserJobsModal';
import { GlobalJobsTable } from './GlobalJobsTable';
import { JobDetailsModal } from './JobDetailsModal';
import { api } from '../../lib/api';
import { useAuth } from '@clerk/clerk-react';

export function AdminView() {
  const { getToken } = useAuth();
  const [data, setData] = React.useState<any>(null);
  const [globalJobs, setGlobalJobs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  
  const [activeTab, setActiveTab] = React.useState<'users' | 'jobs'>('users');
  const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null);
  const [selectedJob, setSelectedJob] = React.useState<any | null>(null);

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

  React.useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        await Promise.all([fetchDashboard(), fetchGlobalJobs()]);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-900 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <div className="inline-flex flex-col items-center justify-center p-8 bg-red-50 rounded-2xl text-red-600 max-w-md w-full">
          <h2 className="text-lg font-bold mb-2">Access Denied</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Platform overview, system health, and deep insights.</p>
      </div>

      <StatsCards stats={data?.stats} onToggleQueue={handleToggleQueue} />
      
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-5 border-b border-gray-200 flex items-center gap-6">
          <button 
            onClick={() => setActiveTab('users')}
            className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'users' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Registered Users
          </button>
          <button 
            onClick={() => setActiveTab('jobs')}
            className={`py-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'jobs' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            Global Jobs Log
          </button>
        </div>

        {activeTab === 'users' ? (
          <UsersTable users={data?.users || []} onSelectUser={setSelectedUserId} />
        ) : (
          <GlobalJobsTable jobs={globalJobs} onSelectJob={setSelectedJob} />
        )}
      </div>

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
