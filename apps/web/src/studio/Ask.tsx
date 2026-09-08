import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Ask } from './client'

/**
 * The agent's question, as a stepper.
 *
 * It began as a card with every question and every option on screen at once,
 * which put a wall of chips above the composer and pushed the conversation
 * off the top of a narrow sidebar. So: **one question at a time**, its
 * options as plain rows — a letter, a label, its hint on the same line — and
 * a confirm step at the end. Answering advances; the steps along the top go
 * back. Three questions cost the thread six lines instead of thirty.
 *
 * A single-choice question advances on the click itself: the click IS the
 * answer, and a Next button after it would be a second click for nothing.
 * A `multi` question collects, so it waits for Next.
 *
 * The answer leaves as an ordinary message ("What kind? → Cinematic"), which
 * is why there is no protocol here: the agent reads its own question and the
 * reply in the same thread.
 */
const LETTERS = 'ABCDEFGH'

export function AskStepper({
  ask,
  disabled,
  onSend,
}: {
  ask: Ask
  disabled: boolean
  onSend: (text: string) => void
}) {
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState<Record<string, string[]>>({})
  const [sent, setSent] = useState(false)
  const locked = sent || disabled
  const questions = ask.questions
  // One past the last question is the confirm step.
  const confirming = step >= questions.length
  const q = questions[step]

  const send = useCallback(
    (text: string) => {
      if (locked) return
      setSent(true)
      onSend(text)
    },
    [locked, onSend],
  )

  const summary = useMemo(
    () =>
      questions
        .filter(x => (picked[x.id] ?? []).length)
        .map(x => `${x.question} → ${(picked[x.id] ?? []).join(', ')}`),
    [picked, questions],
  )

  const choose = useCallback(
    (label: string) => {
      if (locked || !q) return
      if (q.multi) {
        setPicked(p => {
          const cur = p[q.id] ?? []
          return {
            ...p,
            [q.id]: cur.includes(label) ? cur.filter(l => l !== label) : [...cur, label],
          }
        })
        return
      }
      setPicked(p => ({ ...p, [q.id]: [label] }))
      setStep(s => s + 1)
    },
    [locked, q],
  )

  // A, B, C pick; Enter advances or sends; Backspace steps back. The thread
  // is not a form, so this listens on the card itself — typing in the
  // composer must never be swallowed by a question two turns up.
  const onKey = (e: React.KeyboardEvent) => {
    if (locked) return
    if (e.key === 'Enter') {
      e.preventDefault()
      if (confirming) send(summary.join('\n'))
      else if (q?.multi && (picked[q.id] ?? []).length) setStep(s => s + 1)
      return
    }
    if (e.key === 'Backspace' && step > 0) {
      e.preventDefault()
      setStep(s => s - 1)
      return
    }
    const i = LETTERS.indexOf(e.key.toUpperCase())
    if (!confirming && q && i >= 0 && i < q.options.length) {
      e.preventDefault()
      choose(q.options[i].label)
    }
  }

  // Answering the last question lands on confirm; nothing else should steal
  // focus, so the card only takes it while it is still live.
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => {
    if (el && !locked && step === 0) el.focus({ preventScroll: true })
  }, [el, locked, step])

  return (
    <div
      className={`ask${locked ? ' locked' : ''}`}
      ref={setEl}
      tabIndex={locked ? -1 : 0}
      onKeyDown={onKey}
    >
      <div className="ask-steps">
        {questions.map((x, i) => (
          <button
            key={x.id}
            type="button"
            className={`ask-step${i === step ? ' on' : ''}${(picked[x.id] ?? []).length ? ' done' : ''}`}
            disabled={locked || i > step}
            onClick={() => setStep(i)}
            title={x.question}
          >
            {x.id}
          </button>
        ))}
        <button
          type="button"
          className={`ask-step${confirming ? ' on' : ''}`}
          disabled={locked || !summary.length}
          onClick={() => setStep(questions.length)}
        >
          ✓
        </button>
        {ask.intro && !locked && <span className="ask-intro">{ask.intro}</span>}
      </div>

      {confirming ? (
        <>
          <p className="ask-q">{locked ? 'Answered' : 'Send this?'}</p>
          <ul className="ask-summary">
            {summary.map(line => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {!locked && (
            <div className="ask-actions">
              <button type="button" className="ask-send" onClick={() => send(summary.join('\n'))}>
                Send
              </button>
              <button
                type="button"
                className="ask-flat"
                onClick={() => setStep(questions.length - 1)}
              >
                Back
              </button>
            </div>
          )}
        </>
      ) : (
        q && (
          <>
            <p className="ask-q">
              {q.question}
              {q.multi && <span className="ask-any"> · any</span>}
            </p>
            <ul className="ask-list">
              {q.options.map((o, i) => {
                const on = (picked[q.id] ?? []).includes(o.label)
                return (
                  <li key={o.label}>
                    <button
                      type="button"
                      className={`ask-row${on ? ' on' : ''}`}
                      disabled={locked}
                      onClick={() => choose(o.label)}
                    >
                      <span className="ask-key">{LETTERS[i]}</span>
                      <span className="ask-text">{o.label}</span>
                      {o.hint && <span className="ask-hint">{o.hint}</span>}
                    </button>
                  </li>
                )
              })}
            </ul>
            {!locked && (
              <div className="ask-actions">
                {q.multi && (
                  <button
                    type="button"
                    className="ask-send"
                    disabled={!(picked[q.id] ?? []).length}
                    onClick={() => setStep(s => s + 1)}
                  >
                    Next
                  </button>
                )}
                <button
                  type="button"
                  className="ask-flat"
                  onClick={() =>
                    send('You decide — take your own first option for each and get started.')
                  }
                >
                  You decide
                </button>
              </div>
            )}
          </>
        )
      )}
    </div>
  )
}
