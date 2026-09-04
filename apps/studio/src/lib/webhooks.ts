/**
 * Outbound webhook delivery without a queue worker: deliveries are attempted
 * in-process with exponential backoff, and any still PENDING in the DB on
 * boot (or after a crash) are picked up by a slow sweep. `webhookQueue`
 * keeps the `.add(name, data, opts)` shape the carried-over routes call.
 */
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'

const logger = createLogger('studio:webhooks')

interface DeliveryData {
  deliveryId: string
  endpointId?: string
  userId: string
  url: string
  secret: string
  payload: any
}

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 5000

async function attempt(data: DeliveryData, n: number): Promise<void> {
  try {
    const result = await db.executeWebhookDelivery(data, n)
    if (result.success) return
    if (n >= MAX_ATTEMPTS) {
      logger.warn({ deliveryId: data.deliveryId, attempts: n }, 'webhook delivery gave up')
      return
    }
  } catch (err) {
    logger.warn({ err, deliveryId: data.deliveryId }, 'webhook delivery threw')
    if (n >= MAX_ATTEMPTS) return
  }
  const delay = BASE_DELAY_MS * 2 ** (n - 1)
  setTimeout(() => void attempt(data, n + 1), delay).unref?.()
}

export const webhookQueue = {
  async add(_name: string, data: DeliveryData, _opts?: unknown): Promise<void> {
    void attempt(data, 1)
  },
}

/** Fan a completed/failed job-shaped record out to the user's endpoints. */
export async function enqueueWebhookDeliveries(job: any): Promise<string[]> {
  return db.dispatchJobWebhooks(job, webhookQueue)
}

/** Retry deliveries left PENDING by a previous process (boot sweep). */
export async function resumePendingWebhooks(): Promise<void> {
  try {
    const pending = await db.prisma.webhookDelivery.findMany({
      where: { status: 'PENDING', attempts: { lt: MAX_ATTEMPTS } },
      take: 200,
    })
    for (const d of pending) {
      const endpoint = d.endpointId
        ? await db.prisma.webhookEndpoint.findUnique({ where: { id: d.endpointId } })
        : null
      if (!endpoint) continue
      void attempt(
        {
          deliveryId: d.id,
          endpointId: d.endpointId ?? undefined,
          userId: d.userId,
          url: endpoint.url,
          secret: endpoint.secret,
          payload: JSON.parse(d.payload as string),
        },
        d.attempts + 1,
      )
    }
  } catch (err) {
    logger.warn({ err }, 'webhook resume sweep failed')
  }
}
