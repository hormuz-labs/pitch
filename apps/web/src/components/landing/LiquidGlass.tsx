/**
 * LiquidGlass — ported from flash/src/components/ui/liquid-glass.tsx
 * Self-contained: no hugeicons, no Next.js, pure framer-motion + vanilla CSS.
 */
import { AnimatePresence, animate, motion, useMotionValue, useSpring } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'

const MAGNETIC = 0.22
const MAX_PX = 14
const SCALE_ZONE = 120
const MAX_SCALE = 1.06
const SPRING = { stiffness: 500, damping: 28, mass: 0.6 }
const SPRING_RETURN = { stiffness: 380, damping: 30, mass: 0.7 }

interface LiquidGlassProps {
  children: React.ReactNode
  className?: string
  radius?: string
  scale?: number
  hoverable?: boolean
  dark?: boolean
  static?: boolean
  background?: string
  whileTap?: object
  transition?: object
  onMouseDown?: (e: React.MouseEvent) => void
  onTouchStart?: (e: React.TouchEvent) => void
}

export function LiquidGlass({
  children,
  className = '',
  radius = '9999px',
  scale = 1,
  hoverable = false,
  dark = false,
  static: isStatic = false,
  background,
  ...motionProps
}: LiquidGlassProps) {
  const s = (v: number) => `${v * scale}px`
  const ref = useRef<HTMLDivElement>(null)
  const pressed = useRef(false)
  const pressOrigin = useRef<{ x: number; y: number } | null>(null)
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(null)
  const [origin, setOrigin] = useState('center center')
  const [zIndex, setZIndex] = useState<number | undefined>(undefined)
  const [hovered, setHovered] = useState(false)

  const rawX = useMotionValue(0)
  const rawY = useMotionValue(0)
  const rawSX = useMotionValue(1)
  const rawSY = useMotionValue(1)
  const x = useSpring(rawX, SPRING)
  const y = useSpring(rawY, SPRING)
  const sX = useSpring(rawSX, SPRING)
  const sY = useSpring(rawSY, SPRING)

  function returnToRest() {
    animate(rawX, 0, SPRING_RETURN)
    animate(rawY, 0, SPRING_RETURN)
    animate(rawSX, 1, SPRING_RETURN)
    animate(rawSY, 1, SPRING_RETURN)
  }

  function setNearestOrigin(clientX: number, clientY: number) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const ox = clientX < rect.left + rect.width / 2 ? 'left' : 'right'
    const oy = clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
    setOrigin(`${ox} ${oy}`)
  }

  function update(clientX: number, clientY: number) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    setSpot({
      x: Math.max(0, Math.min(clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(clientY - rect.top, rect.height)),
    })
    const clamp = (v: number) => Math.max(-MAX_PX, Math.min(MAX_PX, v))
    rawX.set(clamp((clientX - cx) * MAGNETIC))
    rawY.set(clamp((clientY - cy) * MAGNETIC))
    if (pressOrigin.current) {
      const dx = clientX - pressOrigin.current.x
      const dy = clientY - pressOrigin.current.y
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
        rawSX.set(1)
        rawSY.set(1)
      }
    }
    const absDx = Math.abs(clientX - cx)
    const absDy = Math.abs(clientY - cy)
    const total = absDx + absDy || 1
    const ratioX = absDx / total
    const ratioY = absDy / total
    const dist = Math.sqrt((clientX - cx) ** 2 + (clientY - cy) ** 2)
    const t = Math.min(dist / SCALE_ZONE, 1)
    const extra = t * (MAX_SCALE - 1)
    rawSX.set(1 + extra * ratioX)
    rawSY.set(1 + extra * ratioY)
  }

  function release() {
    pressed.current = false
    pressOrigin.current = null
    setSpot(null)
    setZIndex(undefined)
    setHovered(false)
    returnToRest()
    const unsub1 = sX.on('change', check)
    const unsub2 = sY.on('change', check)
    function check() {
      if (Math.abs(sX.get() - 1) < 0.005 && Math.abs(sY.get() - 1) < 0.005) {
        setOrigin('center center')
        unsub1()
        unsub2()
      }
    }
  }

  useEffect(() => {
    if (isStatic) return
    const onMove = (e: MouseEvent) => {
      if (pressed.current) update(e.clientX, e.clientY)
    }
    const onUp = () => {
      if (pressed.current) release()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStatic])

  useEffect(() => {
    if (isStatic) return
    const onMove = (e: TouchEvent) => {
      if (pressed.current) {
        const t = e.touches[0]
        update(t.clientX, t.clientY)
      }
    }
    const onEnd = () => {
      if (pressed.current) release()
    }
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStatic])

  const innerShadow = [
    `inset ${s(30)} ${s(30)} ${s(5)} ${s(-35)} rgba(255,255,255,0.50)`,
    `inset ${s(20)} ${s(20)} ${s(10)} ${s(-20)} rgba(255,255,255,0.20)`,
    `inset ${s(-30)} ${s(-30)} ${s(5)} ${s(-35)} rgba(255,255,255,0.50)`,
    `inset ${s(-20)} ${s(-20)} ${s(10)} ${s(-20)} rgba(255,255,255,0.20)`,
    `inset ${s(16)} ${s(-24)} ${s(5)} ${s(-20)} rgba(50,50,50,0.05)`,
    `inset ${s(-16)} ${s(24)} ${s(5)} ${s(-20)} rgba(50,50,50,0.05)`,
  ].join(', ')

  const staticHoverHandlers =
    isStatic && hoverable
      ? { onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
      : {}

  const glassInner = (
    <motion.div
      ref={ref}
      {...(motionProps as any)}
      {...staticHoverHandlers}
      style={{ borderRadius: radius, background }}
      className={`relative overflow-hidden${!background ? (dark ? ' liquid-glass-dark' : ' liquid-glass-light') : ''} ${className}`}
    >
      {/* Backdrop */}
      <div aria-hidden className="liquid-glass-backdrop" style={{ borderRadius: radius }} />
      {/* Hover overlay */}
      {hoverable && (
        <div
          aria-hidden
          className="liquid-glass-hover-overlay"
          style={{
            borderRadius: radius,
            backgroundColor: hovered
              ? dark
                ? 'rgba(255,255,255,0.12)'
                : 'rgba(186,230,253,0.2)'
              : 'transparent',
          }}
        />
      )}
      {/* Tap spotlight */}
      <AnimatePresence>
        {spot && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="liquid-glass-spotlight"
            style={{
              left: spot.x,
              top: spot.y,
              background: dark ? 'rgba(255,255,255,0.15)' : 'rgba(186,230,253,0.35)',
            }}
          />
        )}
      </AnimatePresence>
      {/* Content */}
      <div className="relative" style={{ zIndex: 10 }}>
        {children}
      </div>
      {/* Inner shadow */}
      <div
        aria-hidden
        className="liquid-glass-inner-shadow"
        style={{ borderRadius: radius, boxShadow: innerShadow }}
      />
    </motion.div>
  )

  if (isStatic) return <div style={{ display: 'contents' }}>{glassInner}</div>

  return (
    <motion.div
      style={{
        x,
        y,
        scaleX: sX,
        scaleY: sY,
        transformOrigin: origin,
        zIndex,
        position: zIndex ? 'relative' : undefined,
      }}
      onMouseEnter={() => {
        if (hoverable) setHovered(true)
      }}
      onMouseLeave={() => {
        if (!pressed.current) setHovered(false)
      }}
      onMouseDown={e => {
        pressed.current = true
        setZIndex(2000)
        setHovered(true)
        pressOrigin.current = { x: e.clientX, y: e.clientY }
        setNearestOrigin(e.clientX, e.clientY)
        update(e.clientX, e.clientY)
      }}
      onTouchStart={e => {
        const t = e.touches[0]
        pressed.current = true
        setZIndex(2000)
        setHovered(true)
        pressOrigin.current = { x: t.clientX, y: t.clientY }
        setNearestOrigin(t.clientX, t.clientY)
        update(t.clientX, t.clientY)
      }}
    >
      {glassInner}
    </motion.div>
  )
}
