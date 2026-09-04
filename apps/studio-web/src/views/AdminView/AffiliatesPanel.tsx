import React from 'react'
import { formatIST } from './format'

interface Conversion {
  id: string
  referredUserId: string
  saleAmountUsd: number
  status: string
  createdAt: string
}

interface Affiliate {
  id: string
  code: string
  status: string
  createdAt: string
  user: { email: string; firstName?: string; lastName?: string; imageUrl?: string }
  totalClicks: number
  totalSignups: number
  totalConversions: number
  conversionRate: string
  totalRevenue: number
  creditsEarned: number
  videosEarned: number
  conversions: Conversion[]
}

interface Analytics {
  affiliates: Affiliate[]
  feedbackSummary: any
  jobsWithFeedback: any[]
}

const STATUS_MAP: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  suspended: 'bg-red-100 text-red-700',
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-blue-100 text-blue-700',
  processing: 'bg-purple-100 text-purple-700',
  requested: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-700',
  approved: 'bg-indigo-100 text-indigo-700',
  rejected: 'bg-red-100 text-red-700',
}

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${STATUS_MAP[status] ?? 'bg-gray-100 text-gray-600'}`}
  >
    {status}
  </span>
)

function AffiliateDetailModal({
  affiliate,
  onClose,
}: {
  affiliate: Affiliate
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-gray-900/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full rounded-t-2xl sm:rounded-2xl sm:max-w-xl max-h-[88vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-purple-100 flex items-center justify-center shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#7c3aed"
                strokeWidth="2"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900 font-mono text-sm truncate">{affiliate.code}</p>
              <p className="text-xs text-gray-400 truncate">{affiliate.user.email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 ml-3 p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: 'Total Clicks',
                value: affiliate.totalClicks,
                color: 'text-blue-600',
                bg: 'bg-blue-50',
              },
              {
                label: 'Signups',
                value: affiliate.totalSignups,
                color: 'text-violet-600',
                bg: 'bg-violet-50',
              },
              {
                label: 'Conversions',
                value: affiliate.totalConversions,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
              },
              {
                label: 'Total Revenue',
                value: `$${affiliate.totalRevenue.toFixed(2)}`,
                color: 'text-purple-600',
                bg: 'bg-purple-50',
              },
              {
                label: 'Credits Earned',
                value: affiliate.creditsEarned,
                color: 'text-amber-600',
                bg: 'bg-amber-50',
              },
              {
                label: 'Conversion Rate',
                value: `${affiliate.conversionRate}%`,
                color: 'text-indigo-600',
                bg: 'bg-indigo-50',
              },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-xl p-3 border border-white`}>
                <p className="text-xs text-gray-500 mb-1 font-medium">{s.label}</p>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Status + joined */}
          <div className="flex items-center justify-between bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div>
              <p className="text-xs text-gray-400 mb-1">Status</p>
              <StatusBadge status={affiliate.status} />
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400 mb-1">Joined</p>
              <p className="text-xs font-medium text-gray-600">
                {new Date(affiliate.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Credits earned alert */}
          {affiliate.creditsEarned > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between">
              <p className="text-xs font-semibold text-amber-700">Credits Earned</p>
              <p className="text-sm font-bold text-amber-700">
                {affiliate.creditsEarned} · {affiliate.videosEarned} free video
                {affiliate.videosEarned === 1 ? '' : 's'}
              </p>
            </div>
          )}

          {/* Conversions */}
          {affiliate.conversions.length > 0 && (
            <section>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Conversions ({affiliate.conversions.length})
              </p>
              <div className="space-y-2">
                {affiliate.conversions.map(c => (
                  <div
                    key={c.id}
                    className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-mono text-gray-400 truncate">
                          User: {c.referredUserId.slice(-12)}
                        </p>
                        <p className="text-[10px] text-gray-300 mt-0.5">{formatIST(c.createdAt)}</p>
                      </div>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
                      <p className="text-xs text-gray-500">
                        Sale:{' '}
                        <span className="font-bold text-gray-800">
                          ${c.saleAmountUsd.toFixed(2)}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {affiliate.conversions.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">No conversions yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function AffiliatesPanel({ analytics }: { analytics: Analytics | null }) {
  const [selected, setSelected] = React.useState<Affiliate | null>(null)

  if (!analytics) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
      </div>
    )
  }

  const { affiliates } = analytics

  if (affiliates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="mb-3 opacity-30"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        <p className="text-sm font-medium">No affiliates yet</p>
      </div>
    )
  }

  const totalClicks = affiliates.reduce((s, a) => s + a.totalClicks, 0)
  const totalConversions = affiliates.reduce((s, a) => s + a.totalConversions, 0)
  const totalRevenue = affiliates.reduce((s, a) => s + a.totalRevenue, 0)
  const totalCredits = affiliates.reduce((s, a) => s + a.creditsEarned, 0)

  return (
    <div className="p-4 sm:p-5 space-y-5">
      {/* Summary row — always 2-col on mobile, 4-col on sm+ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Total Affiliates',
            value: affiliates.length,
            icon: '👥',
            color: 'text-purple-700',
            bg: 'from-purple-50 to-purple-100/50 border-purple-100',
          },
          {
            label: 'Total Clicks',
            value: totalClicks,
            icon: '🖱️',
            color: 'text-blue-700',
            bg: 'from-blue-50 to-blue-100/50 border-blue-100',
          },
          {
            label: 'Conversions',
            value: totalConversions,
            icon: '🎯',
            color: 'text-emerald-700',
            bg: 'from-emerald-50 to-emerald-100/50 border-emerald-100',
          },
          {
            label: 'Credits Earned',
            value: totalCredits,
            icon: '🎬',
            color: 'text-amber-700',
            bg: 'from-amber-50 to-amber-100/50 border-amber-100',
          },
        ].map(s => (
          <div key={s.label} className={`bg-gradient-to-br ${s.bg} border rounded-2xl p-4`}>
            <span className="text-xl">{s.icon}</span>
            <p className={`text-2xl font-bold mt-2 ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 font-medium leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Card layout — ALL screen sizes (no hidden table) ── */}
      <div className="space-y-3">
        {affiliates.map(a => (
          <div
            key={a.id}
            className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden"
          >
            {/* Top row: avatar + name + code + status */}
            <div className="flex items-center justify-between gap-3 p-4 pb-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {a.user.imageUrl ? (
                  <img
                    src={a.user.imageUrl}
                    alt=""
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 text-sm font-bold shrink-0">
                    {(a.user.firstName?.[0] || a.user.email[0]).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 text-sm truncate">
                    {a.user.firstName || ''} {a.user.lastName || ''}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{a.user.email}</p>
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                <StatusBadge status={a.status} />
                <span className="font-mono text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">
                  {a.code}
                </span>
              </div>
            </div>

            {/* Stats grid — 3 col on mobile, 6 col on sm */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-px bg-gray-100 border-t border-gray-100">
              {[
                { label: 'Clicks', value: a.totalClicks, color: 'text-blue-600' },
                { label: 'Signups', value: a.totalSignups, color: 'text-violet-600' },
                { label: 'Converts', value: a.totalConversions, color: 'text-emerald-600' },
                { label: 'Rate', value: `${a.conversionRate}%`, color: 'text-indigo-600' },
                {
                  label: 'Revenue',
                  value: `$${a.totalRevenue.toFixed(2)}`,
                  color: 'text-gray-800',
                },
                { label: 'Credits', value: a.creditsEarned, color: 'text-amber-600' },
              ].map(s => (
                <div key={s.label} className="bg-white px-3 py-2.5 text-center">
                  <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Pending commission + action */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50/60 border-t border-gray-100 gap-3">
              <div className="min-w-0">
                {a.creditsEarned > 0 ? (
                  <p className="text-xs text-amber-600 font-semibold">
                    {a.creditsEarned} credits · {a.videosEarned} free video
                    {a.videosEarned === 1 ? '' : 's'}
                  </p>
                ) : (
                  <p className="text-xs text-gray-400">
                    {a.totalSignups} signups · {a.conversions.length} conversions
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelected(a)}
                className="shrink-0 text-xs font-semibold text-gray-700 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 rounded-xl px-3 py-1.5 transition-all hover:shadow-sm"
              >
                View Details
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue summary footer */}
      <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-400 font-medium">Total Program Revenue</p>
          <p className="text-2xl font-bold text-gray-900">${totalRevenue.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 font-medium">Total Credits Earned</p>
          <p className="text-2xl font-bold text-purple-600">{totalCredits}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 font-medium">Avg. Conversion Rate</p>
          <p className="text-2xl font-bold text-emerald-600">
            {affiliates.length > 0
              ? (
                  affiliates.reduce((s, a) => s + parseFloat(a.conversionRate), 0) /
                  affiliates.length
                ).toFixed(1)
              : '0.0'}
            %
          </p>
        </div>
      </div>

      {selected && <AffiliateDetailModal affiliate={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
