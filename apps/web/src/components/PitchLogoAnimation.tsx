import { useEffect, useRef } from 'react'

export const PitchLogoAnimation = ({
  startAnimation = true,
  color = 'var(--logo-fill, #111111)',
  loop = false,
  onComplete,
}: {
  startAnimation?: boolean
  color?: string
  loop?: boolean
  onComplete?: () => void
}) => {
  const containerRef = useRef<SVGSVGElement>(null)
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
    if (!containerRef.current || !startAnimation) return

    const blocks = containerRef.current.querySelectorAll('.pitch-block')
    let timers: ReturnType<typeof setTimeout>[] = []

    const runAnimation = () => {
      // Clear existing timers
      timers.forEach(t => clearTimeout(t))
      timers = []

      // Reset visibility
      blocks.forEach(b => b.classList.remove('visible'))

      // Start stagger
      let maxDelay = 0
      blocks.forEach(block => {
        const delay = parseInt(block.getAttribute('data-delay') || '0', 10) * 0.6 // Faster stagger
        maxDelay = Math.max(maxDelay, delay)
        const t = setTimeout(() => block.classList.add('visible'), delay)
        timers.push(t)
      })

      const completionDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 0
        : maxDelay + 280
      const completionT = setTimeout(() => onCompleteRef.current?.(), completionDelay)
      timers.push(completionT)

      if (loop) {
        const resetT = setTimeout(() => {
          runAnimation()
        }, maxDelay + 1000) // 1 second pause before looping
        timers.push(resetT)
      }
    }

    // Auto-start
    runAnimation()

    return () => {
      timers.forEach(t => clearTimeout(t))
    }
  }, [startAnimation, loop])

  return (
    <div className="flex flex-col items-center">
      <style>
        {`
          .pitch-block {
            opacity: 0;
            transform: translateX(-14px);
            transition: opacity 0.25s ease, transform 0.25s ease;
          }

          .pitch-block.visible {
            opacity: 1;
            transform: translateX(0);
          }
        `}
      </style>

      <svg
        ref={containerRef}
        className="pitch overflow-visible cursor-pointer"
        width="100%"
        height="100%"
        viewBox="20 20 580 140"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* P */}
        <rect
          className="pitch-block"
          fill={color}
          x="30"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="0"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="30"
          y="61"
          width="28"
          height="18"
          rx="3"
          data-delay="100"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="30"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="200"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="30"
          y="107"
          width="28"
          height="18"
          rx="3"
          data-delay="300"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="30"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="400"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="63"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="500"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="63"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="600"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="96"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="700"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="96"
          y="61"
          width="28"
          height="18"
          rx="3"
          data-delay="800"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="96"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="900"
        />

        {/* I */}
        <rect
          className="pitch-block"
          fill={color}
          x="146"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="1100"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="146"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="1200"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="179"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="1300"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="179"
          y="61"
          width="28"
          height="18"
          rx="3"
          data-delay="1400"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="179"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="1500"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="179"
          y="107"
          width="28"
          height="18"
          rx="3"
          data-delay="1600"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="179"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="1700"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="212"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="1800"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="212"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="1900"
        />

        {/* T */}
        <rect
          className="pitch-block"
          fill={color}
          x="262"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="2100"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="295"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="2200"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="295"
          y="61"
          width="28"
          height="18"
          rx="3"
          data-delay="2300"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="295"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="2400"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="295"
          y="107"
          width="28"
          height="18"
          rx="3"
          data-delay="2500"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="295"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="2600"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="328"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="2700"
        />

        {/* C */}
        <rect
          className="pitch-block"
          fill={color}
          x="378"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="2900"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="378"
          y="61"
          width="28"
          height="18"
          rx="3"
          data-delay="3000"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="378"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="3100"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="378"
          y="107"
          width="28"
          height="18"
          rx="3"
          data-delay="3200"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="378"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="3300"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="411"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="3400"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="411"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="3500"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="444"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="3600"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="444"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="3700"
        />

        {/* H */}
        <rect
          className="pitch-block"
          fill={color}
          x="494"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="3900"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="494"
          y="61"
          width="28"
          height="18"
          rx="3"
          data-delay="4000"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="494"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="4100"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="494"
          y="107"
          width="28"
          height="18"
          rx="3"
          data-delay="4200"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="494"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="4300"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="527"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="4400"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="560"
          y="38"
          width="28"
          height="18"
          rx="3"
          data-delay="4500"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="560"
          y="61"
          width="28"
          height="18"
          rx="3"
          data-delay="4600"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="560"
          y="84"
          width="28"
          height="18"
          rx="3"
          data-delay="4700"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="560"
          y="107"
          width="28"
          height="18"
          rx="3"
          data-delay="4800"
        />
        <rect
          className="pitch-block"
          fill={color}
          x="560"
          y="130"
          width="28"
          height="18"
          rx="3"
          data-delay="4900"
        />
      </svg>
    </div>
  )
}
