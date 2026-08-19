import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// ─── Inject keyframes once ────────────────────────────────────────────────────
const STYLE_ID = 'crumple-delete-keyframes-v3'
function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = `
    @keyframes cd-bin-rise {
      0%   { transform: translateY(72px); opacity: 0; }
      60%  { transform: translateY(-6px); opacity: 1; }
      80%  { transform: translateY(3px);  opacity: 1; }
      100% { transform: translateY(0px);  opacity: 1; }
    }
    @keyframes cd-bin-sink {
      0%   { transform: translateY(0px);  opacity: 1; }
      100% { transform: translateY(90px); opacity: 0; }
    }
    @keyframes cd-card-crumple {
      0%   { transform: scale(1)    rotate(0deg);                              border-radius: 12px; }
      6%   { transform: scale(0.97) rotate(-1deg)   skewX(0.4deg);            border-radius: 14px 10px 12px 16px; }
      14%  { transform: scale(0.93) rotate(2.5deg)  skewY(-1deg) skewX(0.8deg); border-radius: 8px 20px 6px 24px; }
      24%  { transform: scale(0.84) rotate(-4deg)   skewX(2deg);              border-radius: 22px 6px 28px 4px; }
      36%  { transform: scale(0.70) rotate(7deg)    skewY(2deg);              border-radius: 30% 18% 36% 14%; }
      50%  { transform: scale(0.50) rotate(-9deg)   skewX(-2deg);             border-radius: 40% 32% 44% 28%; }
      66%  { transform: scale(0.30) rotate(13deg);                            border-radius: 48% 42% 50% 38%; }
      82%  { transform: scale(0.14) rotate(-15deg);                           border-radius: 50%; opacity: 0.8; }
      100% { transform: scale(0.02) rotate(18deg);                            border-radius: 50%; opacity: 0; }
    }
    @keyframes cd-ball-appear {
      from { transform: translate(-50%, -50%) scale(0.08) rotate(-20deg); opacity: 0; }
      to   { transform: translate(-50%, -50%) scale(1)    rotate(0deg);   opacity: 1; }
    }
    /* --cd-fall uses CSS custom property set per-instance */
    @keyframes cd-ball-fall {
      0%   { transform: translate(-50%, -50%)                                                                  rotate(0deg);   opacity: 1; }
      20%  { transform: translate(calc(-50% + 10px), calc(-50% + calc(0.14 * var(--cd-fall))))                rotate(80deg);  opacity: 1; }
      55%  { transform: translate(calc(-50% - 6px),  calc(-50% + calc(0.52 * var(--cd-fall))))                rotate(230deg); opacity: 1; }
      82%  { transform: translate(calc(-50% + 2px),  calc(-50% + calc(0.87 * var(--cd-fall))))                rotate(360deg); opacity: 1; }
      100% { transform: translate(-50%,              calc(-50% + var(--cd-fall)))                             rotate(420deg); opacity: 0; }
    }
    @keyframes cd-undo-in {
      from { transform: translateX(-50%) scale(0.8) translateY(8px); opacity: 0; }
      to   { transform: translateX(-50%) scale(1)   translateY(0px); opacity: 1; }
    }
    @keyframes cd-undo-out {
      from { transform: translateX(-50%) scale(1)   translateY(0px); opacity: 1; }
      to   { transform: translateX(-50%) scale(0.8) translateY(4px); opacity: 0; }
    }
  `
  document.head.appendChild(s)
}

// ─── Wire-mesh bin SVG ────────────────────────────────────────────────────────
// Silver/chrome, diamond-lattice mesh, faithful to FeralUI
let _binId = 0
const WireMeshBin = () => {
  const uid = useRef(`cb${++_binId}`).current
  const mesh = `${uid}m`
  const clip = `${uid}c`
  const rim = `${uid}r`
  const shade = `${uid}s`
  return (
    <svg
      width="110"
      height="100"
      viewBox="0 0 110 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id={mesh} x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <line x1="-2" y1="-2" x2="16" y2="16" stroke="#8a9aaa" strokeWidth="1.1" />
          <line x1="16" y1="-2" x2="-2" y2="16" stroke="#8a9aaa" strokeWidth="1.1" />
        </pattern>
        <clipPath id={clip}>
          <path d="M10 20 L20 92 L90 92 L100 20 Z" />
        </clipPath>
        <linearGradient id={rim} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f0f4f7" />
          <stop offset="30%" stopColor="#d6dfe8" />
          <stop offset="65%" stopColor="#b0bcc8" />
          <stop offset="100%" stopColor="#8a9aaa" />
        </linearGradient>
        <linearGradient id={shade} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6b7f8f" stopOpacity="0.35" />
          <stop offset="35%" stopColor="#aebdcc" stopOpacity="0.08" />
          <stop offset="60%" stopColor="#aebdcc" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#6b7f8f" stopOpacity="0.30" />
        </linearGradient>
      </defs>
      <path d="M10 20 L20 92 L90 92 L100 20 Z" fill="#d8e3ec" fillOpacity="0.18" />
      <rect
        x="0"
        y="20"
        width="110"
        height="72"
        fill={`url(#${mesh})`}
        clipPath={`url(#${clip})`}
      />
      <path d="M10 20 L20 92 L90 92 L100 20 Z" fill={`url(#${shade})`} />
      <line x1="10" y1="20" x2="20" y2="92" stroke="#8a9aaa" strokeWidth="1.4" />
      <line x1="100" y1="20" x2="90" y2="92" stroke="#8a9aaa" strokeWidth="1.4" />
      <ellipse cx="55" cy="22" rx="45" ry="11" fill="#8a9aaa" />
      <ellipse cx="55" cy="20" rx="45" ry="11" fill={`url(#${rim})`} />
      <ellipse cx="55" cy="20" rx="40" ry="9" fill="#1c2830" />
      <path
        d="M13 17 Q55 11 97 17"
        stroke="white"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path
        d="M18 19 Q55 14 92 19"
        stroke="white"
        strokeWidth="0.8"
        fill="none"
        strokeLinecap="round"
        opacity="0.35"
      />
      <ellipse cx="55" cy="92" rx="35" ry="6.5" fill="#b0bcc8" />
      <ellipse cx="55" cy="91" rx="34" ry="5.5" fill="#8a9aaa" />
      <path d="M22 91 Q55 88 88 91" stroke="white" strokeWidth="0.8" fill="none" opacity="0.4" />
    </svg>
  )
}

// ─── Crumpled paper ball SVG ──────────────────────────────────────────────────
const CrumpledBall = () => (
  <svg width="58" height="58" viewBox="0 0 58 58" fill="none" xmlns="http://www.w3.org/2000/svg">
    <ellipse cx="29" cy="54" rx="14" ry="3.5" fill="rgba(0,0,0,0.15)" />
    <polygon
      points="29,3 40,7 50,16 52,29 46,41 32,50 18,48 8,38 5,24 11,12 22,4"
      fill="#edf0f3"
      stroke="#9eaab4"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
    <line x1="29" y1="3" x2="26" y2="23" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="40" y1="7" x2="31" y2="25" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="50" y1="16" x2="34" y2="27" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="52" y1="29" x2="34" y2="28" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="46" y1="41" x2="33" y2="32" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="32" y1="50" x2="29" y2="34" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="18" y1="48" x2="24" y2="33" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="8" y1="38" x2="20" y2="30" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="5" y1="24" x2="19" y2="26" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="11" y1="12" x2="21" y2="21" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <line x1="22" y1="4" x2="25" y2="19" stroke="#9eaab4" strokeWidth="0.9" opacity="0.8" />
    <ellipse
      cx="22"
      cy="19"
      rx="5.5"
      ry="3.5"
      fill="white"
      opacity="0.32"
      transform="rotate(-20 22 19)"
    />
  </svg>
)

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'idle' | 'rising' | 'crumpling' | 'falling' | 'sinking'

export interface CrumpleDeleteProps {
  triggered: boolean
  onConfirmDelete: () => void
  onUndo: () => void
  children: React.ReactNode
  className?: string
}

// ─── Main component ───────────────────────────────────────────────────────────
export const CrumpleDelete = ({
  triggered,
  onConfirmDelete,
  onUndo,
  children,
  className = '',
}: CrumpleDeleteProps) => {
  const [phase, setPhase] = useState<Phase>('idle')
  const [undoLeaving, setUndoLeaving] = useState(false)
  const [countdown, setCountdown] = useState(4)
  // Snapshot the card's screen rect when animation begins so portals
  // can be positioned correctly (and never clipped by sibling grid cards)
  const [cardRect, setCardRect] = useState<DOMRect | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const prevTriggered = useRef(false)

  useEffect(() => {
    ensureKeyframes()
  }, [])

  // Countdown ticker: 4 → 3 → 2 → 1 while undo window is open
  useEffect(() => {
    if (phase !== 'rising') {
      setCountdown(4)
      return
    }
    setCountdown(4)
    const iv = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(iv)
  }, [phase])

  // Capture bounding rect the moment we enter the rising phase
  useEffect(() => {
    if (phase === 'rising' && wrapperRef.current) {
      setCardRect(wrapperRef.current.getBoundingClientRect())
    }
  }, [phase])

  // Sync triggered → phase
  useEffect(() => {
    const was = prevTriggered.current
    prevTriggered.current = triggered
    if (triggered && !was) {
      setPhase('rising')
      setUndoLeaving(false)
    }
    if (!triggered && was && phase === 'rising') {
      setPhase('idle')
      setCardRect(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggered])

  // Phase chain
  useEffect(() => {
    if (phase === 'rising') {
      const t = setTimeout(() => {
        setUndoLeaving(true)
        setTimeout(() => setPhase('crumpling'), 280)
      }, 4000)
      return () => clearTimeout(t)
    }
    if (phase === 'crumpling') {
      const t = setTimeout(() => setPhase('falling'), 620)
      return () => clearTimeout(t)
    }
    if (phase === 'falling') {
      const t = setTimeout(() => setPhase('sinking'), 680)
      return () => clearTimeout(t)
    }
    if (phase === 'sinking') {
      const t = setTimeout(() => {
        setPhase('idle')
        setUndoLeaving(false)
        setCardRect(null)
        onConfirmDelete()
      }, 520)
      return () => clearTimeout(t)
    }
  }, [phase, onConfirmDelete])

  const handleUndo = () => {
    setUndoLeaving(true)
    setTimeout(() => {
      setPhase('idle')
      setUndoLeaving(false)
      setCardRect(null)
      onUndo()
    }, 250)
  }

  const showBin = phase !== 'idle'
  const showBall = phase === 'crumpling' || phase === 'falling'
  const hideCard = phase === 'falling' || phase === 'sinking'
  const showUndo = phase === 'rising'

  // ── Portal coordinates (position: fixed, viewport-clamped) ──────────────────
  //
  // The bin SVG is 110×100px. We want:
  //   • Bin centred horizontally under the card
  //   • Bin visible below the card — but ALWAYS fully within the viewport
  //     so it never gets clipped at the viewport bottom edge (especially on mobile)
  //
  const BIN_W = 110 // SVG width
  const BIN_H = 100 // SVG height
  const BIN_GAP = 6 // gap between card bottom and bin top
  const VH = typeof window !== 'undefined' ? window.innerHeight : 800

  // Horizontal centre = card horizontal centre
  const binCX = cardRect ? cardRect.left + cardRect.width / 2 : 0
  const binLeft = cardRect ? binCX - BIN_W / 2 : 0

  // Preferred top = just below card.
  // Clamped so bin bottom (binTop + BIN_H) never exceeds viewport bottom minus 8px.
  const preferredBinTop = cardRect ? cardRect.bottom + BIN_GAP : 0
  const binTop = cardRect ? Math.min(preferredBinTop, VH - BIN_H - 8) : 0

  // Ball origin = card centre (fixed coords)
  const ballCX = cardRect ? cardRect.left + cardRect.width / 2 : 0
  const ballCY = cardRect ? cardRect.top + cardRect.height / 2 : 0

  // Ball fall distance = from card centre to the bin rim (rim sits ~20px from bin top in the SVG).
  // Must be recalculated from the CLAMPED binTop so the ball truly lands in the rim.
  const binRimY = cardRect ? binTop + 20 : 0
  const fallDist = cardRect ? Math.max(30, Math.round(binRimY - ballCY)) : 210

  // Undo button: 8px below the bin, clamped to stay in viewport
  const undoTop = cardRect ? Math.min(binTop + BIN_H + 8, VH - 36) : 0
  const undoLeft = cardRect ? binCX : 0

  return (
    <>
      {/* ── Card wrapper ─────────────────────────────────────────────────── */}
      <div
        ref={wrapperRef}
        className={className}
        style={{ position: 'relative', overflow: 'visible', isolation: 'isolate' }}
      >
        <div
          style={{
            height: '100%',
            transformOrigin: 'center center',
            // Individual animation props — never mix with the 'animation' shorthand
            animationName: phase === 'crumpling' ? 'cd-card-crumple' : undefined,
            animationDuration: phase === 'crumpling' ? '620ms' : undefined,
            animationTimingFunction:
              phase === 'crumpling' ? 'cubic-bezier(0.36, 0.07, 0.19, 0.97)' : undefined,
            animationFillMode: phase === 'crumpling' ? 'forwards' : undefined,
            visibility: hideCard ? 'hidden' : 'visible',
            // GPU compositing hint: promotes to its own layer so the crumple
            // transform doesn't trigger repaints on child elements (thumbnail bg)
            transform: phase === 'rising' || phase === 'crumpling' ? 'translateZ(0)' : undefined,
            backfaceVisibility: phase === 'crumpling' ? 'hidden' : undefined,
          }}
        >
          {children}
        </div>
      </div>

      {/*
       * ── PORTALS ───────────────────────────────────────────────────────────
       * Rendered directly into document.body via createPortal so they are
       * NEVER clipped by sibling grid cards, no matter the z-index or
       * overflow of surrounding containers. Fixed positioning keeps them
       * anchored to the captured card rect even if the page has scrolled.
       *
       * All animation props use individual shorthand-free properties to
       * avoid the React "conflicting property" warning.
       */}

      {/* Wire-mesh bin */}
      {showBin &&
        cardRect &&
        createPortal(
          <div
            aria-hidden
            style={{
              position: 'fixed',
              top: binTop,
              left: binLeft,
              zIndex: 9998,
              pointerEvents: 'none',
              // Individual animation props – no shorthand mixing
              animationName: phase === 'sinking' ? 'cd-bin-sink' : 'cd-bin-rise',
              animationDuration: phase === 'sinking' ? '520ms' : '420ms',
              animationTimingFunction:
                phase === 'sinking'
                  ? 'cubic-bezier(0.55,0.05,1,0.5)'
                  : 'cubic-bezier(0.34,1.4,0.64,1)',
              animationFillMode: 'forwards',
            }}
          >
            <WireMeshBin />
          </div>,
          document.body,
        )}

      {/* Crumpled paper ball */}
      {showBall &&
        cardRect &&
        createPortal(
          <div
            aria-hidden
            style={{
              position: 'fixed',
              top: ballCY,
              left: ballCX,
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <div
              style={
                {
                  // CSS custom property for dynamic fall distance
                  ['--cd-fall' as string]: `${fallDist}px`,
                  animationName: phase === 'crumpling' ? 'cd-ball-appear' : 'cd-ball-fall',
                  animationDuration: phase === 'crumpling' ? '420ms' : '680ms',
                  animationDelay: phase === 'crumpling' ? '180ms' : '0ms',
                  animationTimingFunction:
                    phase === 'crumpling'
                      ? 'cubic-bezier(0.34,1.4,0.64,1)'
                      : 'cubic-bezier(0.55,0.05,1,0.5)',
                  animationFillMode: 'both',
                } as React.CSSProperties
              }
            >
              <CrumpledBall />
            </div>
          </div>,
          document.body,
        )}

      {/* Undo button with countdown ring */}
      {showUndo &&
        cardRect &&
        createPortal(
          <button
            onClick={handleUndo}
            aria-label="Undo delete"
            style={{
              position: 'fixed',
              top: undoTop,
              left: undoLeft,
              zIndex: 9999,
              animationName: undoLeaving ? 'cd-undo-out' : 'cd-undo-in',
              animationDuration: undoLeaving ? '250ms' : '320ms',
              animationDelay: undoLeaving ? '0ms' : '150ms',
              animationTimingFunction: 'cubic-bezier(0.34,1.4,0.64,1)',
              animationFillMode: 'both',
              background: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '999px',
              padding: '5px 8px 5px 14px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#374151',
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              lineHeight: 1,
            }}
          >
            {/* Undo arrow icon */}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
            Undo
            {/* Circular countdown ring */}
            {(() => {
              const R = 9 // ring radius
              const CIRC = 2 * Math.PI * R // ≈ 56.55
              const offset = CIRC * (1 - countdown / 4) // 0 → full, CIRC → empty
              return (
                <span
                  style={{
                    position: 'relative',
                    width: 22,
                    height: 22,
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* Ring track + progress */}
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 22 22"
                    style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
                  >
                    {/* Track */}
                    <circle cx="11" cy="11" r={R} fill="none" stroke="#f3f4f6" strokeWidth="2.5" />
                    {/* Draining arc */}
                    <circle
                      cx="11"
                      cy="11"
                      r={R}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={CIRC}
                      strokeDashoffset={offset}
                      style={{ transition: 'stroke-dashoffset 0.95s linear' }}
                    />
                  </svg>
                  {/* Number in centre */}
                  <span
                    style={{
                      position: 'relative',
                      fontSize: '9px',
                      fontWeight: 800,
                      color: '#374151',
                      lineHeight: 1,
                      userSelect: 'none',
                    }}
                  >
                    {countdown}
                  </span>
                </span>
              )
            })()}
          </button>,
          document.body,
        )}
    </>
  )
}
