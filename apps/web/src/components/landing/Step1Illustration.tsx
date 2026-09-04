import gsap from 'gsap'
import { useIllustrationTimeline } from '../../hooks/useIllustrationTimeline'

const URL_TEXT = 'https://trypitch.co'

function buildTimeline(root: HTMLElement, onComplete: () => void): gsap.core.Timeline {
  const card = root.querySelector<HTMLElement>('.s1-card')
  const typed = root.querySelector<HTMLSpanElement>('.s1-typed')
  const cursor = root.querySelector<HTMLElement>('.s1-cursor')
  const doneWrap = root.querySelector<HTMLElement>('.s1-done-wrap')
  const doneCheck = root.querySelector<SVGPolylineElement>('.s1-done-check')

  if (!card || !typed || !cursor || !doneWrap || !doneCheck) {
    return gsap.timeline({ paused: true })
  }

  const tl = gsap.timeline({ paused: true, onComplete })

  gsap.set(doneCheck, { strokeDasharray: 16, strokeDashoffset: 16 })

  tl.set(card, { opacity: 0, y: 10 })
    .set(cursor, { opacity: 0 })
    .set(doneWrap, { opacity: 0, scale: 0 })
  tl.call(() => {
    typed.textContent = ''
  })

  tl.to(card, { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' })
  tl.to(cursor, { opacity: 1, duration: 0.05 }, '+=0.1')
  tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 2, yoyo: true })
  tl.to(cursor, { opacity: 1, duration: 0.05 })

  const chars = [...URL_TEXT]
  chars.forEach((_, i) => {
    tl.call(
      () => {
        typed.textContent = URL_TEXT.slice(0, i + 1)
      },
      [],
      '+=0.04',
    )
  })

  tl.to(cursor, { opacity: 0, duration: 0.15, repeat: 2, yoyo: true }, '+=0.2')
  tl.to(doneWrap, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, '+=0.1')
  tl.to(doneCheck, { strokeDashoffset: 0, duration: 0.3, ease: 'power2.out' })
  tl.to({}, { duration: 0.5 }) // buffer at end

  return tl
}

interface Props {
  active: boolean
  onComplete?: () => void
}

export const Step1Illustration = ({ active, onComplete }: Props) => {
  const rootRef = useIllustrationTimeline(buildTimeline, active, onComplete)

  return (
    <div
      ref={rootRef}
      className="landing-step-illustration flex items-center justify-center p-6 h-full w-full"
      style={{ overflow: 'hidden' }}
      aria-hidden="true"
    >
      <div className="s1-card w-full bg-white border border-gray-200 rounded-xl p-3 md:p-4 shadow-sm relative opacity-0">
        <label className="flex items-center gap-1.5 text-[10px] md:text-[11px] font-medium text-gray-700 mb-1.5">
          <span className="text-red-500">*</span> Product URL
        </label>

        <div className="w-full border border-gray-200 rounded-lg px-2.5 md:px-3 py-2 md:py-2.5 text-[10px] md:text-xs text-gray-900 bg-gray-50 flex items-center shadow-inner relative overflow-hidden h-8 md:h-9">
          <div className="flex items-center w-full min-w-0">
            <span className="s1-typed font-mono text-[10px] md:text-[11px] text-gray-900 whitespace-nowrap overflow-hidden"></span>
            <span className="s1-cursor inline-block w-[1.5px] h-[10px] md:h-[12px] bg-blue-500 ml-[1px] opacity-0 shrink-0" />
          </div>

          <div className="s1-done-wrap absolute right-2 md:right-3 opacity-0 scale-0 bg-gray-50 pl-1">
            <svg width="14" height="14" viewBox="0 0 16 16" className="md:w-4 md:h-4">
              <circle cx="8" cy="8" r="8" fill="#16a34a" />
              <polyline
                className="s1-done-check"
                points="4.5,8 7,10.5 11.5,5.5"
                fill="none"
                stroke="#fff"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
