/**
 * LandingChatInput — Flash-style chat input for the Pitch landing page.
 * Auto-grow textarea, rotating placeholders, LiquidGlass submit button,
 * and a portal-rendered dropdown to pick the target AI agent.
 *
 * The dropdown is rendered via createPortal so it escapes the card's
 * overflow/stacking context and is never clipped.
 */

import { useAuth } from '@clerk/react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowUp,
  Clapperboard,
  Code2,
  Compass,
  Crosshair,
  MonitorPlay,
  Plus,
  Presentation,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { LiquidGlass } from './LiquidGlass'

// ── Types & data ─────────────────────────────────────────────────────────────

type Agent = 'launch-video' | 'demo-video' | 'pdf-maker'

const AGENTS: { value: Agent; label: string; href: string }[] = [
  { value: 'launch-video', label: 'Launch Video', href: '/new?flow=launch-video' },
  { value: 'demo-video', label: 'Demo Video', href: '/new?flow=demo-video' },
  { value: 'pdf-maker', label: 'PDF Maker', href: '/new?flow=deck' },
]

/** One-click prompt starters shown beneath the composer. */
const SUGGESTIONS: { label: string; agent: Agent; prompt: string }[] = [
  {
    label: 'Launch video',
    agent: 'launch-video',
    prompt: 'Make a 60-second cinematic launch video for https://trypitch.co',
  },
  {
    label: 'Product walkthrough',
    agent: 'demo-video',
    prompt: 'Record a narrated walkthrough of the core flow on https://trypitch.co',
  },
  {
    label: 'Onboarding tour',
    agent: 'demo-video',
    prompt: 'Give a guided tour of the sign-up and onboarding flow on https://trypitch.co',
  },
  {
    label: 'Feature deep-dive',
    agent: 'demo-video',
    prompt: 'Do a focused deep-dive on the main feature of https://trypitch.co',
  },
  {
    label: 'Investor deck',
    agent: 'pdf-maker',
    prompt: 'Create a 10-slide investor pitch deck for https://trypitch.co',
  },
  {
    label: 'API demo',
    agent: 'demo-video',
    prompt: 'Demonstrate the API and developer experience of https://trypitch.co',
  },
]

const PLACEHOLDERS: Record<Agent, string[]> = {
  'launch-video': [
    'Make a 60-second cinematic launch video for https://trypitch.co',
    'Create an upbeat product reveal video for https://trypitch.co',
    'Generate a high-energy launch trailer for https://trypitch.co',
    'Build a fast-paced 45-second launch video for https://trypitch.co',
    'Produce a modern motion graphics launch video for https://trypitch.co',
    'Craft a dynamic SaaS product launch video for https://trypitch.co',
    'Create an Apple-style announcement video for https://trypitch.co',
    'Generate an AI feature release launch video for https://trypitch.co',
  ],
  'demo-video': [
    'Walk through the onboarding and sign-up flow on https://trypitch.co',
    'Record an interactive demo of the dashboard on https://trypitch.co',
    'Demonstrate how to generate your first video on https://trypitch.co',
    'Show a step-by-step tour of the editor on https://trypitch.co',
    'Create a narrated feature walkthrough of https://trypitch.co',
    'Navigate the settings and team invite flow on https://trypitch.co',
    'Record a guided tour of the workspace on https://trypitch.co',
    'Create a customer onboarding product tour for https://trypitch.co',
  ],
  'pdf-maker': [
    'Create a 10-slide seed round investor pitch deck for an AI startup',
    'Make a sleek product one-pager presentation for our enterprise tier',
    'Generate a B2B sales pitch deck with case studies and pricing tables',
    'Build a modern company overview slide deck for our quarterly all-hands',
    'Generate a visually stunning marketing proposal presentation',
    'Design a high-converting product launch pitch deck with metrics',
    'Make a clean customer success deck highlighting ROI and adoption',
    'Create an executive summary presentation for our board meeting',
  ],
}

// ── Icons (lucide) ───────────────────────────────────────────────────────────

const AGENT_ICONS: Record<Agent, typeof Clapperboard> = {
  'launch-video': Clapperboard,
  'demo-video': MonitorPlay,
  'pdf-maker': Presentation,
}

const AgentIcon = ({ agent, size = 14 }: { agent: Agent; size?: number }) => {
  const Icon = AGENT_ICONS[agent]
  return <Icon size={size} strokeWidth={1.75} aria-hidden />
}

const ArrowUpIcon = ({ size = 16 }: { size?: number }) => (
  <ArrowUp size={size} strokeWidth={2.25} aria-hidden />
)

const PlusIcon = () => <Plus size={16} strokeWidth={2} aria-hidden />

const SUGGESTION_ICONS: Record<string, typeof Clapperboard> = {
  'Launch video': Clapperboard,
  'Product walkthrough': MonitorPlay,
  'Onboarding tour': Compass,
  'Feature deep-dive': Crosshair,
  'Investor deck': Presentation,
  'API demo': Code2,
}

const SuggestionIcon = ({ label }: { label: string }) => {
  const Icon = SUGGESTION_ICONS[label] ?? Code2
  return <Icon size={13} strokeWidth={1.75} aria-hidden />
}

const ChevronDownIcon = () => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const CheckIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

// ── Portal dropdown ───────────────────────────────────────────────────────────

interface DropdownMenuProps {
  open: boolean
  triggerRef: React.RefObject<HTMLButtonElement | null>
  agents: typeof AGENTS
  agent: Agent
  onSelect: (v: Agent) => void
}

function DropdownMenu({ open, triggerRef, agents, agent, onSelect }: DropdownMenuProps) {
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (!open || !triggerRef.current) return
    const update = () => setRect(triggerRef.current!.getBoundingClientRect())
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, triggerRef])

  if (!rect) return null

  const menuWidth = Math.min(window.innerWidth - 24, 185)
  // Ensure menu stays within screen bounds on mobile
  const leftPos = Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12))

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    bottom: window.innerHeight - rect.top + 6,
    left: leftPos,
    width: Math.max(rect.width, menuWidth),
    maxWidth: 'calc(100vw - 24px)',
    zIndex: 99999,
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role="listbox"
          aria-label="Select agent"
          initial={{ opacity: 0, y: 6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 4, scale: 0.97 }}
          transition={{ duration: 0.14, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="landing-chat-dropdown-menu"
          style={menuStyle}
        >
          {agents.map(a => (
            <button
              key={a.value}
              role="option"
              aria-selected={a.value === agent}
              type="button"
              id={`landing-chat-option-${a.value}`}
              className={`landing-chat-dropdown-option${a.value === agent ? ' landing-chat-dropdown-option--active' : ''}`}
              onMouseDown={e => {
                e.preventDefault()
                onSelect(a.value)
              }}
            >
              <span className="landing-chat-dropdown-icon">
                <AgentIcon agent={a.value} size={14} />
              </span>
              <span className="landing-chat-dropdown-option-label">{a.label}</span>
              {a.value === agent && (
                <span className="landing-chat-dropdown-check">
                  <CheckIcon />
                </span>
              )}
            </button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export const LandingChatInput = () => {
  const { isSignedIn } = useAuth()
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [agent, setAgent] = useState<Agent>('launch-video')
  const [focused, setFocused] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [displayedText, setDisplayedText] = useState('')
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const typeRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const currentFullText = PLACEHOLDERS[agent][placeholderIndex] ?? PLACEHOLDERS[agent][0]

  // Character-by-character typewriter animation
  useEffect(() => {
    if (input) return

    const typingSpeed = isDeleting ? 16 : 30
    const pauseDuration = 2600

    let timeout: ReturnType<typeof setTimeout>

    if (!isDeleting && displayedText === currentFullText) {
      timeout = setTimeout(() => {
        setIsDeleting(true)
      }, pauseDuration)
    } else if (isDeleting && displayedText === '') {
      setIsDeleting(false)
      setPlaceholderIndex(prev => (prev + 1) % PLACEHOLDERS[agent].length)
    } else {
      timeout = setTimeout(() => {
        setDisplayedText(prev => {
          if (isDeleting) {
            return currentFullText.slice(0, Math.max(0, prev.length - 1))
          } else {
            return currentFullText.slice(0, prev.length + 1)
          }
        })
      }, typingSpeed)
    }

    return () => clearTimeout(timeout)
  }, [agent, currentFullText, displayedText, input, isDeleting])

  // Reset when agent changes
  useEffect(() => {
    setPlaceholderIndex(0)
    setDisplayedText('')
    setIsDeleting(false)
  }, [agent])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (!input) {
      el.style.height = '100%'
      return
    }
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [input])

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        !(e.target as HTMLElement).closest('.landing-chat-dropdown-menu')
      ) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [dropdownOpen])

  const canSend = input.trim().length > 0
  const currentAgent = AGENTS.find(a => a.value === agent)!

  const handleSend = () => {
    const base = currentAgent.href
    const trimmed = input.trim()
    const dest = trimmed
      ? base.includes('?')
        ? `${base}&prompt=${encodeURIComponent(trimmed)}`
        : `${base}?prompt=${encodeURIComponent(trimmed)}`
      : base
    // Signed in → straight into the job/editor flow. Otherwise → sign-up, then
    // Clerk redirects back to that same flow.
    if (isSignedIn) {
      navigate(dest)
    } else {
      navigate(`/sign-up?redirect=${encodeURIComponent(dest)}`)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') setDropdownOpen(false)
  }

  // Stop any in-flight suggestion typing on unmount.
  useEffect(
    () => () => {
      if (typeRef.current) clearInterval(typeRef.current)
    },
    [],
  )

  const handleSuggestion = (s: (typeof SUGGESTIONS)[number]) => {
    if (typeRef.current) clearInterval(typeRef.current)
    setAgent(s.agent)
    setDisplayedText('')
    setIsDeleting(false)
    setInput('')
    textareaRef.current?.focus()

    const full = s.prompt
    let i = 0
    typeRef.current = setInterval(() => {
      i += 1
      setInput(full.slice(0, i))
      if (i >= full.length) {
        if (typeRef.current) clearInterval(typeRef.current)
        typeRef.current = null
        // select the sample URL so the user can type theirs straight over it
        requestAnimationFrame(() => {
          const el = textareaRef.current
          if (!el) return
          const u = full.indexOf('https://')
          if (u >= 0) el.setSelectionRange(u, full.length)
        })
      }
    }, 22)
  }

  return (
    <div className="landing-chat-root">
      <motion.div
        layout
        initial={{ opacity: 0, y: 14, filter: 'blur(4px)' }}
        animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
        transition={{ type: 'spring', stiffness: 400, damping: 36, mass: 0.8 }}
        onClick={e => {
          if (
            e.target === e.currentTarget ||
            (e.target as HTMLElement).dataset.focusTarget === 'true'
          ) {
            textareaRef.current?.focus()
          }
        }}
        className={`landing-chat-card${focused ? ' landing-chat-card--focused' : ''}`}
      >
        <div data-focus-target="true" className="landing-chat-inner">
          {/* Textarea + Animated typewriter placeholder */}
          <div className="landing-chat-textarea-wrap">
            <textarea
              ref={textareaRef}
              value={input}
              rows={1}
              onChange={e => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={handleKeyDown}
              aria-label="AI prompt"
              id="landing-chat-input"
              className="landing-chat-textarea"
              style={{ maxHeight: 160, overflowY: 'auto' }}
            />

            {/* Animated placeholder overlay */}
            {!input && (
              <div
                className="landing-chat-placeholder-overlay"
                aria-hidden="true"
                onClick={() => textareaRef.current?.focus()}
              >
                <span className="landing-chat-placeholder-text">
                  {displayedText}
                  <span className="landing-chat-typing-cursor" aria-hidden="true">
                    |
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Bottom toolbar */}
          <div data-focus-target="true" className="landing-chat-toolbar">
            <button
              type="button"
              className="landing-chat-plus"
              aria-label="Add context"
              onClick={e => {
                e.stopPropagation()
                textareaRef.current?.focus()
              }}
            >
              <PlusIcon />
            </button>

            <div className="landing-chat-toolbar-right" onClick={e => e.stopPropagation()}>
              {/* Mode selector */}
              <button
                ref={triggerRef}
                type="button"
                id="landing-chat-agent-btn"
                aria-haspopup="listbox"
                aria-expanded={dropdownOpen}
                className="landing-chat-dropdown-trigger"
                onClick={() => setDropdownOpen(v => !v)}
              >
                <span className="landing-chat-dropdown-icon">
                  <AgentIcon agent={agent} size={13} />
                </span>
                <span className="landing-chat-dropdown-label">{currentAgent.label}</span>
                <span
                  className={`landing-chat-dropdown-chevron${dropdownOpen ? ' landing-chat-dropdown-chevron--open' : ''}`}
                >
                  <ChevronDownIcon />
                </span>
              </button>

              <DropdownMenu
                open={dropdownOpen}
                triggerRef={triggerRef}
                agents={AGENTS}
                agent={agent}
                onSelect={v => {
                  setAgent(v)
                  setDropdownOpen(false)
                  textareaRef.current?.focus()
                }}
              />

              {/* Submit */}
              <LiquidGlass
                scale={0.28}
                radius="9999px"
                hoverable={canSend}
                dark={true}
                static={!canSend}
                background="#000000"
                className={`landing-chat-submit-glass${canSend ? ' landing-chat-submit-glass--active' : ''}`}
              >
                <button
                  type="button"
                  onClick={handleSend}
                  aria-label={
                    canSend ? 'Send prompt' : isSignedIn ? 'Open the editor' : 'Get started'
                  }
                  id="landing-chat-submit"
                  className={`landing-chat-submit${canSend ? ' landing-chat-submit--active' : ''}`}
                >
                  <ArrowUpIcon size={15} />
                </button>
              </LiquidGlass>
            </div>
          </div>
        </div>
      </motion.div>

      {/* One-click prompt starters */}
      <motion.div
        className="landing-chat-suggestions"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.045, delayChildren: 0.15 } },
        }}
      >
        {SUGGESTIONS.map(s => (
          <motion.button
            key={s.label}
            type="button"
            className="landing-chat-suggestion"
            onClick={() => handleSuggestion(s)}
            variants={{
              hidden: { opacity: 0, y: 6 },
              visible: {
                opacity: 1,
                y: 0,
                transition: { type: 'spring', duration: 0.4, bounce: 0 },
              },
            }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.96 }}
          >
            <SuggestionIcon label={s.label} />
            {s.label}
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}
