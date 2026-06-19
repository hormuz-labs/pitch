import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { downloadReceiptPdf } from '../lib/receiptPdf'

/* ─────────────────────────────────────────────
   PAYMENT RECEIPT — animated thermal-printer receipt shown on the
   Dodo Payments callback page (success or failure).

   Rendered as a full-screen overlay. Drive it with the `status` prop:
     - status="success" → green celebration, confetti, peel-to-claim credits
     - status="failed"  → red "Payment Failed" receipt with a retry action
───────────────────────────────────────────── */

export type PaymentReceiptStatus = 'success' | 'failed'

export interface PaymentReceiptProps {
  status: PaymentReceiptStatus
  /** Formatted total, e.g. "$45.00". */
  amount?: string
  /** Credits granted on success / attempted on failure. */
  credits?: number
  /** Name shown on the receipt. */
  payerName?: string
  /** Payment method label, e.g. "UPI Payment", "Card". */
  method?: string
  /** Pre-formatted date string; defaults to today. */
  date?: string
  /** Running credit balance shown in the points pill (success only). */
  balance?: number
  /** Dodo transaction id, shown on the receipt + official PDF. */
  receiptId?: string
  /** Billing email, shown on the official PDF. */
  email?: string
  /** Plan/pack label, e.g. "50 Credits/mo". */
  label?: string
  /** Dismiss the overlay. */
  onClose?: () => void
  /** Retry the checkout (failure only). */
  onRetry?: () => void
}

/* ─────────────────────────────────────────────
   PRINTER LIP — minimal bar with two end caps + slot
───────────────────────────────────────────── */
const PrinterLip = ({ printing, width = 500 }: { printing: boolean; width?: number }) => (
  <div style={{ position: 'relative', width, height: 56, zIndex: 30 }}>
    {/* End cap left */}
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 8,
        width: 38,
        height: 46,
        borderRadius: '16px 8px 8px 16px',
        background: 'linear-gradient(180deg,#f4f4f4 0%,#e2e2e2 60%,#cfcfcf 100%)',
        boxShadow:
          'inset 0 1.5px 0 rgba(255,255,255,0.95),' +
          'inset 0 -2px 4px rgba(0,0,0,0.12),' +
          '0 8px 18px rgba(0,0,0,0.10)',
      }}
    />
    {/* End cap right */}
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 8,
        width: 38,
        height: 46,
        borderRadius: '8px 16px 16px 8px',
        background: 'linear-gradient(180deg,#f4f4f4 0%,#e2e2e2 60%,#cfcfcf 100%)',
        boxShadow:
          'inset 0 1.5px 0 rgba(255,255,255,0.95),' +
          'inset 0 -2px 4px rgba(0,0,0,0.12),' +
          '0 8px 18px rgba(0,0,0,0.10)',
      }}
    />
    {/* Main bar */}
    <div
      style={{
        position: 'absolute',
        left: 24,
        right: 24,
        top: 0,
        height: 42,
        borderRadius: '18px 18px 6px 6px',
        background: 'linear-gradient(180deg,#fafafa 0%,#ececec 55%,#d8d8d8 100%)',
        boxShadow:
          'inset 0 2px 1px rgba(255,255,255,0.95),' +
          'inset 0 -3px 6px rgba(0,0,0,0.10),' +
          '0 10px 22px rgba(0,0,0,0.10)',
        overflow: 'hidden',
      }}
    >
      {/* slot opening */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: 6,
          transform: 'translateX(-50%)',
          width: '72%',
          height: 5,
          borderRadius: 999,
          background: 'linear-gradient(180deg,#0a0a0a,#222)',
          boxShadow: 'inset 0 1.5px 3px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.7)',
          overflow: 'hidden',
        }}
      >
        {printing && (
          <motion.div
            animate={{ x: ['-120%', '120%'] }}
            transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: '35%',
              background: 'linear-gradient(90deg,transparent, rgba(110,231,183,0.55), transparent)',
            }}
          />
        )}
      </div>
    </div>
    {/* soft shadow on the receipt below */}
    <div
      style={{
        position: 'absolute',
        left: 50,
        right: 50,
        bottom: -8,
        height: 14,
        background: 'linear-gradient(180deg, rgba(0,0,0,0.18), transparent)',
        filter: 'blur(2px)',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  </div>
)

/* ─────────────────────────────────────────────
   ICONS
───────────────────────────────────────────── */

/* Site favicon tile — trypitch P pixel-block icon */
const SiteFavicon = () => (
  <svg
    viewBox="0 0 200 200"
    xmlns="http://www.w3.org/2000/svg"
    style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      display: 'block',
      flexShrink: 0,
      boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
    }}
  >
    <defs>
      <filter id="siteGlow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="6" result="b1" />
        <feFlood floodColor="#ffffff" floodOpacity="0.25" result="c1" />
        <feComposite in="c1" in2="b1" operator="in" result="g1" />
        <feGaussianBlur stdDeviation="3" result="b2" />
        <feFlood floodColor="#ffffff" floodOpacity="0.5" result="c2" />
        <feComposite in="c2" in2="b2" operator="in" result="g2" />
        <feGaussianBlur stdDeviation="1.5" result="b3" />
        <feFlood floodColor="#ffffff" floodOpacity="0.85" result="c3" />
        <feComposite in="c3" in2="b3" operator="in" result="g3" />
        <feMerge>
          <feMergeNode in="g1" />
          <feMergeNode in="g2" />
          <feMergeNode in="g3" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <rect width="200" height="200" rx="40" fill="#111111" />
    <g filter="url(#siteGlow)">
      {[
        [53, 45],
        [86, 45],
        [119, 45],
        [53, 68],
        [119, 68],
        [53, 91],
        [86, 91],
        [119, 91],
        [53, 114],
        [53, 137],
      ].map(([x, y], i) => (
        <rect key={i} fill="#ffffff" x={x} y={y} width="28" height="18" rx="3" />
      ))}
    </g>
  </svg>
)

/* Avatar — initials tile */
const Avatar = ({ initials }: { initials: string }) => (
  <div
    style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      background: 'linear-gradient(135deg,#fca5a5,#ef4444)',
      color: '#fff',
      fontWeight: 700,
      fontSize: 11,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      letterSpacing: '0.02em',
      flexShrink: 0,
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
    }}
  >
    {initials}
  </div>
)

/* Payment method tile — UPI letters for UPI, otherwise a generic card glyph */
const PayTile = ({ method = '' }: { method?: string }) => {
  const isUpi = /upi/i.test(method)
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        background: '#fff',
        border: '1px solid #ececec',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      }}
    >
      {isUpi ? (
        <svg width="24" height="14" viewBox="0 0 60 28" fill="none">
          <text
            x="2"
            y="22"
            fontFamily="'DM Sans',sans-serif"
            fontWeight="800"
            fontSize="22"
            fill="#f97316"
          >
            U
          </text>
          <text
            x="22"
            y="22"
            fontFamily="'DM Sans',sans-serif"
            fontWeight="800"
            fontSize="22"
            fill="#15803d"
          >
            P
          </text>
          <text
            x="42"
            y="22"
            fontFamily="'DM Sans',sans-serif"
            fontWeight="800"
            fontSize="22"
            fill="#1e40af"
          >
            I
          </text>
        </svg>
      ) : (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#6b7280"
          strokeWidth={2}
        >
          <rect x="2" y="5" width="20" height="14" rx="2.5" />
          <path d="M2 10h20" stroke="#6b7280" strokeWidth={2.4} />
        </svg>
      )}
    </div>
  )
}

/* Coin SVG — high-quality black coin with pixel-block P logo (used everywhere) */
const CoinSVG = ({ size = 32 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 200"
    style={{ width: size, height: size, display: 'block' }}
  >
    <defs>
      <linearGradient id="coinBaseG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#3a3a3a" />
        <stop offset="50%" stopColor="#1a1a1a" />
        <stop offset="100%" stopColor="#050505" />
      </linearGradient>
      <linearGradient id="coinFaceG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2e2e2e" />
        <stop offset="50%" stopColor="#161616" />
        <stop offset="100%" stopColor="#080808" />
      </linearGradient>
      <clipPath id="coinClipG">
        <circle cx="100" cy="100" r="70" />
      </clipPath>
      <filter id="coinGlowG" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="4" result="blur_far" />
        <feFlood floodColor="#ffffff" floodOpacity="0.25" result="color_far" />
        <feComposite in="color_far" in2="blur_far" operator="in" result="glow_far" />
        <feGaussianBlur stdDeviation="2" result="blur_mid" />
        <feFlood floodColor="#ffffff" floodOpacity="0.55" result="color_mid" />
        <feComposite in="color_mid" in2="blur_mid" operator="in" result="glow_mid" />
        <feMerge>
          <feMergeNode in="glow_far" />
          <feMergeNode in="glow_mid" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <circle cx="100" cy="104" r="94" fill="#000" opacity="0.5" />
    <circle cx="100" cy="100" r="94" fill="url(#coinBaseG)" />
    <circle
      cx="100"
      cy="100"
      r="93"
      fill="none"
      stroke="#3a3a3a"
      strokeWidth="5"
      strokeDasharray="5.8 3.1"
    />
    <circle cx="100" cy="100" r="88" fill="none" stroke="#555" strokeWidth="1" opacity="0.5" />
    <circle cx="100" cy="100" r="85" fill="none" stroke="#111" strokeWidth="1" opacity="0.6" />
    <circle cx="100" cy="100" r="82" fill="url(#coinFaceG)" />
    <circle cx="100" cy="100" r="80" fill="none" stroke="#3a3a3a" strokeWidth="1" opacity="0.7" />
    <circle cx="100" cy="100" r="78" fill="none" stroke="#050505" strokeWidth="0.8" opacity="0.6" />
    <circle cx="100" cy="100" r="72" fill="#111" clipPath="url(#coinClipG)" />
    <g clipPath="url(#coinClipG)">
      <g filter="url(#coinGlowG)" transform="translate(100,100) scale(0.80) translate(-100,-100)">
        {[
          [53, 45],
          [86, 45],
          [119, 45],
          [53, 68],
          [119, 68],
          [53, 91],
          [86, 91],
          [119, 91],
          [53, 114],
          [53, 137],
        ].map(([x, y], i) => (
          <rect key={i} fill="#ffffff" x={x} y={y} width="28" height="18" rx="3" />
        ))}
      </g>
    </g>
  </svg>
)

/* The inline coin used in the points pill is the same SVG, smaller */
const InlineCoin = ({ size = 14 }: { size?: number }) => <CoinSVG size={size} />

/* ─────────────────────────────────────────────
   SCALLOPED EDGES
───────────────────────────────────────────── */
/* Top edge — gentle scallops (semi-circles cut INTO the top) */
const ScallopTop = ({ width }: { width: number }) => {
  const r = 9 // notch radius
  const step = 22 // distance between notch centers
  const n = Math.floor(width / step)
  return (
    <svg
      width={width}
      height={r + 2}
      viewBox={`0 0 ${width} ${r + 2}`}
      style={{ display: 'block' }}
    >
      {/* fill rectangle then carve notches */}
      <defs>
        <mask id="topMask">
          <rect width={width} height={r + 2} fill="#fff" />
          {Array.from({ length: n }).map((_, i) => (
            <circle key={i} cx={step / 2 + i * step} cy={0} r={r} fill="#000" />
          ))}
        </mask>
      </defs>
      <rect width={width} height={r + 2} fill="#fff" mask="url(#topMask)" />
    </svg>
  )
}

/* Bottom edge — small triangular zigzag (sharper teeth) */
const ZigzagBottom = ({ width }: { width: number }) => {
  const tooth = 9
  const h = 8
  const n = Math.floor(width / tooth)
  let d = `M0 0 `
  for (let i = 0; i < n; i++) {
    const x1 = i * tooth + tooth / 2
    const x2 = (i + 1) * tooth
    d += `L${x1} ${h} L${x2} 0 `
  }
  d += `L${width} 0 Z`
  return (
    <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={{ display: 'block' }}>
      <path d={d} fill="#fff" />
    </svg>
  )
}

/* ─────────────────────────────────────────────
   CONFETTI
───────────────────────────────────────────── */
const Confetti = () => (
  <div
    aria-hidden="true"
    style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 1 }}
  >
    {[...Array(24)].map((_, i) => {
      const colors = ['#34d399', '#6ee7b7', '#10b981', '#a7f3d0']
      const color = colors[i % colors.length]
      const w = 5 + (i % 3) * 4
      return (
        <motion.div
          key={i}
          style={{
            position: 'absolute',
            top: '-5%',
            left: `${(i * 4.2 + 1.1) % 100}%`,
            width: w,
            height: i % 2 === 0 ? w * 2 : w,
            background: color,
            borderRadius: i % 2 === 0 ? 2 : 1,
            transform: i % 2 !== 0 ? 'rotate(45deg)' : undefined,
            opacity: 0.7,
          }}
          animate={{
            y: ['0vh', '108vh'],
            rotate: [0, 160 + ((i * 41) % 360)],
            x: [0, (i % 2 === 0 ? 1 : -1) * 18],
          }}
          transition={{
            duration: 3 + (i % 4) * 0.6,
            repeat: Infinity,
            ease: 'linear',
            delay: (i * 0.09) % 2.5,
          }}
        />
      )
    })}
  </div>
)

/* ─────────────────────────────────────────────
   FLYING COIN
───────────────────────────────────────────── */
/* Deterministic pseudo-random in [0,1) from a seed — pure, stable across renders.
   (Math.sin is pure; this keeps confetti varied without Math.random in render.) */
const hashRand = (seed: number) => {
  const x = Math.sin(seed * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/* CONFETTI BURST — one-shot pop at celebration moment */
const BURST_COLORS = ['#34d399', '#6ee7b7', '#10b981', '#a7f3d0', '#059669', '#bbf7d0']
const ConfettiBurst = () => {
  const N = 56
  const particles = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        const angle = (i / N) * Math.PI * 2 + (hashRand(i + 1) - 0.5) * 0.4
        const dist = 140 + hashRand(i + 2) * 260
        const tx = Math.cos(angle) * dist
        const ty = Math.sin(angle) * dist
        return {
          i,
          tx,
          ty,
          midY: ty - 80 - hashRand(i + 3) * 40,
          endY: ty + 380 + hashRand(i + 4) * 120,
          color: BURST_COLORS[i % BURST_COLORS.length],
          w: 6 + hashRand(i + 5) * 8,
          shape: hashRand(i + 6) > 0.5 ? 'rect' : 'circle',
          rot: (hashRand(i + 7) - 0.5) * 1080,
          dur: 1.4 + hashRand(i + 8) * 0.7,
        }
      }),
    [],
  )
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        width: 0,
        height: 0,
        pointerEvents: 'none',
        zIndex: 7,
      }}
    >
      {particles.map(p => {
        const h = p.shape === 'rect' ? p.w * 1.8 : p.w
        return (
          <motion.div
            key={p.i}
            initial={{ x: 0, y: 0, opacity: 1, scale: 0.3, rotate: 0 }}
            animate={{
              x: [0, p.tx * 0.8, p.tx],
              y: [0, p.midY, p.endY],
              opacity: [1, 1, 0],
              scale: [0.3, 1, 0.9],
              rotate: [0, p.rot * 0.5, p.rot],
            }}
            transition={{ duration: p.dur, ease: [0.15, 0.55, 0.55, 1], times: [0, 0.4, 1] }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: p.w,
              height: h,
              background: p.color,
              borderRadius: p.shape === 'circle' ? '50%' : 2,
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            }}
          />
        )
      })}
    </div>
  )
}

interface FlyingCoinProps {
  startX: number
  startY: number
  endX: number
  endY: number
  delay: number
  size: number
  cp1x: number
  cp1y: number
  dur: number
}
interface FlyingCoinItem extends FlyingCoinProps {
  id: number
}
const FlyingCoin = ({
  startX,
  startY,
  endX,
  endY,
  delay,
  size,
  cp1x,
  cp1y,
  dur,
}: FlyingCoinProps) => (
  <motion.div
    style={{ position: 'fixed', width: size, height: size, zIndex: 9999, pointerEvents: 'none' }}
    initial={{ x: startX, y: startY, scale: 0.5, opacity: 1, rotate: 0, filter: 'blur(0px)' }}
    animate={{
      x: [startX, cp1x, endX],
      y: [startY, cp1y, endY],
      scale: [0.6, 1, 0.15],
      opacity: [1, 1, 0],
      rotate: [0, -160, -340],
      filter: ['blur(0px)', 'blur(1px)', 'blur(6px)'],
    }}
    transition={{ duration: dur, delay, ease: [0.2, 0, 0.85, 1], times: [0, 0.5, 1] }}
  >
    <CoinSVG size={size} />
  </motion.div>
)

/* ─────────────────────────────────────────────
   PEEL-TO-CLAIM PILL (outlined, matches reference)
───────────────────────────────────────────── */
interface PeelTrackProps {
  swipeRange: number
  handleWidth: number
  dragX: ReturnType<typeof useMotionValue<number>>
  textOpacity: ReturnType<typeof useTransform<number, number>>
  trackFill: ReturnType<typeof useTransform<number, string>>
  onDragEnd: (e: unknown, info: { offset: { x: number } }) => void
}
const PeelTrack = ({
  swipeRange,
  handleWidth,
  dragX,
  textOpacity,
  trackFill,
  onDragEnd,
}: PeelTrackProps) => (
  <div
    style={{
      width: '100%',
      height: 48,
      background: '#fff',
      border: '1.5px solid #e5e7eb',
      borderRadius: 999,
      position: 'relative',
      padding: 3,
      display: 'flex',
      alignItems: 'center',
      overflow: 'hidden',
    }}
  >
    {/* fill */}
    <motion.div
      style={{
        position: 'absolute',
        left: 3,
        top: 3,
        bottom: 3,
        width: trackFill,
        background: 'linear-gradient(90deg,#bbf7d0,#6ee7b7)',
        borderRadius: 999,
        zIndex: 0,
      }}
    />
    {/* label */}
    <motion.div
      style={{
        opacity: textOpacity,
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 1,
      }}
    >
      <span
        style={{
          fontSize: 17,
          fontWeight: 500,
          color: '#1f2937',
          fontFamily: "'DM Sans',sans-serif",
        }}
      >
        Peel to claim
      </span>
    </motion.div>
    {/* Generous, easy-to-grab handle */}
    <motion.div
      drag="x"
      dragConstraints={{ left: 0, right: swipeRange }}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      whileTap={{ scale: 0.97, cursor: 'grabbing' }}
      style={{
        x: dragX,
        width: handleWidth,
        height: 42,
        borderRadius: 999,
        cursor: 'grab',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
        flexShrink: 0,
        position: 'absolute',
        left: 3,
        top: 3,
        background: 'linear-gradient(180deg,#2a2a2a 0%,#0f0f0f 100%)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
      }}
    >
      <motion.svg
        width="20"
        height="20"
        fill="none"
        viewBox="0 0 24 24"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={2.4}
        animate={{ x: [0, 3, 0] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
      </motion.svg>
    </motion.div>
  </div>
)

/* ─────────────────────────────────────────────
   MAIN
───────────────────────────────────────────── */
function defaultDate() {
  const d = new Date()
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ]
  const day = d.getDate()
  const suffix = (n: number) =>
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th'
  return `${months[d.getMonth()]} ${day}${suffix(day)}, ${d.getFullYear()}`
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '··'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function PaymentReceipt({
  status,
  amount,
  credits = 50,
  payerName = 'Customer',
  method,
  date,
  balance,
  receiptId,
  email,
  label,
  onClose,
  onRetry,
}: PaymentReceiptProps) {
  const isSuccess = status === 'success'
  const receiptDate = date || defaultDate()
  const hasBalance = typeof balance === 'number'
  // The server balance already includes this purchase, so the pill starts at the
  // pre-purchase amount and the claim animation lands the credits up to `balance`.
  const startBalance = hasBalance ? Math.max(0, (balance as number) - credits) : 0

  const [phase, setPhase] = useState('idle')
  const [points, setPoints] = useState(startBalance)
  const [flyingCoins, setFlyingCoins] = useState<FlyingCoinItem[]>([])
  const [pointsFlash, setPointsFlash] = useState(false)
  const [receiptHeight, setReceiptHeight] = useState(500)

  const receiptRef = useRef<HTMLDivElement>(null)
  const sliderRef = useRef<HTMLDivElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  // Responsive sizing — the receipt + printer scale to fit phones and tablets
  // instead of overflowing a fixed 440px width.
  const [vw, setVw] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1024))
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  // Move focus into the dialog on open so keyboard users land here (Escape closes).
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const RECEIPT_W = Math.min(400, vw - 56)
  const LIP_W = Math.min(RECEIPT_W + 64, vw - 16)

  const trackWidth = RECEIPT_W - 56 // inside the paper's 28px horizontal padding
  const handleWidth = 56
  const swipeRange = trackWidth - handleWidth - 6

  const dragX = useMotionValue(0)
  const textOpacity = useTransform(dragX, [0, swipeRange * 0.4], [1, 0])
  const trackFill = useTransform(dragX, [0, swipeRange], ['0%', '100%'])

  /* Sequence:
     1. badge bursts in BIG, centered
     2. badge shrinks + slides UP, printer slides in below
     3. printer prints the receipt slowly
     4. content revealed, claim pill becomes active (success only) */
  useEffect(() => {
    // Component mounts fresh per overlay, so initial state already starts at
    // 'idle' / empty / balance — we only need to schedule the print sequence.
    const ts = [
      setTimeout(() => setPhase('celebrating'), 300), // big badge
      setTimeout(() => setPhase('arranging'), 2100), // shrink + slide up
      setTimeout(() => setPhase('printing'), 2900), // receipt extrudes
      setTimeout(() => setPhase('revealed'), 7700),
      setTimeout(() => setPhase('claimable'), 8400),
    ]
    return () => ts.forEach(clearTimeout)
    // Run once on mount — the overlay is remounted for each new checkout result.
  }, [])

  useLayoutEffect(() => {
    // Receipt body renders all rows regardless of phase, so a single
    // mount measurement gives the full height used for the slide-out offset.
    if (receiptRef.current) {
      const h = receiptRef.current.offsetHeight
      if (h > 0) setReceiptHeight(h)
    }
  }, [])

  const claimedRef = useRef(false)
  const runClaim = useCallback(() => {
    if (claimedRef.current) return
    claimedRef.current = true
    dragX.set(swipeRange)
    setPhase('claimed')

    // Reduced motion: skip the flying-coin animation, just land the balance.
    if (prefersReducedMotion) {
      setPoints(balance ?? 0)
      return
    }

    const sRect = sliderRef.current?.getBoundingClientRect()
    const bRect = bubbleRef.current?.getBoundingClientRect()
    if (!sRect || !bRect) return

    const originX = sRect.right - 28
    const originY = sRect.top + sRect.height / 2
    const targetX = bRect.left + bRect.width / 2 - 14
    const targetY = bRect.top + bRect.height / 2 - 14

    const coinCount = 18
    const addPerCoin = credits / coinCount
    const coins: FlyingCoinItem[] = Array.from({ length: coinCount }, (_, i) => {
      const startX = originX + (Math.random() * 20 - 10)
      const startY = originY + (Math.random() * 12 - 6)
      const endX = targetX + (Math.random() * 8 - 4)
      const endY = targetY + (Math.random() * 8 - 4)
      return {
        id: i,
        startX,
        startY,
        endX,
        endY,
        delay: i * 0.048,
        size: 22 + Math.random() * 14,
        cp1x: startX + (Math.random() - 0.5) * 100,
        cp1y: Math.min(startY, endY) - 60 - Math.random() * 80,
        dur: 0.55 + Math.random() * 0.2,
      }
    })
    setFlyingCoins(coins)

    coins.forEach((c, i) => {
      setTimeout(
        () => {
          setPointsFlash(true)
          // Land on the true server balance on the last coin (no double counting).
          setPoints(prev => (i === coinCount - 1 ? (balance ?? 0) : Math.round(prev + addPerCoin)))
          setTimeout(() => {
            setPointsFlash(false)
          }, 120)
        },
        (c.delay + 0.58) * 1000,
      )
    })
  }, [swipeRange, dragX, credits, balance, prefersReducedMotion])

  const handleDragEnd = useCallback(
    (_e: unknown, info: { offset: { x: number } }) => {
      if (info.offset.x < swipeRange * 0.4) {
        dragX.set(0)
        return
      }
      runClaim()
    },
    [swipeRange, dragX, runClaim],
  )

  // Auto-claim: credits are already granted server-side, so the peel is pure
  // celebration — slide it automatically shortly after it becomes claimable.
  useEffect(() => {
    if (phase !== 'claimable' || !isSuccess) return
    if (prefersReducedMotion) {
      const tr = setTimeout(runClaim, 0)
      return () => clearTimeout(tr)
    }
    const t = setTimeout(() => {
      animate(dragX, swipeRange, { duration: 0.5, ease: [0.4, 0, 0.2, 1] })
      setTimeout(runClaim, 380)
    }, 650)
    return () => clearTimeout(t)
  }, [phase, isSuccess, dragX, swipeRange, runClaim, prefersReducedMotion])

  const [saving, setSaving] = useState(false)
  const saveReceipt = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await downloadReceiptPdf({
        receiptId,
        payerName,
        email,
        amount,
        method,
        date: receiptDate,
        label,
        credits,
      })
    } catch (err) {
      console.error('[Receipt] Failed to save PDF', err)
    } finally {
      setSaving(false)
    }
  }, [saving, receiptId, payerName, email, amount, method, receiptDate, label, credits])

  const isPrinting = phase === 'printing'
  const isRevealed = ['revealed', 'claimable', 'claimed'].includes(phase)
  const isClaimable = ['claimable', 'claimed'].includes(phase) && isSuccess
  const isClaimed = phase === 'claimed'
  const feedOut = isPrinting || isRevealed

  const showBadge = phase !== 'idle'
  const badgeBig = phase === 'celebrating'
  const showPrinter = !['idle', 'celebrating'].includes(phase)

  // Theme by status
  const accent = isSuccess ? '#059669' : '#dc2626'
  const accentHi = isSuccess ? '#34d399' : '#f87171'
  const bg = isSuccess
    ? 'linear-gradient(170deg,#f4fdf8 0%,#fafafa 55%,#eef0ee 100%)'
    : 'linear-gradient(170deg,#fef4f4 0%,#fafafa 55%,#f0eeee 100%)'

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={isSuccess ? 'Payment complete receipt' : 'Payment failed'}
      tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape' && onClose) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 'max(40px, env(safe-area-inset-top))',
        paddingBottom: 'max(80px, env(safe-area-inset-bottom))',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        fontFamily: "'DM Sans','Helvetica Neue',sans-serif",
        overflowY: 'auto',
        overflowX: 'hidden',
        userSelect: 'none',
        outline: 'none',
      }}
    >
      <AnimatePresence>
        {showBadge && isSuccess && !prefersReducedMotion && <Confetti />}
      </AnimatePresence>
      <AnimatePresence>
        {badgeBig && isSuccess && !prefersReducedMotion && <ConfettiBurst />}
      </AnimatePresence>

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close receipt"
          style={{
            position: 'fixed',
            top: 'max(18px, env(safe-area-inset-top))',
            right: 'max(18px, env(safe-area-inset-right))',
            zIndex: 50,
            width: 38,
            height: 38,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.8)',
            border: '1px solid rgba(0,0,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            backdropFilter: 'blur(6px)',
            touchAction: 'manipulation',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#374151"
            strokeWidth={2.2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}

      {/* ── STATUS BADGE — bursts in big, then shrinks + slides up ── */}
      <motion.div
        initial={{ scale: 0, opacity: 0, y: 220 }}
        animate={
          badgeBig
            ? { scale: 1.75, opacity: 1, y: 220 } // big, centered in viewport
            : showBadge
              ? { scale: 1, opacity: 1, y: 0 } // settled header above printer
              : { scale: 0, opacity: 0, y: 220 }
        }
        transition={{
          scale: { type: 'spring', damping: 14, stiffness: 180 },
          y: { type: 'spring', damping: 18, stiffness: 160 },
          opacity: { duration: 0.3 },
        }}
        style={{
          position: 'relative',
          zIndex: 6,
          marginBottom: 28,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transformOrigin: 'center',
        }}
      >
        {!prefersReducedMotion && (
          <motion.div
            aria-hidden="true"
            animate={{ scale: [1, 1.25, 1], opacity: [0, 0.25, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            style={{
              position: 'absolute',
              width: 90,
              height: 90,
              borderRadius: '50%',
              background: `radial-gradient(${accentHi}88,transparent 70%)`,
            }}
          />
        )}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: `linear-gradient(135deg,${accentHi},${accent})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 10px 30px ${isSuccess ? 'rgba(16,185,129,0.35)' : 'rgba(220,38,38,0.35)'}`,
            position: 'relative',
            zIndex: 1,
          }}
        >
          <svg
            aria-hidden="true"
            width="30"
            height="30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="white"
            strokeWidth={3}
          >
            {isSuccess ? (
              <motion.path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: showBadge ? 1 : 0 }}
                transition={{ delay: 0.25, duration: 0.45 }}
              />
            ) : (
              <motion.path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 6l12 12M18 6L6 18"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: showBadge ? 1 : 0 }}
                transition={{ delay: 0.25, duration: 0.45 }}
              />
            )}
          </svg>
        </div>
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 22,
            fontWeight: 800,
            color: '#0a0a0a',
            letterSpacing: '-0.4px',
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          {isSuccess ? 'Payment Complete' : 'Payment Failed'}
        </p>
      </motion.div>

      {/* Printer + Receipt assembly */}
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: showPrinter ? 1 : 0, y: showPrinter ? 0 : -30 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* PRINTER LIP */}
        <div style={{ position: 'relative', zIndex: 30 }}>
          <PrinterLip printing={isPrinting && !prefersReducedMotion} width={LIP_W} />
        </div>

        {/* RECEIPT FEED WINDOW — clips so the receipt appears to slide out of the slot */}
        <div
          style={{
            position: 'relative',
            width: RECEIPT_W,
            overflow: 'hidden',
            zIndex: 10,
            marginTop: -14,
            paddingTop: 4,
          }}
        >
          <motion.div
            initial={{ y: -(receiptHeight + 30) }}
            animate={{ y: feedOut ? 0 : -(receiptHeight + 30) }}
            transition={{
              duration: isPrinting ? (prefersReducedMotion ? 0.3 : 4.8) : 0.01,
              ease: isPrinting ? [0.45, 0.05, 0.55, 1] : 'linear',
            }}
          >
            {/* Receipt body */}
            <div ref={receiptRef} style={{ position: 'relative' }}>
              {/* Scalloped top edge */}
              <div style={{ width: RECEIPT_W, lineHeight: 0 }}>
                <ScallopTop width={RECEIPT_W} />
              </div>

              {/* Paper */}
              <div
                style={{
                  background: '#fff',
                  boxShadow: '0 24px 64px rgba(0,0,0,0.10), 0 4px 16px rgba(0,0,0,0.04)',
                  padding: '18px 28px 14px',
                  backgroundImage:
                    'repeating-linear-gradient(0deg,transparent,transparent 22px,rgba(0,0,0,0.008) 22px,rgba(0,0,0,0.008) 23px)',
                }}
              >
                {/* TOTAL */}
                <div style={{ textAlign: 'center', padding: '10px 0 14px' }}>
                  {amount && (
                    <div
                      style={{
                        fontSize: 34,
                        fontWeight: 800,
                        letterSpacing: '-0.02em',
                        color: isSuccess ? '#0a0a0a' : '#b91c1c',
                        textDecoration: isSuccess ? 'none' : 'line-through',
                        textDecorationThickness: '2px',
                      }}
                    >
                      {amount}
                    </div>
                  )}
                  {!isSuccess && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        color: '#dc2626',
                        textTransform: 'uppercase',
                      }}
                    >
                      Declined
                    </div>
                  )}
                </div>

                {/* dotted divider */}
                <div
                  style={{
                    height: 1,
                    backgroundImage: 'radial-gradient(circle, #d1d5db 1px, transparent 1.2px)',
                    backgroundSize: '6px 1px',
                    backgroundRepeat: 'repeat-x',
                    backgroundPosition: 'center',
                    margin: '0 0 6px',
                  }}
                />

                {/* Row: site */}
                <Row>
                  <SiteFavicon />
                  <span style={rowText}>trypitch.co</span>
                </Row>

                {/* Row: sender + points pill */}
                <Row>
                  <Avatar initials={initialsOf(payerName)} />
                  <span style={rowText}>{payerName}</span>
                  {isSuccess && hasBalance && (
                    <motion.div
                      ref={bubbleRef}
                      animate={{
                        scale: pointsFlash ? [1, 1.18, 1] : 1,
                        boxShadow: pointsFlash
                          ? [
                              '0 0 0 0 rgba(0,0,0,0)',
                              '0 0 0 4px rgba(0,0,0,0.10)',
                              '0 0 0 0 rgba(0,0,0,0)',
                            ]
                          : '0 0 0 0 rgba(0,0,0,0)',
                      }}
                      transition={{ duration: 0.18 }}
                      style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        background: '#f1f3f5',
                        padding: '5px 10px 5px 6px',
                        borderRadius: 999,
                      }}
                    >
                      <InlineCoin size={14} />
                      <motion.span
                        transition={{ duration: 0.09 }}
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#374151',
                          fontFamily: "'DM Mono',monospace",
                          minWidth: 42,
                          textAlign: 'right',
                        }}
                      >
                        {points.toLocaleString()}
                      </motion.span>
                    </motion.div>
                  )}
                </Row>

                {/* Row: payment method */}
                {method && (
                  <Row>
                    <PayTile method={method} />
                    <span style={rowText}>{method}</span>
                  </Row>
                )}

                {/* Date row */}
                <div
                  style={{
                    padding: '14px 4px 2px',
                    fontSize: 17,
                    color: '#1f2937',
                    fontWeight: 500,
                  }}
                >
                  {receiptDate}
                </div>
                {receiptId && (
                  <div
                    style={{
                      padding: '0 4px 6px',
                      fontSize: 11,
                      color: '#9ca3af',
                      fontFamily: "'DM Mono',monospace",
                      letterSpacing: '0.02em',
                    }}
                  >
                    Receipt #{receiptId}
                  </div>
                )}

                {/* Action area */}
                <div style={{ paddingTop: 6, paddingBottom: 8 }}>
                  {isSuccess ? (
                    <>
                      {!isClaimed ? (
                        <div
                          ref={sliderRef}
                          data-no-export="true"
                          style={{ opacity: isClaimable ? 1 : 0.55, transition: 'opacity 0.3s' }}
                        >
                          <PeelTrack
                            swipeRange={swipeRange}
                            handleWidth={handleWidth}
                            dragX={dragX}
                            textOpacity={textOpacity}
                            trackFill={trackFill}
                            onDragEnd={isClaimable ? handleDragEnd : () => {}}
                          />
                        </div>
                      ) : (
                        <motion.div
                          initial={{ scale: 0.92, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', damping: 14 }}
                          style={{
                            height: 48,
                            background: 'linear-gradient(135deg,#0a2a1a,#064e3b)',
                            borderRadius: 999,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 14px rgba(6,78,59,0.28)',
                            gap: 8,
                          }}
                        >
                          <svg
                            width="18"
                            height="18"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="#34d399"
                            strokeWidth={2.5}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span
                            style={{
                              fontSize: 14,
                              fontWeight: 600,
                              color: '#a7f3d0',
                              letterSpacing: '0.04em',
                              fontFamily: "'DM Sans',sans-serif",
                            }}
                          >
                            +{credits} credits claimed
                          </span>
                        </motion.div>
                      )}

                      {/* Save / download the receipt as an image */}
                      {isRevealed && (
                        <button
                          data-no-export="true"
                          onClick={saveReceipt}
                          disabled={saving}
                          aria-label={saving ? 'Generating PDF receipt' : 'Download receipt as PDF'}
                          style={{
                            marginTop: 10,
                            height: 44,
                            width: '100%',
                            cursor: saving ? 'default' : 'pointer',
                            background: '#fff',
                            color: '#374151',
                            borderRadius: 999,
                            border: '1.5px solid #e5e7eb',
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "'DM Sans',sans-serif",
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            opacity: saving ? 0.6 : 1,
                            touchAction: 'manipulation',
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                            />
                          </svg>
                          {saving ? 'Generating PDF…' : 'Download receipt'}
                        </button>
                      )}
                    </>
                  ) : (
                    isRevealed && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <button
                          onClick={onRetry}
                          style={{
                            height: 48,
                            width: '100%',
                            border: 'none',
                            cursor: 'pointer',
                            background: 'linear-gradient(180deg,#ef4444 0%,#b91c1c 100%)',
                            color: '#fff',
                            borderRadius: 999,
                            fontSize: 15,
                            fontWeight: 700,
                            fontFamily: "'DM Sans',sans-serif",
                            touchAction: 'manipulation',
                            boxShadow: '0 4px 14px rgba(185,28,28,0.28)',
                          }}
                        >
                          Try again
                        </button>
                        <button
                          onClick={onClose}
                          style={{
                            height: 44,
                            width: '100%',
                            cursor: 'pointer',
                            background: '#fff',
                            color: '#6b7280',
                            borderRadius: 999,
                            border: '1.5px solid #e5e7eb',
                            fontSize: 14,
                            fontWeight: 600,
                            fontFamily: "'DM Sans',sans-serif",
                            touchAction: 'manipulation',
                          }}
                        >
                          Back to pricing
                        </button>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* Zigzag bottom edge */}
              <div
                style={{
                  width: RECEIPT_W,
                  lineHeight: 0,
                  filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.05))',
                }}
              >
                <ZigzagBottom width={RECEIPT_W} />
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Flying coins */}
      {!prefersReducedMotion && (
        <div aria-hidden="true">
          {flyingCoins.map(({ id, ...c }) => (
            <FlyingCoin key={id} {...c} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── helpers ─── */
const rowText: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 500,
  color: '#1f2937',
  fontFamily: "'DM Sans',sans-serif",
}
function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 4px',
        borderBottom: '1px solid #f1f3f5',
      }}
    >
      {children}
    </div>
  )
}
