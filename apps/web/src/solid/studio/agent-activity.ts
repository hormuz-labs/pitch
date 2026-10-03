import type { Entry } from './types'

export type AgentActivity = 'listening' | 'searching' | 'solving'

const lookupTool =
  /(?:^|_)(?:read|find|grep|ls|search|fetch|scrape|probe|inspect|list|research|recon)(?:_|$)/
const lookupCommand =
  /(?:^|[;&|]\s*|\bbash\s*·\s*)(?:pitch\s+[\w-]+\s+(?:search|show|families|recon|probe(?:-video)?|inspect-frames|scrape-images)\b|(?:rg|grep|find|ls|cat)\s)/

export function agentActivity(entries: Entry[], busy: boolean): AgentActivity | null {
  // Queued follow-ups must not obscure the work happening in the current turn.
  const active = entries.filter(entry => !entry.pending)
  const lastPrompt = active.findLastIndex(entry => entry.role === 'user')
  const turn = active.slice(lastPrompt + 1)
  const waiting = turn.some(entry => entry.role === 'question' && entry.ask)
  if (!busy) return waiting ? 'listening' : null

  const running = turn.filter(entry => entry.role === 'tool' && entry.tool?.status === 'running')
  if (
    running.some(
      entry =>
        lookupTool.test(entry.tool!.name) ||
        (entry.tool!.name === 'bash' && lookupCommand.test(entry.text)),
    )
  )
    return 'searching'
  if (running.some(entry => entry.tool!.name !== 'ask_user')) return 'solving'
  if (waiting || !turn.length) return 'listening'
  return 'solving'
}
