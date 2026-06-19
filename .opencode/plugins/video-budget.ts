/**
 * video-budget plugin
 *
 * Enforces a hard limit on every opencode session:
 *   - Cumulative cost:  $4.00      (MAX_COST_USD)
 *
 * When the limit is hit the plugin:
 *   1. Denies ALL further tool calls for that session.
 *   2. Injects a notice into the system prompt so the model knows why.
 *
 * Tracking is in-memory per plugin instance (i.e. per opencode process).
 * Sessions that are already over-budget when the process restarts will
 * start fresh — that is acceptable for this use-case.
 */

import type { Plugin } from '@opencode-ai/plugin'

// ── tuneable limits ────────────────────────────────────────────────────────────
const MAX_COST_USD = 4.0
// ──────────────────────────────────────────────────────────────────────────────

type SessionBudget = {
  cost: number // cumulative USD across all assistant messages
  blocked: boolean // true once a limit has been breached
}

const sessions = new Map<string, SessionBudget>()

function getOrCreate(sessionID: string): SessionBudget {
  if (!sessions.has(sessionID)) {
    sessions.set(sessionID, { cost: 0, blocked: false })
  }
  return sessions.get(sessionID)!
}

function formatReason(budget: SessionBudget): string {
  const costStr = budget.cost.toFixed(4)
  return `cost limit reached ($${costStr} >= $${MAX_COST_USD})`
}

const plugin: Plugin = async _input => {
  return {
    // ── track cost from every assistant message ──────────────────────────────
    async event({ event }) {
      if (event.type !== 'message.updated') return

      const msg = event.properties.info
      if (msg.role !== 'assistant') return

      const budget = getOrCreate(msg.sessionID)
      if (budget.blocked) return // already flagged, nothing to update

      // msg.cost is the cumulative cost for this message (all its steps)
      // Add the delta since our last tally — simpler: just keep a running max
      // because opencode re-fires message.updated on each step update.
      // We take the message-level cost as the authoritative number for that
      // message and add it on first "completion" (when time.completed exists).
      if ((msg as any).time?.completed !== undefined) {
        budget.cost += (msg as any).cost ?? 0
      }

      const overCost = budget.cost >= MAX_COST_USD

      if (overCost) {
        budget.blocked = true
        const reason = formatReason(budget)
        console.error(`[video-budget] Session ${msg.sessionID} BLOCKED — ${reason}`)
      }
    },

    // ── inject budget status into every system prompt ───────────────────────
    async 'experimental.chat.system.transform'(_input, output) {
      // We don't have the sessionID here, so we add a generic budget notice.
      // The per-session block is enforced via permission.ask below.
      const lines = [
        `BUDGET POLICY (enforced automatically):`,
        `  • Max cost per session            : $${MAX_COST_USD.toFixed(2)} USD`,
        `Once the limit is reached all tool calls are denied and you must`,
        `stop and inform the user.`,
      ]
      output.system.push(lines.join('\n'))
    },

    // ── deny tool calls once budget is exhausted ────────────────────────────
    async 'permission.ask'(input, output) {
      const sessionID = (input as any).sessionID as string | undefined
      if (!sessionID) return

      const budget = sessions.get(sessionID)
      if (!budget?.blocked) return

      const overCost = budget.cost >= MAX_COST_USD

      if (overCost) {
        output.status = 'deny'
        const reason = formatReason(budget)
        console.error(`[video-budget] Denying tool "${(input as any).tool}" — ${reason}`)
      }
    },

    // ── add a real-time cost guard before each LLM call ─────────────────────
    async 'chat.params'(input, output) {
      const budget = getOrCreate(input.sessionID)

      const overCost = budget.cost >= MAX_COST_USD

      if (overCost) {
        budget.blocked = true
        const reason = formatReason(budget)
        // Cap output tokens to 1 to force an almost-free response; the model
        // will see the system prompt instruction to stop.
        output.maxOutputTokens = 1
        console.error(
          `[video-budget] Capping output tokens for session ${input.sessionID} — ${reason}`,
        )
      }
    },
  }
}

export default plugin
