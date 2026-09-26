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
 *   model spend     what the agent's tokens cost, reported per message by pi
 *   host compute    wall clock in host actions — encoding, recording, rendering
 *   provider spend  what a host action paid a third party (a generated clip)
 *
 * Each is billed when it happens and never by what might happen: picking a
 * model changes the token price, not the price of the sandbox, and a turn
 * that animates in code pays nothing for video generation it did not call.
 *
 * Cost accrues in dollars on the project row and is drawn down in whole
 * credits as it crosses each boundary, so a cheap turn is not rounded up to a
 * credit and twenty cheap turns still add up to the right number.
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { takeComputeSeconds, takeProviderUsd } from '../studio/host-actions.js'
import { modelCreditMultiplier, platformMargin } from '../studio/model-picker.js'
import { COMPUTE_USD_PER_SEC, CREDIT_USD } from './rates.js'
import { type ProjectRow, workspaceOf } from './rows.js'

export { COMPUTE_USD_PER_SEC, CREDIT_USD }

const logger = createLogger('studio:usage')

/** 250% of model cost (2.5×) for turns that successfully load a provided Pitch skill. */
export const PROVIDED_SKILL_MODEL_MULTIPLIER = 2.5

export function effectiveModelMultiplier(modelMultiplier: number, usedProvidedSkill: boolean) {
  return Math.max(0, modelMultiplier) * (usedProvidedSkill ? PROVIDED_SKILL_MODEL_MULTIPLIER : 1)
}

/**
 * Starting new work (a project, or its first hold) needs this much: the first
 * model step's cost is only known once it returns, and anything the balance
 * cannot cover is written off, so this bounds the write-off. Work already
 * under way is not held to it: it runs until the balance reaches zero.
 */
export const MIN_BALANCE = 40

/**
 * Whether a new message may start a turn. A job whose hold is still pending is
 * under way and keeps going; otherwise there must be something left to spend,
 * or the turn's first step would be written off for free.
 */
export function canStartTurn(available: number, holdPending: boolean): boolean {
  return holdPending || available > 0
}

/** Lowest current customer revenue per credit (Max annual: $768 / 60,000). */
export const MIN_REVENUE_USD_PER_CREDIT = 0.0128

/**
 * Provider spend is passed through near cost rather than at the credit rate:
 * a dollar of it becomes the credits that earn a dollar on the cheapest plan,
 * plus the platform margin. Converted to billable usage so it accrues and is
 * drawn down with everything else.
 */
export const PROVIDER_USAGE_PER_USD = CREDIT_USD / MIN_REVENUE_USD_PER_CREDIT

export interface TurnUsage {
  modelUsd: number
  computeSeconds: number
  providerUsd?: number
}

export function usageUsd(
  { modelUsd, computeSeconds, providerUsd = 0 }: TurnUsage,
  multiplier = 1,
  margin = platformMargin(),
): number {
  return (
    (Math.max(0, modelUsd) * Math.max(0, multiplier) +
      Math.max(0, computeSeconds) * COMPUTE_USD_PER_SEC +
      Math.max(0, providerUsd) * PROVIDER_USAGE_PER_USD) *
    Math.max(1, margin)
  )
}

/** Credits owed once `usd` of cost has accrued and `charged` are already billed. */
export function creditsOwed(usd: number, charged: number): number {
  return Math.max(0, Math.floor(usd / CREDIT_USD) - charged)
}

export function projectedCreditsOwed(
  usageSoFarUsd: number,
  charged: number,
  pending: TurnUsage,
  multiplier = 1,
  margin = platformMargin(),
): number {
  return creditsOwed(usageSoFarUsd + usageUsd(pending, multiplier, margin), charged)
}

/** What the user sees when a turn stops for credits: no rates, multipliers or internals. */
export const CREDIT_LIMIT_MESSAGE =
  'You ran out of credits, so this generation stopped. Top up to keep going.'

export function noLossCredits(billableCostUsd: number): number {
  return Math.ceil(Math.max(0, billableCostUsd) / MIN_REVENUE_USD_PER_CREDIT)
}

const VIDEO_KIND_MULTIPLIERS: Record<string, number> = {
  teaser: 0.65,
  cinematic: 1.25,
  'motion-3d': 1.35,
  'product-walkthrough': 1,
  'full-walkthrough': 1.25,
  'feature-spotlight': 0.9,
  'onboarding-tour': 1.15,
  'how-to': 1.2,
  'sales-demo': 1,
  'generated-video': 1.5,
  'recording-edit': 0.8,
}

export function generationReservationCredits(
  baseCredits: number,
  kind: string,
  durationSeconds: number,
): number {
  const duration = Math.max(10, Math.min(300, durationSeconds)) / 30
  const multiplier = VIDEO_KIND_MULTIPLIERS[kind] ?? 1
  return Math.max(MIN_BALANCE, Math.ceil(baseCredits * duration * multiplier))
}

/**
 * Bill a finished turn. Returns the credits deducted, which is usually zero:
 * most turns cost a few cents and only move the running total.
 *
 * A pending reservation is a hold, not a price: it is settled for exactly what
 * the turn measured, so the held amount is never charged for work not done.
 */
export async function chargeTurn(
  p: ProjectRow,
  modelUsd: number,
  channel: 'product' | 'api' | 'discord' = p.source === 'api' ? 'api' : 'product',
  modelSpec = p.options?.model,
  reservationKey?: string,
  usedProvidedSkill = false,
): Promise<number> {
  const internal = workspaceOf(p).internal
  const computeSeconds = takeComputeSeconds(internal)
  const providerUsd = takeProviderUsd(internal)
  const multiplier = effectiveModelMultiplier(
    modelSpec ? modelCreditMultiplier(modelSpec) : 1,
    usedProvidedSkill,
  )
  const margin = platformMargin()
  const turnUsd = usageUsd({ modelUsd, computeSeconds, providerUsd }, multiplier, margin)

  const reservation = reservationKey ? await db.getCreditReservation(reservationKey) : null
  const pendingReservation = reservation?.status === 'pending'
  if (turnUsd <= 0 && !pendingReservation) return 0

  const row = await db.prisma.project
    .findUnique({ where: { id: p.id }, select: { usageUsd: true, creditsCharged: true } })
    .catch(() => null)
  if (!row) return 0

  const total = row.usageUsd + turnUsd
  const measuredOwed = creditsOwed(total, row.creditsCharged)
  let owed = measuredOwed

  if (reservationKey && pendingReservation) {
    try {
      // The live guard stops a turn once it outruns the balance, but a model
      // call reports its cost only when it returns, so the last step can
      // overshoot: take the balance to zero rather than leave the hold open.
      owed = await db.settleCreditReservation(reservationKey, owed, { capAtAvailable: true })
    } catch (err) {
      logger.warn({ err, projectId: p.id }, 'reservation settlement failed')
      return 0
    }
  } else if (owed > 0) {
    try {
      owed = await db.deductUpTo(p.userId, owed, `Usage: ${p.title}`, {
        projectId: p.id,
        channel,
      })
    } catch (err) {
      logger.warn({ err, projectId: p.id }, 'usage charge failed')
      return 0
    }
  }

  await db.prisma.project
    .update({
      where: { id: p.id },
      // An overshoot the balance could not cover is written off, not carried
      // into the next turn's catch-up.
      data: { usageUsd: total, creditsCharged: row.creditsCharged + measuredOwed },
    })
    .catch(err => logger.warn({ err, projectId: p.id }, 'could not record usage'))

  if (owed > 0) {
    logger.info(
      {
        projectId: p.id,
        modelSpec,
        multiplier,
        usedProvidedSkill,
        margin,
        modelUsd,
        computeSeconds,
        providerUsd,
        totalUsd: total,
        owed,
      },
      'usage charged',
    )
  }
  return owed
}
