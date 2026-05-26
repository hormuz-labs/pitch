export const LoadingCoin = ({ className = '' }: { className?: string }) => {
  return (
    <div className={`scene relative perspective-[800px] ${className}`}>
      <style>
        {`
          .coin-wrapper-3d {
            width: 100%;
            height: 100%;
            position: relative;
            transform-style: preserve-3d;
            animation: spinCoin3d 1.5s linear infinite;
          }
          @keyframes spinCoin3d {
            0% { transform: rotateY(0deg); }
            100% { transform: rotateY(360deg); }
          }
          .coin-face-3d {
            position: absolute;
            width: 100%;
            height: 100%;
            backface-visibility: hidden;
            border-radius: 50%;
          }
          .coin-back-3d {
            transform: rotateY(180deg);
          }
        `}
      </style>
      <div className="coin-wrapper-3d">
        {/* FRONT FACE */}
        <svg className="coin-face-3d" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="coinBase" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#3a3a3a"/>
              <stop offset="50%" stopColor="#1a1a1a"/>
              <stop offset="100%" stopColor="#050505"/>
            </linearGradient>
            <linearGradient id="coinFace" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2e2e2e"/>
              <stop offset="50%" stopColor="#161616"/>
              <stop offset="100%" stopColor="#080808"/>
            </linearGradient>
            <clipPath id="circleClip">
              <circle cx="100" cy="100" r="70"/>
            </clipPath>
            <filter id="white_glow" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4" result="blur_far"/>
              <feFlood floodColor="#ffffff" floodOpacity="0.25" result="color_far"/>
              <feComposite in="color_far" in2="blur_far" operator="in" result="glow_far"/>
              <feGaussianBlur stdDeviation="2" result="blur_mid"/>
              <feFlood floodColor="#ffffff" floodOpacity="0.55" result="color_mid"/>
              <feComposite in="color_mid" in2="blur_mid" operator="in" result="glow_mid"/>
              <feMerge>
                <feMergeNode in="glow_far"/>
                <feMergeNode in="glow_mid"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          <circle cx="100" cy="100" r="94" fill="url(#coinBase)"/>
          <circle cx="100" cy="100" r="93" fill="none" stroke="#3a3a3a" strokeWidth="5"
            strokeDasharray="4.8695 4.8695" strokeDashoffset="143.6493" strokeLinecap="butt"/>
          <circle cx="100" cy="100" r="88" fill="none" stroke="#555555" strokeWidth="1" opacity="0.5"/>
          <circle cx="100" cy="100" r="85" fill="none" stroke="#111111" strokeWidth="1" opacity="0.6"/>
          <circle cx="100" cy="100" r="82" fill="url(#coinFace)"/>
          <circle cx="100" cy="100" r="80" fill="none" stroke="#3a3a3a" strokeWidth="1" opacity="0.7"/>
          <circle cx="100" cy="100" r="78" fill="none" stroke="#050505" strokeWidth="0.8" opacity="0.6"/>
          <circle cx="100" cy="100" r="72" fill="#111111" clipPath="url(#circleClip)"/>
          <g clipPath="url(#circleClip)">
            <g filter="url(#white_glow)" transform="translate(100,100) scale(0.80) translate(-100,-100)">
              <rect fill="#ffffff" x="53" y="45" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="86" y="45" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="119" y="45" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="53" y="68" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="119" y="68" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="53" y="91" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="86" y="91" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="119" y="91" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="53" y="114" width="28" height="18" rx="3"/>
              <rect fill="#ffffff" x="53" y="137" width="28" height="18" rx="3"/>
            </g>
          </g>
        </svg>

        {/* BACK FACE */}
        <svg className="coin-face-3d coin-back-3d" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="coinBaseB" x1="1" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#3a3a3a"/>
              <stop offset="50%" stopColor="#1a1a1a"/>
              <stop offset="100%" stopColor="#050505"/>
            </linearGradient>
            <linearGradient id="coinFaceB" x1="1" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="#2e2e2e"/>
              <stop offset="50%" stopColor="#161616"/>
              <stop offset="100%" stopColor="#080808"/>
            </linearGradient>
          </defs>
          <circle cx="100" cy="100" r="94" fill="url(#coinBaseB)"/>
          <circle cx="100" cy="100" r="93" fill="none" stroke="#3a3a3a" strokeWidth="5"
            strokeDasharray="4.8695 4.8695" strokeDashoffset="143.6493" strokeLinecap="butt"/>
          <circle cx="100" cy="100" r="88" fill="none" stroke="#555555" strokeWidth="1" opacity="0.5"/>
          <circle cx="100" cy="100" r="85" fill="none" stroke="#111111" strokeWidth="1" opacity="0.6"/>
          <circle cx="100" cy="100" r="82" fill="url(#coinFaceB)"/>
          <circle cx="100" cy="100" r="80" fill="none" stroke="#3a3a3a" strokeWidth="1" opacity="0.7"/>
          <circle cx="100" cy="100" r="78" fill="none" stroke="#050505" strokeWidth="0.8" opacity="0.6"/>
          {/* Back pattern: concentric rings */}
          <circle cx="100" cy="100" r="60" fill="none" stroke="#2a2a2a" strokeWidth="1.5"/>
          <circle cx="100" cy="100" r="44" fill="none" stroke="#222" strokeWidth="1"/>
          <circle cx="100" cy="100" r="24" fill="#1a1a1a" stroke="#2a2a2a" strokeWidth="1"/>
          <circle cx="100" cy="100" r="8" fill="#2e2e2e"/>
        </svg>
      </div>
    </div>
  );
};
