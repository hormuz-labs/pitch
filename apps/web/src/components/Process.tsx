type ProcessThread = {
  id: number;
  word1: string;
  word2: string;
  gradientId: string;
  colors: string[];
  path: string;
  y: number;
  delay: string;
  highlightX1: number;
  highlightX2: number;
  highlightQx: number;
  textX?: number;
  timeLabel: string;
};

export const Process = () => {
  const threads: ProcessThread[] = [
    {
      id: 0,
      word1: 'Asset',
      word2: 'Ingestion',
      gradientId: 'grad-cyan-blue',
      // Unified shades of vivid blue
      colors: ['#3B82F6', '#60A5FA', '#93C5FD', '#60A5FA', '#3B82F6', '#2563EB', '#1D4ED8'],
      path: 'M 120 80 C 310 80, 310 305, 480 305',
      y: 80,
      delay: '0s',
      highlightX1: -54,
      highlightX2: 105,
      highlightQx: 25,
      timeLabel: '15 minutes',
    },
    {
      id: 1,
      word1: 'Script',
      word2: 'Synthesis',
      gradientId: 'grad-amber-orange',
      // Unified shades of warm orange
      colors: ['#F97316', '#FDBA74', '#FCD34D', '#FDBA74', '#F97316', '#EA580C', '#C2410C'],
      path: 'M 36 200 C 310 200, 310 315, 480 315',
      y: 200,
      delay: '-0.6s',
      highlightX1: -149,
      highlightX2: 21,
      highlightQx: -64,
      textX: 24,
      timeLabel: '20 minutes',
    },
    {
      id: 2,
      word1: 'Voiceover',
      word2: 'AI',
      gradientId: 'grad-violet-purple',
      // Unified shades of rich purple
      colors: ['#8B5CF6', '#C084FC', '#E9D5FF', '#C084FC', '#8B5CF6', '#7C3AED', '#6D28D9'],
      path: 'M 120 325 C 260 335, 360 315, 480 325',
      y: 325,
      delay: '-1.2s',
      highlightX1: -27,
      highlightX2: 105,
      highlightQx: 39,
      timeLabel: '10 minutes',
    },
    {
      id: 3,
      word1: 'Scene',
      word2: 'Capture',
      gradientId: 'grad-emerald-teal',
      // Unified shades of vibrant green
      colors: ['#10B981', '#6EE7B7', '#A7F3D0', '#6EE7B7', '#10B981', '#059669', '#047857'],
      path: 'M 60 450 C 310 450, 310 335, 480 335',
      y: 450,
      delay: '-1.8s',
      highlightX1: -102,
      highlightX2: 45,
      highlightQx: -28,
      textX: 48,
      timeLabel: '25 minutes',
    },
    {
      id: 4,
      word1: 'Post',
      word2: 'Production',
      gradientId: 'grad-pink-rose',
      // Unified shades of hot pink/rose
      colors: ['#EC4899', '#F472B6', '#FBCFE8', '#F472B6', '#EC4899', '#D946EF', '#C026D3'],
      path: 'M 120 570 C 310 570, 310 345, 480 345',
      y: 570,
      delay: '-2.4s',
      highlightX1: -54,
      highlightX2: 105,
      highlightQx: 25,
      timeLabel: '30 minutes',
    },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8 select-none">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');

          @keyframes thread-flow {
            from {
              stroke-dashoffset: 180;
            }
            to {
              stroke-dashoffset: 0;
            }
          }

          @keyframes thread-flow-right {
            from {
              stroke-dashoffset: 240;
            }
            to {
              stroke-dashoffset: 0;
            }
          }

          .thread-flow-line {
            stroke-dasharray: 60, 120;
            animation: thread-flow 2.0s linear infinite;
          }

          .thread-flow-line-fast {
            stroke-dasharray: 80, 160;
            animation: thread-flow-right 1.2s linear infinite;
          }

          /* Theme adjustments for SVG text labels */
          .svg-text-label {
            font-family: var(--font-sans);
            font-size: 20px;
            letter-spacing: 0.05em;
          }

          /* Cursive label along thread curve */
          .svg-cursive-label {
            font-family: 'Dancing Script', cursive;
            font-size: 17px;
            font-weight: 700;
          }

          /* Monochrome Output Theme stop colors */
          :root {
            --output-stop-start: #374151;
            --output-stop-mid:   #6B7280;
            --output-stop-end:   #9CA3AF;
          }

          [data-theme="dark"] {
            --output-stop-start: #9CA3AF;
            --output-stop-mid:   #E5E7EB;
            --output-stop-end:   #FFFFFF;
          }

          @media (max-width: 640px) {
            .process-svg-wrapper {
              transform: scale(1.35);
              padding: 10px;
            }
            .logo-center-card {
              transform: scale(0.85);
            }
          }
        `}
      </style>

      <div className="relative w-full aspect-[2/1] bg-transparent process-svg-wrapper">
        <svg
          viewBox="-180 0 1300 650"
          width="100%"
          height="100%"
          className="overflow-visible"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Color Gradients for left inputs — using userSpaceOnUse for robust horizontal line rendering */}
            {threads.map((t) => (
              <linearGradient
                key={t.id}
                id={t.gradientId}
                gradientUnits="userSpaceOnUse"
                x1="140"
                y1="0"
                x2="480"
                y2="0"
              >
                <stop offset="0%" stopColor={t.colors[0]} />
                <stop offset="16%" stopColor={t.colors[1]} />
                <stop offset="33%" stopColor={t.colors[2]} />
                <stop offset="50%" stopColor={t.colors[3]} />
                <stop offset="66%" stopColor={t.colors[4]} />
                <stop offset="83%" stopColor={t.colors[5]} />
                <stop offset="100%" stopColor={t.colors[6]} />
              </linearGradient>
            ))}

            {/* Combined Output Gradient — using userSpaceOnUse for robust horizontal line rendering */}
            <linearGradient
              id="grad-output"
              gradientUnits="userSpaceOnUse"
              x1="520"
              y1="0"
              x2="883"
              y2="0"
            >
              <stop offset="0%" stopColor="var(--output-stop-start)" />
              <stop offset="50%" stopColor="var(--output-stop-mid)" />
              <stop offset="100%" stopColor="var(--output-stop-end)" />
            </linearGradient>

            {/* Dedicated Gradient for Right Highlighter */}
            <linearGradient
              id="grad-right-highlighter"
              gradientUnits="userSpaceOnUse"
              x1="883"
              y1="0"
              x2="1072"
              y2="0"
            >
              <stop offset="0%" stopColor="var(--output-stop-start)" />
              <stop offset="50%" stopColor="var(--output-stop-mid)" />
              <stop offset="100%" stopColor="var(--output-stop-end)" />
            </linearGradient>

            {/* Tight Neon Glow filter with large bounds to prevent clipping */}
            <filter id="svg-blur-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.0" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Reference paths for cursive labels — one per thread */}
            {threads.map((t) => (
              <path
                key={`curve-ref-${t.id}`}
                id={`thread-curve-${t.id}`}
                d={t.path}
                fill="none"
              />
            ))}

            {/* Reference path for right output thread cursive label */}
            <path
              id="output-curve"
              d="M 520 325 C 640 345, 740 305, 883 325"
              fill="none"
            />
          </defs>

          {/* ── LEFT INPUT THREADS ── */}
          {threads.map((t) => {
            return (
              <g key={t.id} className="transition-all duration-300">
                {/* 1. Fully Colored Base Static Path */}
                <path
                  d={t.path}
                  fill="none"
                  stroke={`url(#${t.gradientId})`}
                  strokeWidth={5.5}
                  opacity={0.65}
                />

                {/* 2. Soft Outer Glowing Path */}
                <path
                  d={t.path}
                  fill="none"
                  stroke={`url(#${t.gradientId})`}
                  strokeWidth={10}
                  opacity={0.8}
                  filter="url(#svg-blur-glow)"
                  className="thread-flow-line"
                  style={{ animationDelay: t.delay }}
                />

                {/* 3. Bright Core Flowing Path */}
                <path
                  d={t.path}
                  fill="none"
                  stroke={`url(#${t.gradientId})`}
                  strokeWidth={4.5}
                  className="thread-flow-line"
                  style={{ animationDelay: t.delay }}
                />

                {/* Curvy Highlighter (covers entire text now) */}
                <path
                  d={`M ${t.highlightX1} ${t.y - 4} Q ${t.highlightQx} ${t.y}, ${t.highlightX2} ${t.y - 5}`}
                  fill="none"
                  stroke={`url(#${t.gradientId})`}
                  strokeWidth={30}
                  opacity={0.15}
                  strokeLinecap="round"
                />

                {/* Left Text Label */}
                <text
                  x={t.textX ?? 108}
                  y={t.y + 6}
                  textAnchor="end"
                  className="svg-text-label"
                >
                  <tspan fill={t.colors[0]} fontWeight="800">{t.word1}</tspan>
                  <tspan fill={t.colors[0]} fontWeight="800"> {t.word2}</tspan>
                </text>

                {/* Cursive '15 minutes' label along each thread's curve */}
                <text className="svg-cursive-label" opacity={1}>
                  <textPath
                    href={`#thread-curve-${t.id}`}
                    startOffset="18%"
                  >
                    <tspan fill={t.colors[1]} dy="-14">{t.timeLabel}</tspan>
                  </textPath>
                </text>
              </g>
            );
          })}

          {/* ── RIGHT OUTPUT THREAD ── */}
          <g className="transition-all duration-300">
            {/* 1. Base Static Path */}
            <path
              d="M 520 325 C 640 345, 740 305, 883 325"
              fill="none"
              stroke="url(#grad-output)"
              strokeWidth={5.5}
              opacity={0.65}
            />

            {/* 2. Soft Outer Glowing Path */}
            <path
              d="M 520 325 C 640 345, 740 305, 883 325"
              fill="none"
              stroke="url(#grad-output)"
              strokeWidth={10}
              opacity={0.8}
              filter="url(#svg-blur-glow)"
              className="thread-flow-line"
            />

            {/* 3. Bright Core Flowing Path */}
            <path
              d="M 520 325 C 640 345, 740 305, 883 325"
              fill="none"
              stroke="url(#grad-output)"
              strokeWidth={4.5}
              className="thread-flow-line"
            />

            {/* Curvy Highlighter for Output Text (covers entire text now) */}
            <path
              d="M 898 319 Q 978 325, 1057 318"
              fill="none"
              stroke="url(#grad-right-highlighter)"
              strokeWidth={30}
              opacity={0.15}
              strokeLinecap="round"
            />

            {/* Right Text Label */}
            <text
              x={895}
              y={331}
              textAnchor="start"
              className="svg-text-label"
            >
              <tspan fill="var(--text-primary)" fontWeight="800">Cinematic</tspan>
              <tspan fill="var(--text-primary)" fontWeight="800"> Video</tspan>
            </text>

            {/* Cursive '10 minutes' label along output curve */}
            <text className="svg-cursive-label" opacity={1} textAnchor="middle">
              <textPath href="#output-curve" startOffset="50%">
                <tspan fill="var(--output-stop-mid)" dy="-14">10 minutes</tspan>
              </textPath>
            </text>
          </g>

          {/* ── CENTER LOGO BADGE (p-0 to allow SVG to fully touch the card boundary) ── */}
          <foreignObject x={450} y={275} width={100} height={100}>
            <div className="w-full h-full flex items-center justify-center logo-center-card">
              <div
                className="relative w-16 h-16 rounded-2xl overflow-hidden border transition-all duration-500 flex items-center justify-center p-0 bg-[#111111] scale-110 border-[#8B5CF6]/40"
              >
                <img
                  src="/tabLogoB.svg"
                  alt="Pitch Logo"
                  className="w-full h-full object-contain pointer-events-none"
                />
              </div>
            </div>
          </foreignObject>
        </svg>
      </div>
    </div>
  );
};
