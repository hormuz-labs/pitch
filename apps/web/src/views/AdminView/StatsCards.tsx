export function StatsCards({ stats, onToggleQueue }: { stats: any, onToggleQueue: () => void }) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="text-sm font-medium text-gray-500 mb-1">Active Workers</div>
        <div className="text-2xl font-bold text-gray-900">{stats.activeWorkers}</div>
      </div>
      <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="text-sm font-medium text-gray-500 mb-1">Queued Jobs</div>
        <div className="text-2xl font-bold text-blue-600">{stats.queuedJobs}</div>
      </div>
      <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="text-sm font-medium text-gray-500 mb-1">Processing</div>
        <div className="text-2xl font-bold text-yellow-600">{stats.activeJobs}</div>
      </div>
      <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm">
        <div className="text-sm font-medium text-gray-500 mb-1">Completed / Failed</div>
        <div className="text-2xl font-bold text-gray-900">
          <span className="text-green-600">{stats.completedJobs}</span>
          <span className="text-gray-300 mx-2">/</span>
          <span className="text-red-600">{stats.failedJobs}</span>
        </div>
      </div>
      <div className="p-5 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col justify-between items-start">
        <div className="text-sm font-medium text-gray-500 mb-1">System Queue</div>
        <div className="flex items-center gap-2">
           <span className={`flex h-3 w-3 relative`}>
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${stats.isPaused ? 'bg-orange-400' : 'bg-green-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-3 w-3 ${stats.isPaused ? 'bg-orange-500' : 'bg-green-500'}`}></span>
          </span>
          <span className={`text-sm font-bold ${stats.isPaused ? 'text-orange-600' : 'text-green-600'}`}>
            {stats.isPaused ? 'PAUSED' : 'RUNNING'}
          </span>
        </div>
        <button 
          onClick={onToggleQueue}
          className={`mt-3 w-full px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
            stats.isPaused 
              ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
              : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
          }`}
        >
          {stats.isPaused ? 'Resume Global Queue' : 'Pause Global Queue'}
        </button>
      </div>
    </div>
  );
}
