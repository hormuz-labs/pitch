import * as db from '@saas/db'

/** Only accounts that have never bought a plan or credit pack receive a watermark. */
export async function shouldWatermarkVideo(userId: string): Promise<boolean> {
  const [subscription, topUp] = await Promise.all([
    db.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      select: { id: true },
    }),
    db.prisma.topUpPurchase.findFirst({
      where: { userId },
      select: { id: true },
    }),
  ])
  return !subscription && !topUp
}
