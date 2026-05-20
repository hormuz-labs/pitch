import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Copy, Check, TrendingUp, Users, DollarSign, Wallet, ExternalLink, ArrowUpRight } from 'lucide-react';

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

const MIN_PAYOUT = 10;

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: 'blue' | 'violet' | 'orange' | 'green';
}) {
  const accentMap: Record<string, { icon: string; ring: string }> = {
    blue:   { icon: 'bg-blue-50 text-blue-600',   ring: 'border-blue-100' },
    violet: { icon: 'bg-violet-50 text-violet-600', ring: 'border-violet-100' },
    orange: { icon: 'bg-orange-50 text-orange-600', ring: 'border-orange-100' },
    green:  { icon: 'bg-emerald-50 text-emerald-600', ring: 'border-emerald-100' },
  };
  const cfg = accentMap[accent ?? 'blue'];

  return (
    <div
      className="group bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-default"
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest leading-none">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.icon} border ${cfg.ring}`}>
          {icon}
        </div>
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 tracking-tight leading-none">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-1.5">{sub}</div>}
      </div>
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
      className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white text-gray-900 hover:bg-gray-50 transition-colors border border-gray-300 cursor-pointer"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function PayoutBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    requested:  'bg-amber-50 text-amber-700 border border-amber-200',
    processing: 'bg-blue-50 text-blue-700 border border-blue-200',
    paid:       'bg-emerald-50 text-emerald-700 border border-emerald-200',
    failed:     'bg-red-50 text-red-700 border border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase ${map[status] ?? 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
      {status}
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
      setPayoutMsg("Payout requested! We'll process it within 3-5 business days.");
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

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
      </div>
    );
  }

  // ── Registration Screen ──────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-8 px-4 text-center gap-5">

        {/* Heading + stat with decorative SVGs */}
        <div className="relative flex flex-col items-center gap-2">

          {/* Confetti + curved lines — decorative, pointer-events-none */}
          <svg className="absolute -top-6 -left-16 w-36 h-28 pointer-events-none" viewBox="0 0 144 112" fill="none" aria-hidden="true">
            {/* Curved arc */}
            <path d="M10 90 Q40 20 90 50 Q130 80 140 20" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            {/* Confetti dots */}
            <rect x="8"  y="18" width="5" height="5" rx="1" fill="#fbbf24" transform="rotate(18 10 20)"/>
            <rect x="30" y="6"  width="4" height="4" rx="1" fill="#a78bfa" transform="rotate(-12 32 8)"/>
            <rect x="55" y="14" width="4" height="4" rx="1" fill="#34d399" transform="rotate(30 57 16)"/>
            <circle cx="72" cy="4"  r="2.5" fill="#f87171"/>
            <circle cx="20" cy="55" r="2"   fill="#60a5fa"/>
            <circle cx="95" cy="22" r="2"   fill="#fbbf24"/>
            <rect x="110" y="40" width="5" height="5" rx="1" fill="#a78bfa" transform="rotate(22 112 42)"/>
          </svg>

          <svg className="absolute -top-6 -right-16 w-36 h-28 pointer-events-none" viewBox="0 0 144 112" fill="none" aria-hidden="true">
            {/* Curved arc — mirrored */}
            <path d="M134 90 Q104 20 54 50 Q14 80 4 20" stroke="#e5e7eb" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            {/* Confetti dots */}
            <rect x="130" y="18" width="5" height="5" rx="1" fill="#34d399" transform="rotate(-18 132 20)"/>
            <rect x="108" y="6"  width="4" height="4" rx="1" fill="#f87171" transform="rotate(12 110 8)"/>
            <rect x="84"  y="14" width="4" height="4" rx="1" fill="#fbbf24" transform="rotate(-30 86 16)"/>
            <circle cx="68" cy="4"  r="2.5" fill="#a78bfa"/>
            <circle cx="120" cy="55" r="2"  fill="#34d399"/>
            <circle cx="44" cy="22" r="2"   fill="#f87171"/>
            <rect x="22" y="40" width="5" height="5" rx="1" fill="#60a5fa" transform="rotate(-22 24 42)"/>
          </svg>

          {/* Bottom trailing arcs */}
          <svg className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-48 h-10 pointer-events-none" viewBox="0 0 192 40" fill="none" aria-hidden="true">
            <path d="M10 32 Q96 -10 182 32" stroke="#f3f4f6" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            <path d="M30 38 Q96 8 162 38" stroke="#e5e7eb" strokeWidth="1" strokeLinecap="round" fill="none"/>
          </svg>

          <h1 className="text-2xl font-bold text-black tracking-tight relative z-10">Affiliate Program</h1>

          <div className="relative z-10">
            <div className="inline-flex items-start">
              <span className="text-[64px] font-black text-black leading-none tracking-tighter">20</span>
              <span className="text-2xl font-bold text-black mt-3 ml-0.5">%</span>
            </div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mt-1">Commission per referral</p>
          </div>
        </div>

        {/* Headline + subtitle */}
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold text-black tracking-tight leading-snug mb-1.5">
            Turn referrals into revenue
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed">
            Share your unique link, track conversions in real time, and get paid when they subscribe.
          </p>
        </div>

        {/* Feature pills */}
        <div className="flex flex-wrap justify-center gap-2 max-w-sm">
          {[
            { icon: '🔗', label: 'Unique referral link' },
            { icon: '📊', label: 'Real-time tracking' },
            { icon: '💸', label: '$10 min payout' },
            { icon: '🗓', label: '30-day attribution' },
          ].map(({ icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 hover:border-gray-300 transition-colors"
            >
              <span>{icon}</span>
              {label}
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600 text-xs">
            <span>⚠</span> {error}
          </div>
        )}

        {/* CTA */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            onClick={handleRegister}
            disabled={registering}
            className="flex items-center gap-2 px-6 py-2.5 bg-black text-white text-sm font-semibold rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer border-none"
          >
            {registering ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Setting up…
              </>
            ) : (
              <>
                Get started for free
                <ArrowUpRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
          <p className="text-[11px] text-gray-400">No credit card required</p>
        </div>

        {/* Inline stats strip */}
        <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
          {[
            { val: '30 days', label: 'Attribution' },
            { val: '$10', label: 'Min. payout' },
            { val: 'Instant', label: 'Link creation' },
          ].map(({ val, label }, i, arr) => (
            <div key={label} className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-sm font-bold text-black">{val}</div>
                <div className="text-[10px] text-gray-400">{label}</div>
              </div>
              {i < arr.length - 1 && <div className="w-px h-6 bg-gray-100" />}
            </div>
          ))}
        </div>

      </div>
    );
  }


  // ── Affiliate Dashboard ──────────────────────────────────────────────────────
  const stats = data.stats;
  const payoutProgress = Math.min(100, (stats.pendingPayout / MIN_PAYOUT) * 100);
  const canPayout = stats.pendingPayout >= MIN_PAYOUT;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Affiliate Portal</p>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Earning {data.commissionPct}% commission on every referred sale.</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      </div>

      {/* Referral Link Card — dark premium strip */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 rounded-2xl p-6 text-white shadow-lg">
        {/* Decorative orb */}
        <div className="absolute -top-10 -right-10 w-48 h-48 bg-white/5 rounded-full pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full pointer-events-none" />

        <div className="relative">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-1">Your Referral Link</p>
          <p className="text-xs text-gray-500 mb-4">
            Code: <span className="font-bold text-white">{data.code}</span> · 30-day attribution window
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <code className="flex-1 text-sm bg-white/10 border border-white/10 px-4 py-2.5 rounded-xl font-mono truncate text-gray-200">
              {referralUrl}
            </code>
            <div className="flex items-center gap-2 shrink-0">
              <CopyButton text={referralUrl} />
              <button
                onClick={shareOnTwitter}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors border border-white/10 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Share
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Link Clicks"
          value={stats.clicks.toLocaleString()}
          sub="All time"
          accent="blue"
        />
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label="Conversions"
          value={stats.signups.toLocaleString()}
          sub={`${stats.clicks > 0 ? ((stats.signups / stats.clicks) * 100).toFixed(1) : 0}% rate`}
          accent="violet"
        />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Revenue Driven"
          value={`$${stats.totalRevenue.toFixed(2)}`}
          sub="Total sales generated"
          accent="orange"
        />
        <StatCard
          icon={<Wallet className="w-4 h-4" />}
          label="Commission Earned"
          value={`$${stats.totalCommission.toFixed(2)}`}
          sub={`$${stats.paidOut.toFixed(2)} paid out`}
          accent="green"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Payout Card */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Available for Payout</p>
              <p className="text-3xl font-bold text-gray-900 tracking-tight">${stats.pendingPayout.toFixed(2)}</p>
            </div>
            <button
              onClick={handlePayout}
              disabled={!canPayout || requestingPayout}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-none shadow-sm"
            >
              {requestingPayout ? 'Requesting…' : 'Request Payout'}
            </button>
          </div>

          {!canPayout && (
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-2">
                <span>Minimum payout threshold</span>
                <span>${stats.pendingPayout.toFixed(2)} / ${MIN_PAYOUT}</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-900 rounded-full transition-all duration-700"
                  style={{ width: `${payoutProgress}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-2">${(MIN_PAYOUT - stats.pendingPayout).toFixed(2)} more to unlock payout</p>
            </div>
          )}

          {payoutMsg && (
            <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-600">
              <span className="text-emerald-500 shrink-0 mt-0.5">✓</span>
              {payoutMsg}
            </div>
          )}
        </div>

        {/* Payout History */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Payout History</h2>
              <p className="text-xs text-gray-400 mt-0.5">Recent settlements to your account.</p>
            </div>
          </div>

          {stats.payouts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center flex-1">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center mb-3">
                <Wallet className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm font-medium text-gray-500">No payouts yet</p>
              <p className="text-xs text-gray-400 mt-1">Earnings will appear here once processed.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 flex-1 overflow-y-auto max-h-[280px]">
              {stats.payouts.map((p) => (
                <div key={p.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">${p.amount.toFixed(2)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(p.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <PayoutBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* How it works — subtle info strip */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">How it works</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          {[
            { step: '01', title: 'Share your link', desc: 'Post on socials, embed in content, or email your audience.' },
            { step: '02', title: 'They sign up', desc: "When someone clicks and subscribes, it's attributed to you for 30 days." },
            { step: '03', title: 'You get paid', desc: `Earn ${data.commissionPct}% of every sale. Request payout once you hit $${MIN_PAYOUT}.` },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <span className="text-[11px] font-bold text-gray-300 tabular-nums mt-0.5 shrink-0">{item.step}</span>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{item.title}</p>
                <p className="text-gray-500 text-xs mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
