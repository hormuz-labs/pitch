import { useState } from 'react';

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconCheck = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-900 shrink-0">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const PricingView = () => {
  const [hoveredCard, setHoveredCard] = useState<'pro' | 'enterprise' | null>(null);

  const isEnterpriseHovered = hoveredCard === 'enterprise';
  
  // Pro is active by default, or when explicitly hovered.
  // It only shrinks when Enterprise is hovered.
  const proIsActive = !isEnterpriseHovered;
  const entIsActive = isEnterpriseHovered;

  return (
    <div className="flex flex-col items-center justify-center min-h-full p-4 md:p-8 max-w-5xl mx-auto w-full font-sans">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 tracking-tight">
          Flexible plans that grow with you
        </h1>
        <p className="text-base text-gray-500 max-w-xl mx-auto leading-relaxed">
          Start for free, no credit card required.<br />
          Upgrade when you need a plan that fits your needs.
        </p>
      </div>

      {/* Pricing Grid */}
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl w-full">
        
        {/* Pro Plan */}
        <div 
          className={`bg-white rounded-2xl p-6 flex flex-col relative overflow-hidden transition-all duration-300 ease-in-out cursor-default ${
            proIsActive 
              ? 'border-2 border-gray-900 shadow-lg transform scale-105 z-10' 
              : 'border border-gray-200 shadow-sm transform scale-100 z-0'
          }`}
          onMouseEnter={() => setHoveredCard('pro')}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className={`absolute top-0 right-0 bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded-bl-lg transition-opacity duration-300 ${proIsActive ? 'opacity-100' : 'opacity-0'}`}>POPULAR</div>
          <div className="mb-5 mt-2">
            <h2 className="text-xl font-bold text-gray-900 mb-1 relative inline-block">
              Pro
              <svg className={`absolute -bottom-1.5 left-0 w-full transition-opacity duration-300 ${proIsActive ? 'opacity-100' : 'opacity-0'}`} viewBox="0 0 100 20" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 15Q30 5 95 15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-rose-500"/>
              </svg>
            </h2>
            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-gray-900">$10</span>
              <span className="text-sm font-medium text-gray-500">per month</span>
            </div>
            <p className="text-xs text-gray-600 h-8">
              For creators and professionals needing advanced video generation features.
            </p>
          </div>

          <button className={`w-full py-2.5 px-4 font-medium text-sm rounded-xl transition-colors mb-6 cursor-pointer ${
            proIsActive ? 'bg-gray-900 hover:bg-gray-800 text-white' : 'bg-white border border-gray-200 text-gray-900 hover:bg-gray-50'
          }`}>
            Get started
          </button>

          <div className="flex-1">
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-3">
                <IconCheck />
                <span className="font-medium text-gray-900">1 credit = $1</span>
              </li>
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>Up to 1080p video exports</span>
              </li>
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>Priority queue access</span>
              </li>
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>Custom agent instructions</span>
              </li>
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>Remove watermarks</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Enterprise Plan */}
        <div 
          className={`bg-white rounded-2xl p-6 flex flex-col relative transition-all duration-300 ease-in-out cursor-default ${
            entIsActive 
              ? 'border-2 border-gray-900 shadow-lg transform scale-105 z-10' 
              : 'border border-gray-200 shadow-sm transform scale-100 z-0'
          }`}
          onMouseEnter={() => setHoveredCard('enterprise')}
          onMouseLeave={() => setHoveredCard(null)}
        >
          <div className="mb-5 mt-2">
            <h2 className="text-xl font-bold text-gray-900 mb-1 relative inline-block">
              Enterprise
              <svg className={`absolute -bottom-2 left-0 w-full transition-opacity duration-300 ${entIsActive ? 'opacity-100' : 'opacity-0'}`} viewBox="0 0 100 20" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 15Q30 5 95 15" stroke="#e6e6e6" strokeWidth="4" strokeLinecap="round" />
              </svg>
            </h2>
            <div className="flex items-baseline gap-1 mb-2 h-9 items-end">
              <span className="text-3xl font-bold text-gray-900">Custom</span>
            </div>
            <p className="text-xs text-gray-600 h-8">
              For large organizations and governments with custom needs and high volume.
            </p>
          </div>

          <button
            className={`w-full py-2.5 px-4 text-gray-900 text-sm font-medium rounded-xl transition-all hover:brightness-95 mb-6 cursor-pointer ${
              entIsActive ? 'bg-gray-900 hover:bg-gray-800 text-white border-none' : 'border border-gray-200'
            }`}
            style={{ backgroundColor: entIsActive ? '' : '#e6e6e6' }}
          >
            Schedule a meeting
          </button>

          <div className="flex-1">
            <ul className="space-y-3 text-sm text-gray-600">
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>Unlimited concurrent generations</span>
              </li>
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>Custom agent fine-tuning</span>
              </li>
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>SSO / SAML authentication</span>
              </li>
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>Dedicated account manager</span>
              </li>
              <li className="flex items-center gap-3">
                <IconCheck />
                <span>Custom SLAs</span>
              </li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
};
