import { useState } from 'react';
import { useAuth } from '@clerk/clerk-react';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900 shrink-0">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);
const IconZap = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
  </svg>
);

type PackKey = 'starter' | 'pro' | 'enterprise';

const PACKS: { key: PackKey; name: string; price: number; credits: number; desc: string; features: string[]; popular?: boolean }[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 10,
    credits: 10,
    desc: 'Perfect for trying out AI-powered demo generation.',
    features: ['10 AI credits', '3 credits = 1 full demo', 'Up to 1080p exports', 'Priority queue access'],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 40,
    credits: 50,
    desc: 'For creators and professionals — best value per credit.',
    popular: true,
    features: ['50 AI credits', '20% savings vs. Starter', 'Up to 1080p exports', 'Custom agent instructions', 'Remove watermarks'],
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 130,
    credits: 200,
    desc: 'High-volume teams and agencies who need scale.',
    features: ['200 AI credits', '35% savings vs. Starter', 'Up to 1080p exports', 'Custom agent fine-tuning', 'SSO / SAML', 'Dedicated account manager'],
  },
];

import { API_URL } from '../config';

export const PricingView = () => {
  const { getToken } = useAuth();
  const [loading, setLoading] = useState<PackKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<PackKey | null>(null);

  const handleCheckout = async (pack: PackKey) => {
    setLoading(pack);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pack }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Checkout failed');
      window.location.href = data.url; // redirect to Stripe Checkout
    } catch (e: any) {
      setError(e.message);
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-4 md:p-8 max-w-5xl mx-auto w-full font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 tracking-tight">
          Buy credits, generate demos
        </h1>
        <p className="text-base text-gray-500 max-w-xl mx-auto leading-relaxed">
          No subscriptions. Pay once, use whenever.<br />
          3 credits generate one full AI-powered demo video.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 w-full max-w-4xl px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl text-center">
          {error}
        </div>
      )}

      {/* Pricing Grid */}
      <div className="grid md:grid-cols-3 gap-5 max-w-4xl w-full">
        {PACKS.map(pack => {
          const isHovered = hoveredCard === pack.key;
          const isActive = pack.popular ? hoveredCard !== 'enterprise' && hoveredCard !== 'starter' : isHovered;

          return (
            <div
              key={pack.key}
              className={`bg-white rounded-2xl p-6 flex flex-col relative overflow-hidden transition-all duration-300 ease-in-out cursor-default ${
                isActive || (!hoveredCard && pack.popular)
                  ? 'border-2 border-gray-900 shadow-lg scale-105 z-10'
                  : 'border border-gray-200 shadow-sm scale-100 z-0'
              }`}
              onMouseEnter={() => setHoveredCard(pack.key)}
              onMouseLeave={() => setHoveredCard(null)}
            >
              {/* Popular badge */}
              {pack.popular && (
                <div className={`absolute top-0 right-0 bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded-bl-lg transition-opacity duration-300 ${(isActive || !hoveredCard) ? 'opacity-100' : 'opacity-0'}`}>
                  POPULAR
                </div>
              )}

              <div className="mb-5 mt-2">
                <h2 className="text-xl font-bold text-gray-900 mb-3">{pack.name}</h2>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-bold text-gray-900">${pack.price}</span>
                  <span className="text-sm font-medium text-gray-500">one-time</span>
                </div>
                <div className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-semibold px-2 py-0.5 rounded-full mb-2">
                  <IconZap />
                  {pack.credits} credits
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{pack.desc}</p>
              </div>

              <button
                id={`checkout-btn-${pack.key}`}
                onClick={() => {
                  if (pack.key === 'enterprise') {
                    window.location.href = 'mailto:support@trypitch.co';
                  } else {
                    handleCheckout(pack.key);
                  }
                }}
                disabled={loading !== null && pack.key !== 'enterprise'}
                className={`w-full py-2.5 px-4 font-semibold text-sm rounded-xl transition-all mb-6 cursor-pointer border-none flex items-center justify-center gap-2 ${
                  (isActive || (!hoveredCard && pack.popular))
                    ? 'bg-gray-900 hover:bg-gray-700 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                } disabled:opacity-60 disabled:cursor-not-allowed`}
              >
                {pack.key === 'enterprise' ? (
                  'Book a Meeting'
                ) : loading === pack.key ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Redirecting…
                  </>
                ) : (
                  `Buy ${pack.credits} Credits`
                )}
              </button>

              <div className="flex-1">
                <ul className="space-y-3 text-sm text-gray-600">
                  {pack.features.map(f => (
                    <li key={f} className="flex items-center gap-3">
                      <IconCheck />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-gray-400 text-center">
        Secure payment via Stripe · Credits never expire · Need a custom volume deal?{' '}
        <a href="mailto:officialtrypitch@gmail.com" className="text-gray-600 underline underline-offset-2 hover:text-gray-900">Contact us</a>
      </p>
    </div>
  );
};
