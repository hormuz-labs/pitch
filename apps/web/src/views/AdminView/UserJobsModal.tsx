import { useAuth } from '@clerk/react'
import React from 'react'
import { api } from '../../lib/api'
import { formatDuration, formatIST } from './JobDetailsModal'

type FinancialTab = 'jobs' | 'financials' | 'affiliate'

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-blue-50 text-blue-700 border-blue-100',
  pro: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  enterprise: 'bg-purple-50 text-purple-700 border-purple-100',
}

const TX_TYPE_COLORS: Record<string, string> = {
  subscription_grant: 'text-emerald-600',
  topup_grant: 'text-blue-600',
  usage: 'text-red-500',
  refund: 'text-purple-600',
  admin_adjustment: 'text-orange-600',
  promo: 'text-teal-600',
}

export function UserJobsModal({
  userId,
  onClose,
  onSelectJob,
}: {
  userId: string
  onClose: () => void
  onSelectJob: (job: any) => void
}) {
  const { getToken } = useAuth()
  const [activeTab, setActiveTab] = React.useState<FinancialTab>('jobs')
  const [jobs, setJobs] = React.useState<any[]>([])
  const [financials, setFinancials] = React.useState<any | null>(null)
  const [affiliateData, setAffiliateData] = React.useState<any | null>(null)
  const [loadingJobs, setLoadingJobs] = React.useState(true)
  const [loadingAff, setLoadingAff] = React.useState(false)
  const [error, setError] = React.useState('')

  // Manual credit adjustment states
  const [adjustAmount, setAdjustAmount] = React.useState('')
  const [adjustReason, setAdjustReason] = React.useState('')
  const [adjusting, setAdjusting] = React.useState(false)

  // Fetch jobs and financials on mount
  React.useEffect(() => {
    let isMounted = true
    const loadData = async () => {
      try {
        const token = await getToken()
        if (!token) return

        const [jobsRes, financialsRes] = await Promise.all([
          api.get<any[]>(`/admin/users/${userId}/jobs`, token),
          api.get<any>(`/admin/users/${userId}/financials`, token),
        ])

        if (isMounted) {
          setJobs(jobsRes)
          setFinancials(financialsRes)
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load user data')
      } finally {
        if (isMounted) setLoadingJobs(false)
      }
    }
    loadData()
    return () => {
      isMounted = false
    }
  }, [userId, getToken])

  const loadAffiliate = async () => {
    if (affiliateData !== null) return
    setLoadingAff(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await api.get<any>(`/admin/users/${userId}/affiliate`, token)
      setAffiliateData(res)
    } catch (err: any) {
      setError(err.message || 'Failed to load affiliate')
    } finally {
      setLoadingAff(false)
    }
  }

  const handleTabChange = (tab: FinancialTab) => {
    setActiveTab(tab)
    if (tab === 'affiliate') loadAffiliate()
  }

  const handleCreditAdjustment = async (isDeduction: boolean) => {
    const amountVal = parseInt(adjustAmount, 10)
    if (Number.isNaN(amountVal) || amountVal <= 0) {
      alert('Please enter a valid positive integer amount of credits.')
      return
    }

    setAdjusting(true)
    setError('')
    try {
      const token = await getToken()
      if (!token) return

      const res = await api.post<{ success: boolean; newBalance: number }>(
        `/admin/users/${userId}/credits`,
        token,
        {
          amount: amountVal,
          description: adjustReason.trim() || undefined,
          isDeduction,
        },
      )

      if (res.success) {
        // Refetch financials state to update balance & ledger
        const finRes = await api.get<any>(`/admin/users/${userId}/financials`, token)
        setFinancials(finRes)
        setAdjustAmount('')
        setAdjustReason('')
        alert(`Successfully adjusted credits! New balance: ${res.newBalance} credits.`)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to adjust credits')
    } finally {
      setAdjusting(false)
    }
  }

  const tabs: { key: FinancialTab; label: string; icon: string }[] = [
    { key: 'jobs', label: 'Jobs', icon: '🎬' },
    { key: 'financials', label: 'Financials', icon: '💳' },
    { key: 'affiliate', label: 'Affiliate', icon: '🔗' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-gray-900/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:rounded-2xl sm:max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-gray-900">User Inspector</h3>
            {financials?.user && (
              <>
                <span className="text-gray-300">|</span>
                <span className="text-sm text-gray-500 font-medium truncate max-w-[200px] sm:max-w-none">
                  {financials.user.firstName
                    ? `${financials.user.firstName} ${financials.user.lastName || ''}`
                    : financials.user.email}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100/50">
                  {financials.balance ?? 0} Credits
                </span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
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

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-gray-100 shrink-0 overflow-x-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-gray-900 text-gray-900 bg-gray-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50/30">
          {/* ── Jobs tab ── */}
          {activeTab === 'jobs' && (
            <div className="p-4 sm:p-5">
              {loadingJobs ? (
                <div className="flex justify-center p-12">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                </div>
              ) : error ? (
                <div className="text-center text-red-500 text-sm py-8">{error}</div>
              ) : jobs.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-12">No jobs created yet.</div>
              ) : (
                <div className="space-y-2.5">
                  {jobs.map(job => (
                    <div
                      key={job.id}
                      className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className="font-mono text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            {job.id.slice(-6)}
                          </span>
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              job.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-700'
                                : job.status === 'FAILED'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {job.status}
                          </span>
                          {job.phases && job.phases.length > 0 && (
                            <div className="flex items-center gap-1 ml-1 mr-1">
                              {job.phases.map((p: any, i: number) => (
                                <span
                                  key={i}
                                  title={`${p.label}: ${p.status}`}
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    p.status === 'completed'
                                      ? 'bg-emerald-500'
                                      : p.status === 'running'
                                        ? 'bg-blue-500 animate-pulse'
                                        : p.status === 'failed'
                                          ? 'bg-red-500'
                                          : 'bg-gray-200'
                                  }`}
                                />
                              ))}
                            </div>
                          )}
                          {job.status === 'PROCESSING' &&
                            job.phases &&
                            (() => {
                              const runningPhase = job.phases.find(
                                (p: any) => p.status === 'running',
                              )
                              if (runningPhase) {
                                return (
                                  <span
                                    className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider truncate max-w-[120px]"
                                    title={runningPhase.label}
                                  >
                                    {runningPhase.label}
                                  </span>
                                )
                              }
                              return null
                            })()}
                          {job.isRefunded && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                              ↩ Refunded
                            </span>
                          )}
                          {job.rating === 'up' && <span className="text-sm">👍</span>}
                          {job.rating === 'down' && <span className="text-sm">👎</span>}
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {job.parameters?.url || 'No URL'}
                        </p>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-3 flex-wrap">
                          <span>{formatIST(job.createdAt)}</span>
                          {job.timeTakenMs !== null && (
                            <span className="flex items-center gap-1">
                              <svg
                                width="11"
                                height="11"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {formatDuration(job.timeTakenMs)}
                            </span>
                          )}
                          {job.cost > 0 && (
                            <span className="text-emerald-600 font-semibold">
                              ${job.cost.toFixed(4)}
                            </span>
                          )}
                        </div>
                        {job.feedback && (
                          <p className="text-xs text-gray-500 italic mt-1.5 bg-gray-50 px-2 py-1.5 rounded-lg">
                            "{job.feedback}"
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          onClick={() => onSelectJob(job)}
                          className="text-xs font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-xl transition-all hover:shadow-sm"
                        >
                          Details
                        </button>
                        {job.videoUrl && (
                          <a
                            href={job.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl transition-colors"
                          >
                            Video
                          </a>
                        )}
                        {job.pdfUrl && (
                          <a
                            href={job.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-medium text-rose-600 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-xl transition-colors"
                          >
                            PDF
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Financials tab ── */}
          {activeTab === 'financials' && (
            <div className="p-4 sm:p-5 space-y-5">
              {loadingJobs ? (
                <div className="flex justify-center p-12">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                </div>
              ) : !financials ? (
                <div className="text-center text-gray-400 text-sm py-12">No financial data.</div>
              ) : (
                <>
                  {/* Manual Credit Adjustment Widget */}
                  <section className="bg-white border border-gray-100 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Manual Credit Adjustment
                      </h4>
                      <p className="text-xs text-gray-400 mt-1">
                        Directly add or deduct credits for this user. These changes are recorded in
                        the ledger history below.
                      </p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="w-full sm:w-28">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Amount"
                          value={adjustAmount}
                          onChange={e => setAdjustAmount(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all placeholder:text-gray-400"
                        />
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          placeholder="Reason / Description (optional)"
                          value={adjustReason}
                          onChange={e => setAdjustReason(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 transition-all placeholder:text-gray-400"
                        />
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleCreditAdjustment(false)}
                          disabled={adjusting}
                          className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {adjusting ? 'Adjusting...' : 'Add Credits'}
                        </button>
                        <button
                          onClick={() => handleCreditAdjustment(true)}
                          disabled={adjusting}
                          className="flex-1 sm:flex-none px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {adjusting ? 'Adjusting...' : 'Deduct Credits'}
                        </button>
                      </div>
                    </div>
                  </section>
                  {/* Subscriptions */}
                  <section>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Subscriptions
                    </h4>
                    {financials.subscriptions.length === 0 ? (
                      <p className="text-sm text-gray-400">No subscriptions.</p>
                    ) : (
                      <div className="space-y-2">
                        {financials.subscriptions.map((s: any) => (
                          <div
                            key={s.id}
                            className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm"
                          >
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div>
                                <span
                                  className={`inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-bold capitalize border ${PLAN_COLORS[s.planKey] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}
                                >
                                  {s.planKey}
                                </span>
                                <p className="text-xs text-gray-400 mt-1.5">
                                  {s.creditsPerCycle} credits/cycle
                                </p>
                              </div>
                              <div className="text-right">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                                    s.status === 'active'
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : s.status === 'cancelled'
                                        ? 'bg-red-100 text-red-600'
                                        : 'bg-amber-100 text-amber-700'
                                  }`}
                                >
                                  {s.status}
                                </span>
                                <p className="text-[10px] text-gray-400 mt-1">
                                  Period ends {formatIST(s.currentPeriodEnd)}
                                </p>
                                {s.cancelledAt && (
                                  <p className="text-[10px] text-red-400 mt-0.5">
                                    Cancelled {formatIST(s.cancelledAt)}
                                  </p>
                                )}
                              </div>
                            </div>
                            <p className="text-[10px] text-gray-300 font-mono mt-2">
                              {s.dodoSubscriptionId}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Top-ups */}
                  <section>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Top-up Purchases
                    </h4>
                    {financials.topUps.length === 0 ? (
                      <p className="text-sm text-gray-400">No top-ups.</p>
                    ) : (
                      <div className="space-y-2">
                        {financials.topUps.map((t: any) => (
                          <div
                            key={t.id}
                            className="bg-white border border-gray-100 rounded-2xl p-3 shadow-sm flex items-center justify-between"
                          >
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{t.packKey}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {formatIST(t.createdAt)}
                              </p>
                              <p className="text-[10px] text-gray-300 font-mono mt-0.5">
                                {t.dodoPaymentId}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-bold text-blue-600">+{t.credits} cr</p>
                              <p className="text-xs text-gray-500 font-semibold">
                                ${t.amountUsd.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>

                  {/* Credit ledger */}
                  <section>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      Credit Ledger <span className="text-gray-300 font-normal">(last 150)</span>
                    </h4>
                    {financials.transactions.length === 0 ? (
                      <p className="text-sm text-gray-400">No transactions.</p>
                    ) : (
                      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 border-b border-gray-100">
                            <tr>
                              <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase tracking-wider">
                                Type
                              </th>
                              <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase tracking-wider">
                                Description
                              </th>
                              <th className="px-4 py-2.5 text-right text-gray-400 font-semibold uppercase tracking-wider">
                                Delta
                              </th>
                              <th className="px-4 py-2.5 text-left text-gray-400 font-semibold uppercase tracking-wider hidden sm:table-cell">
                                Date
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {financials.transactions.map((tx: any) => (
                              <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-2.5">
                                  <span
                                    className={`font-semibold ${TX_TYPE_COLORS[tx.type] ?? 'text-gray-600'}`}
                                  >
                                    {tx.type.replace('_', ' ')}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-gray-500 max-w-[150px] truncate">
                                  {tx.description}
                                </td>
                                <td
                                  className={`px-4 py-2.5 text-right font-bold ${tx.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                                >
                                  {tx.delta >= 0 ? '+' : ''}
                                  {tx.delta}
                                </td>
                                <td className="px-4 py-2.5 text-gray-300 hidden sm:table-cell whitespace-nowrap">
                                  {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                                    timeZone: 'Asia/Kolkata',
                                    day: '2-digit',
                                    month: '2-digit',
                                  })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {/* ── Affiliate tab ── */}
          {activeTab === 'affiliate' && (
            <div className="p-4 sm:p-5">
              {loadingAff ? (
                <div className="flex justify-center p-12">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                </div>
              ) : !affiliateData ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="mb-3 opacity-40"
                  >
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  <p className="text-sm font-medium">Not an affiliate</p>
                  <p className="text-xs mt-1">This user hasn't joined the affiliate program.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Affiliate header */}
                  <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-xs text-gray-400 mb-1">Affiliate Code</p>
                        <span className="font-mono text-lg font-bold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-xl">
                          {affiliateData.code}
                        </span>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-400 mb-1">Credits Earned</p>
                        <span className="text-2xl font-bold text-gray-900">
                          {affiliateData.creditsEarned ?? 0}
                        </span>
                      </div>
                      <div>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold uppercase ${
                            affiliateData.status === 'active'
                              ? 'bg-emerald-100 text-emerald-700'
                              : affiliateData.status === 'suspended'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {affiliateData.status}
                        </span>
                        <p className="text-xs text-gray-400 mt-1">
                          Since {new Date(affiliateData.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>

                    {/* Stat pills */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                      {[
                        {
                          label: 'Clicks',
                          value: affiliateData.clicks?.length ?? 0,
                          color: 'text-blue-600',
                        },
                        {
                          label: 'Signups',
                          value: affiliateData.signups ?? 0,
                          color: 'text-violet-600',
                        },
                        {
                          label: 'Conversions',
                          value: affiliateData.conversions?.length ?? 0,
                          color: 'text-emerald-600',
                        },
                        {
                          label: 'Credits',
                          value: affiliateData.creditsEarned ?? 0,
                          color: 'text-amber-600',
                        },
                      ].map(s => (
                        <div key={s.label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                          <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-[10px] text-gray-400 font-medium">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Conversions */}
                  {affiliateData.conversions?.length > 0 && (
                    <section>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                        Conversions
                      </h4>
                      <div className="space-y-2">
                        {affiliateData.conversions.map((c: any) => (
                          <div
                            key={c.id}
                            className="bg-white border border-gray-100 rounded-xl p-3 shadow-sm flex items-center justify-between"
                          >
                            <div>
                              <p className="text-xs font-mono text-gray-400">
                                {c.referredUserId.slice(-12)}
                              </p>
                              <p className="text-[10px] text-gray-300 mt-0.5">
                                {formatIST(c.createdAt)}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">
                                ${c.saleAmountUsd.toFixed(2)}
                              </p>
                            </div>
                            <span
                              className={`ml-3 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                c.status === 'paid'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : c.status === 'approved'
                                    ? 'bg-blue-100 text-blue-700'
                                    : c.status === 'pending'
                                      ? 'bg-amber-100 text-amber-700'
                                      : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {c.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
