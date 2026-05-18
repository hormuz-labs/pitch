import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { API_URL } from '../config';

const IconCheck = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900 shrink-0 mt-0.5">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconZap = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="shrink-0">
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

export const PricingView = () => {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState<PackKey | TopupKey | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [hovered, setHovered] = useState<PackKey | TopupKey | null>(null);

  const [mode, setMode] = useState<'subscription' | 'topup'>('subscription');

  const handleCheckout = async (key: PackKey | TopupKey, isTopup = false) => {
    setLoading(key);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(isTopup ? { topup: key } : { pack: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Checkout failed');
      setLoading(null);
    }
  };

  // A card is "active" (highlighted) when:
  // - it is hovered, OR
  // - nothing is hovered and it's the popular card
  const isActive = (key: PackKey | TopupKey, popular?: boolean) =>
    hovered === key || (!hovered && !!popular);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-12 sm:pb-16 font-sans">

      {/* Header */}
      <div className="text-center mb-10 sm:mb-12">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-3 tracking-tight">
          Buy credits, generate demos
        </h1>
        <p className="text-sm sm:text-base text-gray-500 max-w-md mx-auto leading-relaxed mb-6">
          Subscribe for monthly credits, or buy top-ups whenever you need more.<br className="hidden sm:block" />
          3 credits generate one full AI-powered demo video.
        </p>

        <div className="inline-flex bg-gray-100 p-1 rounded-xl">
          <button
            onClick={() => setMode('subscription')}
            className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              mode === 'subscription' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Monthly Subscriptions
          </button>
          <button
            onClick={() => setMode('topup')}
            className={`px-6 py-2.5 text-sm font-semibold rounded-lg transition-all ${
              mode === 'topup' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            One-time Top-ups
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl text-center">
          {error}
        </div>
      )}

      {/* Cards — no overflow-visible on mobile so scale stays clipped */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {(mode === 'subscription' ? PACKS : TOPUP_PACKS).map(pack => {
          const active = isActive(pack.key, pack.popular);

          return (
            <div
              key={pack.key}
              onMouseEnter={() => setHovered(pack.key)}
              onMouseLeave={() => setHovered(null)}
              className={[
                'relative flex flex-col rounded-2xl p-5 sm:p-6 transition-all duration-300 cursor-default',
                active
                  ? 'border-2 border-gray-900 shadow-lg sm:scale-105 sm:z-10 bg-white'
                  : 'border border-gray-200 shadow-sm bg-white',
              ].join(' ')}
            >
              {/* Popular badge */}
              {pack.popular && (
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
                    <span className="text-2xl sm:text-3xl font-bold text-gray-900">${pack.price}</span>
                    <span className="text-xs sm:text-sm font-medium text-gray-500">{mode === 'subscription' ? '/month' : 'one-time'}</span>
                  </div>
                )}

                <div className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded-full mb-3">
                  <IconZap />
                  {pack.credits !== null ? `${pack.credits} credits` : 'Volume deal'}
                </div>

                <p className="text-xs text-gray-500 leading-relaxed">{pack.desc}</p>
              </div>

              {/* CTA button */}
              <button
                onClick={() => {
                  if (pack.key === 'enterprise') {
                    window.location.href = 'mailto:support@trypitch.co';
                  } else {
                    handleCheckout(pack.key as any, mode === 'topup');
                  }
                }}
                disabled={loading !== null && pack.key !== 'enterprise'}
                className={[
                  'w-full py-2.5 px-4 font-semibold text-sm rounded-xl mb-5 cursor-pointer border-none',
                  'flex items-center justify-center gap-2 transition-all duration-200',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  active
                    ? 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200',
                ].join(' ')}
              >
                {pack.key === 'enterprise' ? 'Book a Meeting'
                  : loading === pack.key ? (
                    <><div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />Redirecting…</>
                  ) : `Buy ${pack.credits} Credits`}
              </button>

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
        <a href="mailto:support@trypitch.co" className="text-gray-600 underline underline-offset-2 hover:text-gray-900">
          Contact us
        </a>
      </p>
    </div>
  );
};
