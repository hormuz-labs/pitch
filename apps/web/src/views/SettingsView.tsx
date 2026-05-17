import { useState, useEffect } from 'react';
import { UserProfile, useAuth } from '@clerk/clerk-react';
import { User, CreditCard, Zap, RefreshCw, TrendingUp, Package } from 'lucide-react';
import walletIcon from '../assets/wallet.svg';
import { OptionPicker } from '../components/OptionPicker';
import { API_URL } from '../config';

const TAB_OPTIONS = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'billing', label: 'Billing & Credits', icon: CreditCard },
];

interface CreditTransaction {
  id: string;
  delta: number;
  type: string;
  description: string;
  jobId?: string | null;
  subscriptionId?: string | null;
  topUpId?: string | null;
  createdAt: string;
}

interface Subscription {
  id: string;
  planKey: string;
  status: string;
  creditsPerCycle: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt?: string | null;
  createdAt: string;
}

interface TopUpPurchase {
  id: string;
  packKey: string;
  credits: number;
  amountUsd: number;
  createdAt: string;
}

interface CreditSummary {
  balance: number;
  activeSubscription: Subscription | null;
  subscriptions: Subscription[];
  topUps: TopUpPurchase[];
  transactions: CreditTransaction[];
}

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const PLAN_COLORS: Record<string, string> = {
  starter: 'bg-blue-50 text-blue-700 border-blue-200',
  pro: 'bg-purple-50 text-purple-700 border-purple-200',
  enterprise: 'bg-amber-50 text-amber-700 border-amber-200',
};

const TX_TYPE_LABELS: Record<string, string> = {
  subscription_grant: 'Subscription',
  topup_grant: 'Top-up',
  usage: 'Used',
  refund: 'Refund',
  admin_adjustment: 'Admin',
  promo: 'Promo',
};

const TX_TYPE_COLORS: Record<string, string> = {
  subscription_grant: 'text-blue-600',
  topup_grant: 'text-purple-600',
  usage: 'text-red-500',
  refund: 'text-emerald-600',
  admin_adjustment: 'text-amber-600',
  promo: 'text-emerald-600',
};

export const SettingsView = () => {
  const [activeTab, setActiveTab] = useState<'profile' | 'billing'>('profile');
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== 'billing') return;
    const fetchCredits = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) return;
        const res = await fetch(`${API_URL}/credits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setSummary(data);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchCredits();
  }, [activeTab, getToken]);

  const activeSub = summary?.activeSubscription;

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-[#FAFAFA] absolute inset-0">
      {/* Sidebar for Settings */}
      <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-gray-200 bg-white p-4 md:p-6 flex flex-col justify-between shrink-0 shadow-sm z-10 relative md:pb-8">
        <div>
          <div className="hidden md:flex items-center justify-between mb-6 px-2">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Settings</h2>
          </div>

          {/* Mobile Tab Picker */}
          <div className="md:hidden px-2 mb-2">
            <OptionPicker
              options={TAB_OPTIONS}
              selectedId={activeTab}
              onSelect={(id: string) => setActiveTab(id as any)}
            />
          </div>

          {/* Desktop Tab List */}
          <div className="hidden md:flex flex-col gap-2">
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center shrink-0 gap-2 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'profile' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <User className="w-4 h-4" />
              My Profile
            </button>
            <button
              onClick={() => setActiveTab('billing')}
              className={`flex items-center shrink-0 gap-2 text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'billing' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}
            >
              <CreditCard className="w-4 h-4" />
              Billing & Credits
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-4 md:p-8 overflow-hidden flex flex-col">
        <div className="flex-1 w-full max-w-5xl mx-auto overflow-hidden flex">
          {activeTab === 'profile' && (
            <div className="w-full h-full overflow-y-auto">
              <UserProfile
                routing="hash"
                appearance={{
                  elements: {
                    rootBox: 'w-full',
                    cardBox: 'w-full shadow-sm rounded-2xl border border-gray-200',
                    pageHeader: 'hidden',
                  },
                }}
              />
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="w-full h-full overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center h-48 text-gray-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Loading billing details…</span>
                </div>
              ) : (
                <div className="space-y-6 pb-8">

                  {/* ── Top row: Balance + Active Plan ──────────────────────── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Credit Balance */}
                    <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                        Available Credits
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <img src={walletIcon} alt="Wallet" className="w-7 h-7 opacity-70" />
                        <span className="text-5xl font-black text-gray-900">
                          {summary?.balance ?? '—'}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400">3 credits = 1 video</div>

                      {/* Balance breakdown */}
                      {summary && (
                        <div className="mt-4 pt-4 border-t border-gray-50 space-y-1.5">
                          {(() => {
                            const subCredits = summary.transactions
                              .filter(t => t.type === 'subscription_grant')
                              .reduce((a, t) => a + t.delta, 0);
                            const topUpCredits = summary.transactions
                              .filter(t => t.type === 'topup_grant')
                              .reduce((a, t) => a + t.delta, 0);
                            const promoCredits = summary.transactions
                              .filter(t => t.type === 'promo')
                              .reduce((a, t) => a + t.delta, 0);
                            const usedCredits = summary.transactions
                              .filter(t => t.type === 'usage')
                              .reduce((a, t) => a + t.delta, 0);
                            return (
                              <>
                                {subCredits > 0 && (
                                  <div className="flex justify-between text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Subscription grants</span>
                                    <span className="font-medium text-blue-600">+{subCredits}</span>
                                  </div>
                                )}
                                {topUpCredits > 0 && (
                                  <div className="flex justify-between text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><Package className="w-3 h-3" /> Top-up purchases</span>
                                    <span className="font-medium text-purple-600">+{topUpCredits}</span>
                                  </div>
                                )}
                                {promoCredits > 0 && (
                                  <div className="flex justify-between text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><Zap className="w-3 h-3" /> Promo / refunds</span>
                                    <span className="font-medium text-emerald-600">+{promoCredits}</span>
                                  </div>
                                )}
                                {usedCredits < 0 && (
                                  <div className="flex justify-between text-xs text-gray-500">
                                    <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Credits used</span>
                                    <span className="font-medium text-red-500">{usedCredits}</span>
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>

                    {/* Active Plan */}
                    <div className="p-6 rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                        Current Plan
                      </div>
                      {activeSub ? (
                        <>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-2xl font-bold text-gray-900">
                              {PLAN_LABELS[activeSub.planKey] ?? activeSub.planKey}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PLAN_COLORS[activeSub.planKey] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                              {activeSub.status.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-sm text-gray-600 mb-3">
                            {activeSub.creditsPerCycle} credits / month
                          </div>
                          <div className="text-xs text-gray-400 space-y-0.5">
                            <div>Renews: <span className="text-gray-600">{new Date(activeSub.currentPeriodEnd).toLocaleDateString()}</span></div>
                            <div>Period: <span className="text-gray-600">{new Date(activeSub.currentPeriodStart).toLocaleDateString()} – {new Date(activeSub.currentPeriodEnd).toLocaleDateString()}</span></div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-2xl font-bold text-gray-900 mb-1">No active plan</div>
                          <div className="text-sm text-gray-500">Top up anytime or subscribe for monthly credits.</div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* ── Subscription History ─────────────────────────────────── */}
                  {(summary?.subscriptions?.length ?? 0) > 1 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-50">
                        <h4 className="font-bold text-gray-900 text-sm">Subscription History</h4>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {summary!.subscriptions.map(sub => (
                          <div key={sub.id} className="flex items-center justify-between px-6 py-3 text-sm">
                            <div>
                              <span className="font-medium text-gray-800">{PLAN_LABELS[sub.planKey] ?? sub.planKey}</span>
                              <span className="text-xs text-gray-400 ml-2">{sub.creditsPerCycle} cr/mo</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-gray-400">{new Date(sub.currentPeriodStart).toLocaleDateString()}</span>
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PLAN_COLORS[sub.planKey] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                {sub.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Top-Up Purchases ─────────────────────────────────────── */}
                  {(summary?.topUps?.length ?? 0) > 0 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                      <div className="px-6 py-4 border-b border-gray-50">
                        <h4 className="font-bold text-gray-900 text-sm">Top-Up Purchases</h4>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {summary!.topUps.map(topUp => (
                          <div key={topUp.id} className="flex items-center justify-between px-6 py-3 text-sm">
                            <div>
                              <span className="font-medium text-gray-800">{topUp.credits} credits</span>
                              <span className="text-xs text-gray-400 ml-2">${topUp.amountUsd.toFixed(2)}</span>
                            </div>
                            <span className="text-xs text-gray-400">{new Date(topUp.createdAt).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Transaction Ledger ───────────────────────────────────── */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-50">
                      <h4 className="font-bold text-gray-900 text-sm">Transaction History</h4>
                    </div>
                    {(summary?.transactions?.length ?? 0) === 0 ? (
                      <div className="text-sm text-gray-500 text-center py-12 bg-gray-50/50">
                        No transactions yet
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {summary!.transactions.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between px-6 py-3 text-sm">
                            <div className="flex flex-col gap-0.5 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide bg-gray-100 ${TX_TYPE_COLORS[tx.type] ?? 'text-gray-500'}`}>
                                  {TX_TYPE_LABELS[tx.type] ?? tx.type}
                                </span>
                                <span className="font-medium text-gray-800 truncate">{tx.description}</span>
                              </div>
                              {tx.jobId && <span className="text-xs text-gray-400">Job: {tx.jobId.slice(0, 8)}…</span>}
                              <span className="text-xs text-gray-400">{new Date(tx.createdAt).toLocaleString()}</span>
                            </div>
                            <span className={`font-bold text-base shrink-0 ml-4 ${tx.delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {tx.delta > 0 ? '+' : ''}{tx.delta}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
