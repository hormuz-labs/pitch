import { verifyWebhook } from '@clerk/express/webhooks'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import express, { Router } from 'express'

const logger = createLogger('api:clerk-webhooks')

export const router = Router()

/**
 * Remove every database record owned by a deleted Clerk user. Every operation
 * uses deleteMany so replayed Clerk deliveries remain safe and idempotent.
 */
export async function deleteClerkUserData(userId: string) {
  await db.prisma.$transaction(async tx => {
    const affiliate = await tx.affiliate.findUnique({
      where: { userId },
      select: { id: true },
    })

    await tx.webhookDelivery.deleteMany({ where: { userId } })
    await tx.webhookEndpoint.deleteMany({ where: { userId } })
    await tx.browserSession.deleteMany({ where: { userId } })
    await tx.browserProfile.deleteMany({ where: { userId } })
    await tx.apiKey.deleteMany({ where: { userId } })
    await tx.onboardingSurvey.deleteMany({ where: { userId } })

    // Ledger rows reference jobs, subscriptions, and top-ups, so remove them first.
    await tx.creditTransaction.deleteMany({ where: { userId } })
    await tx.job.deleteMany({ where: { userId } })
    await tx.subscription.deleteMany({ where: { userId } })
    await tx.topUpPurchase.deleteMany({ where: { userId } })

    if (affiliate) {
      await tx.affiliateClick.deleteMany({ where: { affiliateId: affiliate.id } })
      await tx.affiliateLead.deleteMany({ where: { affiliateId: affiliate.id } })
      await tx.affiliateConversion.deleteMany({ where: { affiliateId: affiliate.id } })
      await tx.affiliatePayout.deleteMany({ where: { affiliateId: affiliate.id } })
      await tx.affiliate.deleteMany({ where: { id: affiliate.id } })
    }

    // These are Clerk IDs without a UserProfile foreign key. Keep the newsletter
    // row as a suppression record so deleting and recreating an account cannot
    // silently undo an unsubscribe. Only detach the old Clerk identity.
    await tx.affiliateLead.deleteMany({ where: { referredUserId: userId } })
    await tx.affiliateConversion.deleteMany({ where: { referredUserId: userId } })
    await tx.launchVideoProject.deleteMany({ where: { userId } })
    await tx.newsletterSubscriber.updateMany({ where: { userId }, data: { userId: null } })
    await tx.userProfile.deleteMany({ where: { id: userId } })
  })
}

router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  let event
  try {
    event = await verifyWebhook(req)
  } catch (error) {
    logger.warn({ err: error }, 'Rejected Clerk webhook with an invalid signature')
    return res.status(400).send('Invalid webhook signature')
  }

  if (event.type !== 'user.deleted') return res.json({ received: true })

  const userId = event.data.id
  if (!userId) {
    logger.warn('Clerk user.deleted webhook did not include a user ID')
    return res.status(400).json({ error: 'Missing user ID' })
  }

  try {
    await deleteClerkUserData(userId)
    logger.info({ userId }, 'Deleted local data for Clerk user')
    return res.json({ received: true })
  } catch (error) {
    // A 5xx tells Clerk/Svix to retry rather than acknowledging a partial failure.
    logger.error({ err: error, userId }, 'Failed to delete local data for Clerk user')
    return res.status(500).json({ error: 'Failed to delete user data' })
  }
})
