import * as db from '@saas/db'

/**
 * Exports carry the watermark unless the account is on a Pro or Max plan. A
 * subscription counts while it is active and, once cancelled, until the end of
 * the period already paid for; after that the watermark returns. Flex credits
 * do not count on their own: they can only be bought on an active plan, and
 * credits left over after the plan ends do not keep exports clean.
 */
export async function shouldWatermarkVideo(userId: string, now = new Date()): Promise<boolean> {
  const subscription = await db.prisma.subscription.findFirst({
    where: { userId, OR: [{ status: 'active' }, { currentPeriodEnd: { gt: now } }] },
    select: { id: true },
  })
  return !subscription
}
