export function StatsCards({ stats, onToggleQueue }: { stats: any; onToggleQueue: () => void }) {
  if (!stats) return null;

  const successRate = (stats.completedJobs + stats.failedJobs) > 0
    ? Math.round((stats.completedJobs / (stats.completedJobs + stats.failedJobs)) * 100)
    : 0;

  const topCards = [
    {
      label: 'Total Users',
      value: stats.totalUsers ?? 0,
      sub: 'registered accounts',
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      ),
      cardBg: 'linear-gradient(135deg, #6366f1 0%, #818cf8 100%)',
      iconBg: 'rgba(255,255,255,0.2)',
      textColor: '#fff',
      subColor: 'rgba(255,255,255,0.7)',
    },
    {
      label: 'Revenue',
      value: `$${(stats.totalRevenue ?? 0).toFixed(0)}`,
      sub: 'total top-up revenue',
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
      ),
      cardBg: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
      iconBg: 'rgba(255,255,255,0.2)',
      textColor: '#fff',
      subColor: 'rgba(255,255,255,0.7)',
    },
    {
      label: 'Total Jobs',
      value: stats.totalJobs ?? 0,
      sub: `${stats.completedJobs} done · ${stats.failedJobs} failed`,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="23 7 16 12 23 17 23 7"/>
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
        </svg>
      ),
      cardBg: 'linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)',
      iconBg: 'rgba(255,255,255,0.2)',
      textColor: '#fff',
      subColor: 'rgba(255,255,255,0.7)',
    },
    {
      label: 'Success Rate',
      value: `${successRate}%`,
      sub: `${stats.completedJobs} of ${(stats.completedJobs + stats.failedJobs)} jobs`,
      icon: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ),
      cardBg: 'linear-gradient(135deg, #059669 0%, #34d399 100%)',
      iconBg: 'rgba(255,255,255,0.2)',
      textColor: '#fff',
      subColor: 'rgba(255,255,255,0.7)',
      isRate: true,
      rate: successRate,
    },
  ];

  const bottomCards = [
    { label: 'Workers',    value: stats.activeWorkers, color: 'text-gray-800' },
    { label: 'Queued',     value: stats.queuedJobs,    color: 'text-amber-600' },
    { label: 'Processing', value: stats.activeJobs,    color: 'text-blue-600' },
  ];

  return (
    <div className="space-y-2.5">
      {/* Top row — colorful compact premium cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {topCards.map(c => (
          <div
            key={c.label}
            className="relative rounded-2xl p-3.5 shadow-sm overflow-hidden hover:shadow-lg transition-shadow duration-200"
            style={{ background: c.cardBg }}
          >
            {/* Shine overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none rounded-2xl" />

            {/* Header row */}
            <div className="flex items-center justify-between mb-2.5 relative">
              <span className="text-[10px] font-bold uppercase tracking-widest leading-none" style={{ color: c.subColor }}>
                {c.label}
              </span>
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: c.iconBg, color: c.textColor }}
              >
                {c.icon}
              </div>
            </div>

            {/* Value */}
            <div className="text-[22px] font-black leading-none tracking-tight relative" style={{ color: c.textColor }}>
              {c.value}
            </div>

            {/* Sub label */}
            <div className="text-[10px] mt-1 font-medium leading-tight relative" style={{ color: c.subColor }}>
              {c.sub}
            </div>

            {/* Progress bar for success rate */}
            {c.isRate && (
              <div className="mt-2.5 h-1 rounded-full overflow-hidden relative" style={{ backgroundColor: 'rgba(255,255,255,0.25)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${c.rate}%`, backgroundColor: 'rgba(255,255,255,0.9)' }}
                />
              </div>
            )}
          </div>
        ))}
      </div>


      {/* Bottom row — queue controls + worker stats */}
      <div className="flex items-stretch gap-2.5">
        {/* Worker / queue mini stats */}
        <div className="flex flex-1 items-center bg-white border border-gray-100 rounded-2xl shadow-sm divide-x divide-gray-100 overflow-hidden">
          {bottomCards.map(c => (
            <div key={c.label} className="flex-1 px-4 py-2.5 text-center">
              <div className={`text-lg font-black leading-none ${c.color}`}>{c.value}</div>
              <div className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mt-0.5">{c.label}</div>
            </div>
          ))}
        </div>

        {/* Queue toggle */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm px-4 py-2.5 flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${stats.isPaused ? 'bg-orange-400' : 'bg-emerald-400'}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${stats.isPaused ? 'bg-orange-500' : 'bg-emerald-500'}`} />
            </span>
            <span className={`text-[11px] font-bold uppercase tracking-wide ${stats.isPaused ? 'text-orange-600' : 'text-emerald-600'}`}>
              {stats.isPaused ? 'Paused' : 'Running'}
            </span>
          </div>
          <button
            onClick={onToggleQueue}
            className={`text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-colors whitespace-nowrap ${
              stats.isPaused
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                : 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100'
            }`}
          >
            {stats.isPaused ? '▶ Resume' : '⏸ Pause'}
          </button>
        </div>
      </div>
    </div>
  );
}
