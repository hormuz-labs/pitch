import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Copy, Check, TrendingUp, Users, DollarSign, Wallet, ExternalLink, Share2 } from 'lucide-react';

interface AffiliateStats {
  clicks: number;
  signups: number;
  totalRevenue: number;
  totalCommission: number;
  pendingPayout: number;
  paidOut: number;
  payouts: Payout[];
}

interface Payout {
  id: string;
  amount: number;
  status: string;
  requestedAt: string;
  paidAt?: string;
}

interface AffiliateData {
  id: string;
  code: string;
  commissionPct: number;
  status: string;
  createdAt: string;
  stats: AffiliateStats;
}

const MIN_PAYOUT = 10; // $10 minimum payout

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
        <span className="text-gray-400">{icon}</span>
        {label}
      </div>
      <div className="text-2xl font-bold text-gray-900 tracking-tight">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-900 text-white hover:bg-gray-700 transition-colors border-none cursor-pointer"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function PayoutBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    requested: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    processing: 'bg-blue-50 text-blue-700 border-blue-200',
    paid: 'bg-green-50 text-green-700 border-green-200',
    failed: 'bg-red-50 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

import { API_URL } from '../config';

export function AffiliateView() {
  const { getToken } = useAuth();
  const [data, setData] = useState<AffiliateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [requestingPayout, setRequestingPayout] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:5173' : 'https://trypitch.co';
  const referralUrl = data ? `${baseUrl}/r/${data.code}` : '';

  const fetchData = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/affiliate/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 404) { setData(null); setLoading(false); return; }
      if (!res.ok) throw new Error('Failed to fetch affiliate data');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRegister = async () => {
    setRegistering(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/affiliate/register`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Registration failed');
      await fetchData();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegistering(false);
    }
  };

  const handlePayout = async () => {
    setRequestingPayout(true);
    setPayoutMsg(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/affiliate/me/payout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Payout failed');
      setPayoutMsg('Payout requested! We\'ll process it within 3-5 business days.');
      await fetchData();
    } catch (e: any) {
      setPayoutMsg(e.message);
    } finally {
      setRequestingPayout(false);
    }
  };

  const shareOnTwitter = () => {
    const text = encodeURIComponent(`I use @TryPitch to create AI-powered product demos. Try it free → ${referralUrl}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Not yet an affiliate: Registration Screen ──────────────────────────────
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-5">
          <Share2 className="w-8 h-8 text-gray-700" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Join the TryPitch Affiliate Program</h1>
        <p className="text-gray-500 max-w-md mb-2">
          Earn <span className="font-semibold text-gray-800">20% commission</span> on every sale you refer. Share your unique link with your audience and get paid when they subscribe.
        </p>
        <ul className="text-sm text-gray-500 mb-8 space-y-1">
          <li>✅ Unique referral link instantly</li>
          <li>✅ Real-time click & conversion tracking</li>
          <li>✅ Payout via Stripe once you hit $10</li>
          <li>✅ 30-day attribution window</li>
        </ul>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <button
          onClick={handleRegister}
          disabled={registering}
          className="px-6 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-50 cursor-pointer border-none"
        >
          {registering ? 'Setting up your account...' : 'Join Now — It\'s Free'}
        </button>
      </div>
    );
  }

  // ── Affiliate Dashboard ────────────────────────────────────────────────────
  const stats = data.stats;
  const payoutProgress = Math.min(100, (stats.pendingPayout / MIN_PAYOUT) * 100);
  const canPayout = stats.pendingPayout >= MIN_PAYOUT;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Affiliate Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Earning {data.commissionPct}% commission on every sale you refer.</p>
      </div>

      {/* Referral Link Card */}
      <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-5 text-white">
        <p className="text-xs text-gray-400 mb-1.5 font-medium uppercase tracking-wide">Your Referral Link</p>
        <div className="flex items-center gap-3 flex-wrap">
          <code className="text-sm bg-white/10 px-3 py-1.5 rounded-lg font-mono flex-1 truncate">{referralUrl}</code>
          <div className="flex items-center gap-2">
            <CopyButton text={referralUrl} />
            <button
              onClick={shareOnTwitter}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors border-none cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Share
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-2">Your code: <span className="font-bold text-white">{data.code}</span> · 30-day attribution window</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Link Clicks"
          value={stats.clicks.toLocaleString()}
          sub="All time"
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Conversions"
          value={stats.signups.toLocaleString()}
          sub={`${stats.clicks > 0 ? ((stats.signups / stats.clicks) * 100).toFixed(1) : 0}% conversion rate`}
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Revenue Driven"
          value={`$${stats.totalRevenue.toFixed(2)}`}
          sub="Total sales generated"
        />
        <StatCard
          icon={<Wallet className="w-4 h-4" />}
          label="Commission Earned"
          value={`$${stats.totalCommission.toFixed(2)}`}
          sub={`$${stats.paidOut.toFixed(2)} paid out`}
        />
      </div>

      {/* Payout Card */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-semibold text-gray-900">Available for Payout</p>
            <p className="text-2xl font-bold text-gray-900 mt-0.5">${stats.pendingPayout.toFixed(2)}</p>
          </div>
          <button
            onClick={handlePayout}
            disabled={!canPayout || requestingPayout}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-none"
          >
            {requestingPayout ? 'Requesting...' : 'Request Payout'}
          </button>
        </div>

        {!canPayout && (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1.5">
              <span>Minimum payout threshold</span>
              <span>${stats.pendingPayout.toFixed(2)} / ${MIN_PAYOUT}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gray-900 rounded-full transition-all duration-500"
                style={{ width: `${payoutProgress}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">${(MIN_PAYOUT - stats.pendingPayout).toFixed(2)} more to go</p>
          </div>
        )}
        {payoutMsg && <p className="text-sm text-gray-600 mt-3">{payoutMsg}</p>}
      </div>

      {/* Payout History */}
      {stats.payouts.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Payout History</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.payouts.map(p => (
              <div key={p.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">${p.amount.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">{new Date(p.requestedAt).toLocaleDateString()}</p>
                </div>
                <PayoutBadge status={p.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
