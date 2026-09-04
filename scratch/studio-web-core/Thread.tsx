import type { Entry } from './client'

function lastIsQuiet(list: Entry[]): boolean {
  const last = list[list.length - 1]
  if (!last) return true
  if (last.role === 'tool' && last.tool?.status === 'running') return false
  return last.role === 'user' || last.role === 'tool'
}

/** The full agent log: chat bubbles plus thinking / tool-run lines — everything the model does. */
export function Thread({ entries, busy }: { entries: Entry[]; busy: boolean }) {
  return (
    <div className="thread">
      {entries.map(e => {
        if (e.role === 'tool') {
          return (
            <div key={e.id} className={`log-line tool ${e.tool?.status === 'error' ? 'error' : ''}`}>
              <span className="log-icon">{e.tool?.status === 'running' ? <span className="spinner" /> : e.tool?.status === 'error' ? '✕' : '✓'}</span>
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
        return (
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
