import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AskStepper } from './Ask'
import type { Entry } from './client'

function lastIsQuiet(list: Entry[]): boolean {
  const last = list[list.length - 1]
  if (!last) return true
  if (last.role === 'tool' && last.tool?.status === 'running') return false
  return last.role === 'user' || last.role === 'tool' || last.role === 'question'
}

/**
 * The agent writes markdown, because that is what agents write. Rendering it
 * as plain text left `**bold**` and `- ` on screen as literal punctuation,
 * which is the model's formatting showing through instead of doing its job.
 *
 * Raw HTML is deliberately NOT enabled: this text comes from a model that has
 * been reading the user's own files and web pages, so it is not trusted markup.
 * react-markdown builds React elements, so there is no innerHTML to escape.
 *
 * The text streams, so it is parsed mid-sentence on every update. Half-written
 * emphasis simply renders as the literal characters until its closing marker
 * arrives — it corrects itself rather than flickering between trees.
 */
function AgentMarkdown({ text }: { text: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        // The sidebar is narrow and resizable; a long URL must not widen it.
        a: ({ children, ...props }) => (
          <a {...props} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        ),
        // GFM tables scroll inside themselves rather than stretching the panel.
        table: ({ children, ...props }) => (
          <div className="md-scroll">
            <table {...props}>{children}</table>
          </div>
        ),
      }}
    >
      {text}
    </Markdown>
  )
}

/** The full agent log: chat bubbles plus thinking / tool-run lines — everything the model does. */
export function Thread({
  entries,
  busy,
  onAnswer,
}: {
  entries: Entry[]
  busy: boolean
  onAnswer?: (text: string) => void
}) {
  // A question stays live until it is answered. The agent usually writes a
  // line after asking, so "is it the last entry" is the wrong test: what ends
  // a question is the USER speaking after it, or a newer question replacing it.
  const openQuestion = [...entries].reverse().find(e => e.role === 'question' || e.role === 'user')
  const live = (e: Entry) => e.id === openQuestion?.id && e.role === 'question'
  return (
    <div className="thread">
      {entries.map(e => {
        if (e.role === 'question') {
          if (!e.ask) return null
          return (
            <AskStepper
              key={e.id}
              ask={e.ask}
              disabled={!onAnswer || busy || !live(e)}
              onSend={t => onAnswer?.(t)}
            />
          )
        }
        if (e.role === 'tool') {
          return (
            <div
              key={e.id}
              className={`log-line tool ${e.tool?.status === 'error' ? 'error' : ''}`}
            >
              <span className="log-icon">
                {e.tool?.status === 'running' ? (
                  <span className="spinner" />
                ) : e.tool?.status === 'error' ? (
                  '✕'
                ) : (
                  '✓'
                )}
              </span>
              <span className="log-text">{e.text}</span>
            </div>
          )
        }
        if (e.role === 'thinking') {
          if (!e.text.trim()) return null
          return (
            <div key={e.id} className="log-line thinking-line">
              <span className="log-icon">∴</span>
              <span className="log-text">{e.text}</span>
            </div>
          )
        }
        if (!e.text.trim()) return null
        // Only the agent's own messages are markdown. What the user typed is
        // shown back exactly as they typed it — asterisks and all.
        return e.role === 'assistant' ? (
          <div key={e.id} className="msg assistant md">
            <AgentMarkdown text={e.text} />
          </div>
        ) : (
          <div key={e.id} className={`msg ${e.role}`}>
            {e.text}
          </div>
        )
      })}
      {busy && lastIsQuiet(entries) && (
        <div className="log-line working">
          <span className="log-icon">
            <span className="spinner" />
          </span>
          <span className="log-text">working…</span>
        </div>
      )}
    </div>
  )
}
