import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { API_URL } from '../config';
import { getRefCode } from '../lib/referral';
import pCoinIcon from '../assets/pCoin.svg';

const IconCheck = () => (
  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900 shrink-0 mt-0.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconZap = () => (
  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="shrink-0">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

type PackKey = 'starter' | 'pro' | 'enterprise';
type TopupKey = 'topup_10' | 'topup_50';

const TOPUP_PACKS: {
  key: TopupKey; name: string; price: number;
  credits: number; badge: string | null;
  desc: string; features: string[]; popular?: boolean;
}[] = [
  {
    key: 'topup_10',
    name: '10 Credits Top-up',
    price: 12,
    credits: 10,
    badge: null,
    desc: 'Just need a few extra videos to finish a project.',
    features: ['10 AI credits', 'One-time payment, no expiry'],
  },
  {
    key: 'topup_50',
    name: '50 Credits Top-up',
    price: 45,
    credits: 50,
    badge: null,
    popular: true,
    desc: 'The quickest way to refill your account balance.',
    features: ['50 AI credits', 'Better value per credit', 'One-time payment, no expiry'],
  },
];

const PACKS: {
  key: PackKey; name: string; price: number | null;
  credits: number | null; badge: string | null;
  desc: string; features: string[]; popular?: boolean;
}[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 10,
    credits: 10,
    badge: null,
    desc: 'Perfect for trying out AI-powered demo generation.',
    features: ['10 AI credits per month', '9 credits = 3 videos', 'Up to 1080p exports', 'Priority queue access'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 40,
    credits: 50,
    badge: null,
    popular: true,
    desc: 'For creators and professionals — best value per credit.',
    features: ['50 AI credits per month', '20% savings vs. Starter', 'Up to 1080p exports', 'Custom agent instructions', 'Remove watermarks'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: null,
    credits: null,
    badge: 'Volume deal',
    desc: 'High-volume teams and agencies who need scale.',
    features: ['Custom AI credits volume', 'Volume discounts', 'Up to 1080p exports', 'Custom agent fine-tuning', 'Dedicated account manager'],
  },
];

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export const PricingView = () => {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState<PackKey | TopupKey | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [hovered, setHovered] = useState<PackKey | TopupKey | null>(null);
  const [activePlan, setActivePlan] = useState<string | null>(null);

  const [mode, setMode] = useState<'subscription' | 'topup'>('subscription');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token || cancelled) return;
        const res = await fetch(`${API_URL}/credits`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setActivePlan(data.activeSubscription?.planKey ?? null);
        }
      } catch { /* silently ignore */ }
    };
    load();
    return () => { cancelled = true; };
  }, [getToken]);

  const handleCheckout = async (key: PackKey | TopupKey, isTopup = false) => {
    setLoading(key);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...(isTopup ? { topup: key } : { pack: key }),
          refCode: getRefCode() ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      window.location.assign(data.url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setLoading(null);
    }
  };

  const isActive = (key: PackKey | TopupKey, popular?: boolean) =>
    hovered === key || (!hovered && !!popular);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 sm:pb-16 font-sans">

      {/* Header */}
      <div className="text-center mb-10 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 tracking-tight flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-3 text-balance">
          <div className="flex items-center gap-2 sm:gap-3">
            Buy
            <img src={pCoinIcon} alt="Credits coin" width="48" height="48" className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 shrink-0" />
            credit,
          </div>
          <span>generate demos</span>
        </h1>
        <p className="text-sm sm:text-base text-gray-500 max-w-md mx-auto leading-relaxed mb-6 px-4">
          Subscribe for monthly credits, or buy top-ups whenever you need more.<br className="hidden sm:block" />
          3 credits generate one full AI-powered demo video.
        </p>

        {/* Mode toggle — role=tablist for screen readers */}
        <div
          role="tablist"
          aria-label="Billing mode"
          className="inline-flex bg-gray-100 p-1 rounded-xl overflow-x-auto max-w-full"
        >
          <button
            role="tab"
            aria-selected={mode === 'subscription'}
            onClick={() => setMode('subscription')}
            className={[
              'px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
              mode === 'subscription' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
            ].join(' ')}
          >
            Monthly Subscriptions
          </button>
          <button
            role="tab"
            aria-selected={mode === 'topup'}
            onClick={() => setMode('topup')}
            className={[
              'px-4 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold rounded-lg whitespace-nowrap',
              'transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
              mode === 'topup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900',
            ].join(' ')}
          >
            One-time Top-ups
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div role="alert" aria-live="polite" className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl text-center">
          {error}
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {(mode === 'subscription' ? PACKS : TOPUP_PACKS).map(pack => {
          const active = isActive(pack.key, pack.popular);
          const isCurrent = mode === 'subscription' && activePlan === pack.key;

          return (
            <div
              key={pack.key}
              onMouseEnter={() => setHovered(pack.key)}
              onMouseLeave={() => setHovered(null)}
              className={[
                'relative flex flex-col rounded-2xl p-5 sm:p-6 cursor-default',
                'transition-shadow transition-transform duration-300',
                active
                  ? 'border-2 border-gray-900 shadow-lg sm:scale-105 sm:z-10 bg-white'
                  : 'border border-gray-200 shadow-sm bg-white',
              ].join(' ')}
            >
              {/* Current plan or popular badge */}
              {isCurrent ? (
                <span className="absolute top-0 right-0 bg-violet-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg rounded-tr-2xl">
                  CURRENT PLAN
                </span>
              ) : pack.popular && (
                <span className={`absolute top-0 right-0 bg-gray-900 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg rounded-tr-2xl transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-0'}`}>
                  POPULAR
                </span>
              )}

              {/* Name + price */}
              <div className="mb-5 mt-1">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">{pack.name}</h2>

                {pack.price === null ? (
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-2xl sm:text-3xl font-bold text-gray-900">Custom</span>
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1 mb-2">
                    <span className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">
                      {fmt.format(pack.price)}
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-gray-500">
                      {mode === 'subscription' ? '/month' : 'one-time'}
                    </span>
                  </div>
                )}

                <div className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded-full mb-3">
                  <IconZap />
                  {pack.credits !== null ? `${pack.credits} credits` : 'Volume deal'}
                </div>

                <p className="text-xs text-gray-500 leading-relaxed">{pack.desc}</p>
              </div>

              {/* CTA button */}
              {pack.key === 'enterprise' ? (
                <a
                  href="mailto:support@trypitch.co"
                  className={[
                    'w-full py-2.5 px-4 font-semibold text-sm rounded-xl mb-5',
                    'flex items-center justify-center gap-2 no-underline',
                    'transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
                    active
                      ? 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
                  ].join(' ')}
                >
                  Book a Meeting
                </a>
              ) : isCurrent ? (
                <button
                  disabled
                  aria-label={`${pack.name} — your current plan`}
                  className="w-full py-2.5 px-4 font-semibold text-sm rounded-xl mb-5 flex items-center justify-center gap-2 bg-violet-50 text-violet-600 border border-violet-200 cursor-default opacity-80"
                >
                  <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Current Plan
                </button>
              ) : (
                <button
                  onClick={() => handleCheckout(pack.key as PackKey | TopupKey, mode === 'topup')}
                  disabled={loading !== null}
                  aria-label={loading === pack.key ? 'Redirecting to checkout…' : `Buy ${pack.credits} credits — ${pack.name} plan`}
                  className={[
                    'w-full py-2.5 px-4 font-semibold text-sm rounded-xl mb-5',
                    'flex items-center justify-center gap-2',
                    'transition-colors duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-1',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                    active
                      ? 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
                      : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
                  ].join(' ')}
                >
                  {loading === pack.key ? (
                    <>
                      <div aria-hidden="true" className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Redirecting…
                    </>
                  ) : `Buy ${pack.credits} Credits`}
                </button>
              )}

              {/* Features */}
              <ul className="flex-1 space-y-2.5 text-xs sm:text-sm text-gray-600">
                {pack.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5">
                    <IconCheck />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        Secure payment via Dodo Payments · Credits never expire · Need a custom volume deal?{' '}
        <a href="mailto:support@trypitch.co" className="text-gray-600 underline underline-offset-2 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 rounded-sm">
          Contact us
        </a>
      </p>
    </div>
  );
};
