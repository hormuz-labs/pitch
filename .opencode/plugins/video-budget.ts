/**
 * video-budget plugin
 *
 * Enforces two hard limits on every opencode session:
 *   - Wall-clock time:  20 minutes (MAX_MINUTES)
 *   - Cumulative cost:  $4.00      (MAX_COST_USD)
 *
 * When either limit is hit the plugin:
 *   1. Denies ALL further tool calls for that session.
 *   2. Injects a notice into the system prompt so the model knows why.
 *
 * Tracking is in-memory per plugin instance (i.e. per opencode process).
 * Sessions that are already over-budget when the process restarts will
 * start fresh — that is acceptable for this use-case.
 */

import type { Plugin } from "@opencode-ai/plugin";

// ── tuneable limits ────────────────────────────────────────────────────────────
const MAX_MINUTES = 20;
const MAX_COST_USD = 4.0;
// ──────────────────────────────────────────────────────────────────────────────

const MAX_MS = MAX_MINUTES * 60 * 1_000;

type SessionBudget = {
  startedAt: number;   // Date.now() when the session first appeared
  cost: number;        // cumulative USD across all assistant messages
  blocked: boolean;    // true once a limit has been breached
};

const sessions = new Map<string, SessionBudget>();

function getOrCreate(sessionID: string): SessionBudget {
  if (!sessions.has(sessionID)) {
    sessions.set(sessionID, { startedAt: Date.now(), cost: 0, blocked: false });
  }
  return sessions.get(sessionID)!;
}

function formatReason(budget: SessionBudget): string {
  const elapsedMin = ((Date.now() - budget.startedAt) / 60_000).toFixed(1);
  const costStr = budget.cost.toFixed(4);

  const reasons: string[] = [];
  if (budget.cost >= MAX_COST_USD) {
    reasons.push(`cost limit reached ($${costStr} >= $${MAX_COST_USD})`);
  }
  if (Date.now() - budget.startedAt >= MAX_MS) {
    reasons.push(`time limit reached (${elapsedMin} min >= ${MAX_MINUTES} min)`);
  }
  return reasons.join(" and ");
}

const plugin: Plugin = async (_input) => {
  return {
    // ── track cost from every assistant message ──────────────────────────────
    async event({ event }) {
      if (event.type !== "message.updated") return;

      const msg = event.properties.info;
      if (msg.role !== "assistant") return;

      const budget = getOrCreate(msg.sessionID);
      if (budget.blocked) return; // already flagged, nothing to update

      // msg.cost is the cumulative cost for this message (all its steps)
      // Add the delta since our last tally — simpler: just keep a running max
      // because opencode re-fires message.updated on each step update.
      // We take the message-level cost as the authoritative number for that
      // message and add it on first "completion" (when time.completed exists).
      if ((msg as any).time?.completed !== undefined) {
        budget.cost += (msg as any).cost ?? 0;
      }

      const now = Date.now();
      const overCost = budget.cost >= MAX_COST_USD;
      const overTime = now - budget.startedAt >= MAX_MS;

      if (overCost || overTime) {
        budget.blocked = true;
        const reason = formatReason(budget);
        console.error(
          `[video-budget] Session ${msg.sessionID} BLOCKED — ${reason}`
        );
      }
    },

    // ── inject budget status into every system prompt ───────────────────────
    async "experimental.chat.system.transform"(_input, output) {
      // We don't have the sessionID here, so we add a generic budget notice.
      // The per-session block is enforced via permission.ask below.
      const lines = [
        `BUDGET POLICY (enforced automatically):`,
        `  • Max wall-clock time per session : ${MAX_MINUTES} minutes`,
        `  • Max cost per session            : $${MAX_COST_USD.toFixed(2)} USD`,
        `Once either limit is reached all tool calls are denied and you must`,
        `stop and inform the user.`,
      ];
      output.system.push(lines.join("\n"));
    },

    // ── deny tool calls once budget is exhausted ────────────────────────────
    async "permission.ask"(input, output) {
      const sessionID = (input as any).sessionID as string | undefined;
      if (!sessionID) return;

      const budget = sessions.get(sessionID);
      if (!budget?.blocked) return;

      // Check again in case time ticked over between event and permission check
      const overTime = Date.now() - budget.startedAt >= MAX_MS;
      const overCost = budget.cost >= MAX_COST_USD;

      if (overTime || overCost) {
        output.status = "deny";
        const reason = formatReason(budget);
        console.error(
          `[video-budget] Denying tool "${(input as any).tool}" — ${reason}`
        );
      }
    },

    // ── add a real-time cost guard before each LLM call ─────────────────────
    async "chat.params"(input, output) {
      const budget = getOrCreate(input.sessionID);

      const overTime = Date.now() - budget.startedAt >= MAX_MS;
      const overCost = budget.cost >= MAX_COST_USD;

      if (overTime || overCost) {
        budget.blocked = true;
        const reason = formatReason(budget);
        // Cap output tokens to 1 to force an almost-free response; the model
        // will see the system prompt instruction to stop.
        output.maxOutputTokens = 1;
        console.error(
          `[video-budget] Capping output tokens for session ${input.sessionID} — ${reason}`
        );
      }
    },
  };
};

export default plugin;
