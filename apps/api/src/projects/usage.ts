/**
 * Usage billing.
 *
 * Projects used to be priced by flow, up front: nine credits for a launch
 * film whether it took one turn or twenty. With one agent there is no flow to
 * price, and the old scheme was wrong anyway — it charged the same for "make
 * me a launch film" and "turn the music down".
 *
 * So the studio meters what actually costs money and bills that:
 *
 *   model spend   what the agent's tokens cost, reported per message by pi
 *   host compute  wall clock in host actions — encoding, recording, rendering
 *
 * Cost accrues in dollars on the project row and is drawn down in whole
 * credits as it crosses each boundary, so a cheap turn is not rounded up to a
 * credit and twenty cheap turns still add up to the right number.
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { takeComputeSeconds } from '../studio/host-actions.js'
import { type ProjectRow, workspaceOf } from './service.js'

const logger = createLogger('studio:usage')

/** What one credit buys, in measured cost. A demo video runs about 120 credits. */
export const CREDIT_USD = 0.0025

/**
 * Host compute, per second. A studio machine that can encode 4K and drive a
 * browser is the expensive part of a render; the rate is deliberately coarse
 * because the point is that long renders cost more than short ones.
 */
export const COMPUTE_USD_PER_SEC = 0.002

/** A turn cannot start unless the user can pay for a meaningful slice of it. */
export const MIN_BALANCE = 40

export interface TurnUsage {
  modelUsd: number
  computeSeconds: number
}

export function usageUsd({ modelUsd, computeSeconds }: TurnUsage): number {
  return Math.max(0, modelUsd) + Math.max(0, computeSeconds) * COMPUTE_USD_PER_SEC
}

/** Credits owed once `usd` of cost has accrued and `charged` are already billed. */
export function creditsOwed(usd: number, charged: number): number {
  return Math.max(0, Math.floor(usd / CREDIT_USD) - charged)
}

/**
 * Bill a finished turn. Returns the credits deducted, which is usually zero:
 * most turns cost a few cents and only move the running total.
 */
export async function chargeTurn(
  p: ProjectRow,
  modelUsd: number,
  channel: 'product' | 'api' | 'discord' = p.source === 'api' ? 'api' : 'product',
): Promise<number> {
  const computeSeconds = takeComputeSeconds(workspaceOf(p).internal)
  const usd = usageUsd({ modelUsd, computeSeconds })
  if (usd <= 0) return 0

  const row = await db.prisma.project
    .findUnique({ where: { id: p.id }, select: { usageUsd: true, creditsCharged: true } })
    .catch(() => null)
  if (!row) return 0

  const total = row.usageUsd + usd
  const owed = creditsOwed(total, row.creditsCharged)

  await db.prisma.project
    .update({
      where: { id: p.id },
      data: { usageUsd: total, creditsCharged: row.creditsCharged + owed },
    })
    .catch(err => logger.warn({ err, projectId: p.id }, 'could not record usage'))

  if (owed > 0) {
    await db
      .deductCredit(p.userId, owed, `Usage: ${p.title}`, {
        projectId: p.id,
        channel,
      })
      .catch(err => logger.warn({ err, projectId: p.id }, 'usage charge failed'))
    logger.info(
      { projectId: p.id, modelUsd, computeSeconds, totalUsd: total, owed },
      'usage charged',
    )
  }
  return owed
}
