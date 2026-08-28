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
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { LiquidGlass } from './LiquidGlass'

// ── Types & data ─────────────────────────────────────────────────────────────

type Agent = 'launch-video' | 'demo-video' | 'pdf-maker'

const AGENTS: { value: Agent; label: string; href: string }[] = [
  { value: 'launch-video', label: 'Launch Video', href: '/launch-video/new' },
  { value: 'demo-video', label: 'Demo Video', href: '/new' },
  { value: 'pdf-maker', label: 'PDF Maker', href: '/pdf' },
]

const PLACEHOLDERS: Record<Agent, string[]> = {
  'launch-video': [
    'Make a 60-second cinematic launch video for https://my-startup.com',
    'Create an upbeat product reveal video for https://acme.dev',
    'Generate a high-energy launch trailer for https://supermemory.ai',
    'Build a fast-paced 45-second launch video for https://graphify.com',
    'Produce a modern motion graphics launch video for https://unsloth.ai',
    'Craft a dynamic SaaS product launch video for https://app.replit.com',
    'Create an Apple-style announcement video for https://trypitch.co',
    'Generate an AI feature release launch video for https://agentcard.sh',
  ],
  'demo-video': [
    'Walk through the onboarding and signup flow on https://my-app.com',
    'Record an interactive demo of the analytics dashboard at https://dashboard.io',
    'Demonstrate how to add and customize a component on https://ui.shadcn.com',
    'Show a step-by-step checkout and payment flow on https://store.example.com',
    'Create a narrated feature walkthrough of https://agentcard.sh',
    'Navigate our settings and team invite flow with clean cursor zooms on https://acme.io',
    'Record a guided tour of the workspace editor on https://linear.app',
    'Create a customer onboarding product tour for https://notion.so',
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

// ── Professional SVG icons ────────────────────────────────────────────────────

const AgentIcon = ({ agent, size = 14 }: { agent: Agent; size?: number }) => {
  if (agent === 'launch-video') {
    // Clapperboard
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
        <path d="m6.2 5.3 3.1 3.9" />
        <path d="m12.4 3.4 3.1 4" />
        <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
      </svg>
    )
  }
  if (agent === 'demo-video') {
    // Monitor / screen recording
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <polygon points="10 8 16 11 10 14 10 8" />
      </svg>
    )
  }
  // pdf-maker — document with lines
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

const ArrowUpIcon = ({ size = 16 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
)

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
    if (!canSend) return
    const encoded = encodeURIComponent(input.trim())
    const base = currentAgent.href
    const dest = base.includes('?') ? `${base}&prompt=${encoded}` : `${base}?prompt=${encoded}`
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

  return (
    <div className="landing-chat-root">
      <motion.div
        layout
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
            {/* Agent dropdown trigger */}
            <div onClick={e => e.stopPropagation()}>
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
                  <AgentIcon agent={agent} size={14} />
                </span>
                <span className="landing-chat-dropdown-label">{currentAgent.label}</span>
                <span
                  className={`landing-chat-dropdown-chevron${dropdownOpen ? ' landing-chat-dropdown-chevron--open' : ''}`}
                >
                  <ChevronDownIcon />
                </span>
              </button>
            </div>

            {/* Portal dropdown */}
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

            {/* Submit — LiquidGlass */}
            <div onClick={e => e.stopPropagation()}>
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
                  disabled={!canSend}
                  aria-label="Send prompt"
                  id="landing-chat-submit"
                  className={`landing-chat-submit${canSend ? ' landing-chat-submit--active' : ''}`}
                >
                  <ArrowUpIcon size={16} />
                </button>
              </LiquidGlass>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
