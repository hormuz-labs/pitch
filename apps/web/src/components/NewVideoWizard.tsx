import { useState, useEffect, useCallback } from 'react'

// ── Constants ─────────────────────────────────────────────────────────────────
const WIZARD_KEY = 'pitch_new_video_wizard_seen'
export const shouldShowWizard = () => !localStorage.getItem(WIZARD_KEY)
export const markWizardSeen = () => localStorage.setItem(WIZARD_KEY, 'true')

const PAD = 12 // spotlight padding around element

interface SpotRect { top: number; left: number; width: number; height: number }

// ── Instruction building chips ────────────────────────────────────────────────
const CHIPS = [
  { emoji: '🖱️', label: 'Click', template: 'click the "[button]" button' },
  { emoji: '🧭', label: 'Navigate', template: 'navigate to the "[page]" page' },
  { emoji: '✍️', label: 'Type', template: 'type "[text]" into the "[field]" field' },
  { emoji: '📜', label: 'Scroll', template: 'scroll down to the "[section]" section' },
  { emoji: '🔍', label: 'Show', template: 'highlight the "[feature]" feature' },
  { emoji: '⏳', label: 'Wait', template: 'wait for the page to fully load' },
  { emoji: '🔐', label: 'Login', template: 'log in to the account' },
  { emoji: '🎯', label: 'End on', template: 'end the demo on the "[page]" page' },
]

const EXAMPLE_URLS = ['https://trypitch.co', 'https://linear.app', 'https://notion.so', 'https://vercel.com']

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
)
const IconChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)
const IconX = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IconSparkle = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
  </svg>
)

// ── Props ─────────────────────────────────────────────────────────────────────
interface NewVideoWizardProps {
  formValues: Record<string, string>
  onSetUrl: (url: string) => void
  onSetInstructions: (instructions: string) => void
  onDone: () => void
}

// ── Step definitions ──────────────────────────────────────────────────────────
const TOUR_STEPS = [
  { targetId: 'url-input', label: 'Product URL' },
  { targetId: 'instructions-wrapper', label: 'Instructions' },
  { targetId: 'audio-select-wrapper', label: 'Voice' },
  { targetId: 'generate-demo-btn', label: 'Generate' },
]

// ── Main Wizard (spotlight tour) ──────────────────────────────────────────────
export const NewVideoWizard = ({ formValues, onSetUrl, onSetInstructions, onDone }: NewVideoWizardProps) => {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<SpotRect | null>(null)
  const [cardVisible, setCardVisible] = useState(false)

  // Measure the target element and update spotlight rect
  const measure = useCallback(() => {
    const el = document.getElementById(TOUR_STEPS[step].targetId)
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step])

  // On step change: scroll target into view, then measure
  useEffect(() => {
    setCardVisible(false)
    setRect(null)
    const el = document.getElementById(TOUR_STEPS[step].targetId)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const t1 = setTimeout(() => { measure(); }, 300)
    const t2 = setTimeout(() => { measure(); setCardVisible(true) }, 420)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [step, measure])

  // Keep rect updated on resize and scroll
  useEffect(() => {
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [measure])

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const goNext = () => {
    if (step === TOUR_STEPS.length - 1) { markWizardSeen(); onDone(); return }
    setStep(s => s + 1)
  }
  const goBack = () => { if (step > 0) setStep(s => s - 1) }

  const appendInstruction = (template: string) => {
    const cur = formValues.instructions?.trim() || ''
    const next = cur ? `${cur}, then ${template}` : `Go to the site, then ${template}`
    onSetInstructions(next)
  }

  // Spotlight geometry
  const spotTop = rect ? rect.top - PAD : -9999
  const spotLeft = rect ? rect.left - PAD : -9999
  const spotWidth = rect ? rect.width + PAD * 2 : 0
  const spotHeight = rect ? rect.height + PAD * 2 : 0
  const spotBottom = spotTop + spotHeight // used by arrow + tooltip

  // Responsive tooltip sizing
  const vp = typeof window !== 'undefined' ? window.innerHeight : 800
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const tooltipMaxW = Math.min(340, vw - 24)
  const tooltipLeft = rect
    ? Math.max(12, Math.min(rect.left + rect.width / 2 - tooltipMaxW / 2, vw - tooltipMaxW - 12))
    : 12

  // Pick side with more room — avoids clipping on mobile
  const spaceBelow = vp - spotBottom - 14
  const spaceAbove = spotTop - 14
  const tooltipBelow = spaceBelow >= spaceAbove

  // Max height tooltip is allowed to grow to (leaves 12px breathing room)
  const tooltipMaxH = Math.min(480, (tooltipBelow ? spaceBelow : spaceAbove) - 12)

  return (
    <>
      {/* ── Single spotlight ring — box-shadow dims everything outside ──────
           One div does it all: the border IS the focus indicator, the
           massive outward box-shadow IS the dark overlay. No strip blocks. */}
      <div style={{
        position: 'fixed',
        top: rect ? spotTop : '50%',
        left: rect ? spotLeft : '50%',
        width: rect ? spotWidth : 0,
        height: rect ? spotHeight : 0,
        borderRadius: 10,
        border: '2px solid rgba(255,255,255,0.9)',
        boxShadow: [
          '0 0 0 3px rgba(255,255,255,0.18)',
          '0 0 0 9999px rgba(0,0,0,0.52)',
        ].join(', '),
        pointerEvents: 'none',
        zIndex: 100,
        opacity: rect ? 1 : 0,
        transition: 'top 0.38s cubic-bezier(0.4,0,0.2,1), left 0.38s cubic-bezier(0.4,0,0.2,1), width 0.38s cubic-bezier(0.4,0,0.2,1), height 0.38s cubic-bezier(0.4,0,0.2,1), opacity 0.2s ease',
      }} />

      {/* ── Arrow ─────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        left: tooltipLeft + tooltipMaxW / 2 - 6,
        top: tooltipBelow ? spotBottom + 6 : spotTop - 18,
        zIndex: 201,
        pointerEvents: 'none',
        opacity: cardVisible ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}>
        <div style={{
          width: 0, height: 0,
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          ...(tooltipBelow
            ? { borderBottom: '8px solid #fff' }
            : { borderTop: '8px solid #fff' }),
        }} />
      </div>

      {/* ── Tooltip card ────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed',
        ...(tooltipBelow
          ? { top: spotBottom + 14 }
          : { bottom: vp - spotTop + 14 }),
        left: tooltipLeft,
        width: tooltipMaxW,
        /* scroll internally so tooltip never clips off-screen */
        maxHeight: tooltipMaxH,
        overflowY: 'auto',
        background: '#fff',
        borderRadius: 16,
        boxShadow: '0 12px 48px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.07)',
        padding: '18px 18px 16px',
        zIndex: 200,
        fontFamily: "'Geist Variable', 'Inter', system-ui, sans-serif",
        opacity: cardVisible ? 1 : 0,
        transform: cardVisible
          ? 'translateY(0) scale(1)'
          : tooltipBelow ? 'translateY(6px) scale(0.98)' : 'translateY(-6px) scale(0.98)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
      }}>
        {/* Header row: step dots + skip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {TOUR_STEPS.map((_, i) => (
              <div key={i} style={{
                width: i === step ? 18 : 6, height: 6, borderRadius: 99,
                background: i < step ? '#111827' : i === step ? '#111827' : '#e5e7eb',
                transition: 'all 0.25s ease',
              }} />
            ))}
          </div>
          <button
            onClick={() => { markWizardSeen(); onDone() }}
            title="Skip tutorial"
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 9px', borderRadius: 99, border: '1px solid #e5e7eb',
              background: 'transparent', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: '#9ca3af',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <IconX /> Skip
          </button>
        </div>

        {/* Step-specific content */}
        {step === 0 && <StepUrl formValues={formValues} onSetUrl={onSetUrl} />}
        {step === 1 && <StepInstructions formValues={formValues} onAppend={appendInstruction} />}
        {step === 2 && <StepVoice />}
        {step === 3 && <StepGenerate />}

        {/* Footer nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
          {step > 0 && (
            <button
              onClick={goBack}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 14px', borderRadius: 9, border: '1px solid #e5e7eb',
                background: '#fff', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, color: '#374151',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f9fafb'}
              onMouseLeave={e => e.currentTarget.style.background = '#fff'}
            >
              <IconChevronLeft /> Back
            </button>
          )}
          <button
            onClick={goNext}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 9, border: 'none',
              background: 'linear-gradient(135deg, #111827, #374151)',
              cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {step === TOUR_STEPS.length - 1 ? (
              <><IconSparkle /> Finish Tour</>
            ) : (
              <>Next <IconChevronRight /></>
            )}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Step 1: URL ───────────────────────────────────────────────────────────────
const StepUrl = ({ formValues, onSetUrl }: { formValues: Record<string, string>; onSetUrl: (u: string) => void }) => (
  <div>
    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: '#111827' }}>
      🔗 Where should the agent start?
    </p>
    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b7280', lineHeight: 1.55 }}>
      Enter the URL of the page you want to showcase — your homepage, dashboard, or any feature page.
    </p>
    <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      Try an example →
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {EXAMPLE_URLS.map(u => (
        <button
          key={u}
          onClick={() => onSetUrl(u)}
          style={{
            padding: '4px 10px', borderRadius: 99,
            border: '1px solid #e5e7eb',
            background: formValues.url === u ? '#111827' : '#f9fafb',
            color: formValues.url === u ? '#fff' : '#374151',
            fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
          }}
          onMouseEnter={e => { if (formValues.url !== u) e.currentTarget.style.background = '#f3f4f6' }}
          onMouseLeave={e => { if (formValues.url !== u) e.currentTarget.style.background = '#f9fafb' }}
        >
          {u.replace('https://', '')}
        </button>
      ))}
    </div>
    {formValues.url && (
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
        ✓ URL set — click Next when ready
      </p>
    )}
  </div>
)

// ── Step 2: Instructions ──────────────────────────────────────────────────────
const StepInstructions = ({ formValues, onAppend }: { formValues: Record<string, string>; onAppend: (t: string) => void }) => (
  <div>
    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: '#111827' }}>
      ✍️ Describe every step in detail
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
      <div style={{ padding: '8px 10px', borderRadius: 8, background: '#fff1f2', border: '1px solid #fecdd3' }}>
        <p style={{ margin: '0 0 3px', fontSize: 9, fontWeight: 800, color: '#e11d48', textTransform: 'uppercase', letterSpacing: '0.05em' }}>❌ Too vague</p>
        <p style={{ margin: 0, fontSize: 11, color: '#9f1239', lineHeight: 1.4, fontStyle: 'italic' }}>"Make a demo"</p>
      </div>
      <div style={{ padding: '8px 10px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
      <p style={{ margin: '0 0 3px', fontSize: 9, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>✅ Specific</p>
        <p style={{ margin: 0, fontSize: 11, color: '#166534', lineHeight: 1.4, fontStyle: 'italic' }}>
          "Navigate to the homepage, click the ‘New Video’ button, type your product URL in the URL field, choose a voice from the dropdown, click ‘Generate Demo’, and wait for the video to finish loading"
        </p>
      </div>
    </div>
    <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      Tap to add a step:
    </p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {CHIPS.map(chip => (
        <button
          key={chip.label}
          onClick={() => onAppend(chip.template)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '4px 9px', borderRadius: 99, border: '1px solid #e5e7eb',
            background: '#f9fafb', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: '#374151', transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#111827'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#111827' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.borderColor = '#e5e7eb' }}
        >
          <span style={{ fontSize: 12 }}>{chip.emoji}</span>{chip.label}
        </button>
      ))}
    </div>
    {formValues.instructions && (
      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#16a34a', fontWeight: 600 }}>
        ✓ Replace [brackets] with actual names from your site
      </p>
    )}
  </div>
)

// ── Step 3: Voice ─────────────────────────────────────────────────────────────
const StepVoice = () => (
  <div>
    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: '#111827' }}>
      🎙️ Pick an AI voice (optional)
    </p>
    <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6b7280', lineHeight: 1.55 }}>
      The AI will narrate your video automatically. Pick a voice that fits your brand — or leave it and the AI will choose for you.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {[
        ['Orus', 'Deep, professional'],
        ['Charon', 'Clear, conversational'],
        ['Fenrir', 'Dynamic, excitable'],
        ['Puck', 'Upbeat, energetic'],
      ].map(([name, desc]) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, width: 52, fontWeight: 700, color: '#374151', flexShrink: 0 }}>{name}</span>
          <span style={{ fontSize: 11, color: '#9ca3af' }}>{desc}</span>
        </div>
      ))}
    </div>
  </div>
)

// ── Step 4: Generate ──────────────────────────────────────────────────────────
const StepGenerate = () => (
  <div>
    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 800, color: '#111827' }}>
      🚀 You're all set!
    </p>
    <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6b7280', lineHeight: 1.55 }}>
      Click <strong>Generate Demo</strong> to launch the AI agent. It will open a browser, follow your instructions, and return a polished video.
    </p>
    <div style={{ padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10 }}>
      <p style={{ margin: 0, fontSize: 11, color: '#78350f', lineHeight: 1.5 }}>
        💡 Generation takes 2–5 minutes. You'll see live progress on your dashboard.
      </p>
    </div>
  </div>
)
