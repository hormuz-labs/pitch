import { createHmac, randomBytes } from 'node:crypto'
import { createLogger } from '@saas/shared'
import {
  createWebhookDelivery,
  listActiveWebhookEndpointsForUser,
  prisma,
  updateWebhookDelivery,
  type WebhookEndpoint,
} from './index.js'

const logger = createLogger('db:webhooks')

export function computeWebhookSignature(
  payloadString: string,
  secret: string,
  timestamp: number,
): string {
  const hmac = createHmac('sha256', secret)
  hmac.update(`${timestamp}.${payloadString}`)
  const sig = hmac.digest('hex')
  return `t=${timestamp},v1=${sig}`
}

export function verifyWebhookSignature(
  payloadString: string,
  signatureHeader: string,
  secret: string,
): boolean {
  try {
    const parts = signatureHeader.split(',')
    const tPart = parts.find(p => p.startsWith('t='))
    const v1Part = parts.find(p => p.startsWith('v1='))
    if (!tPart || !v1Part) return false

    const timestamp = parseInt(tPart.slice(2), 10)
    const signature = v1Part.slice(3)

    const expected = computeWebhookSignature(payloadString, secret, timestamp)
    const expectedSig = expected.split(',v1=')[1]

    return signature === expectedSig
  } catch {
    return false
  }
}

export interface WebhookTarget {
  endpointId?: string
  url: string
  secret: string
  events?: string[]
}

/**
 * Finds all matching webhooks for a completed or failed job and enqueues delivery jobs.
 */
export async function dispatchJobWebhooks(job: any, targetQueue?: any): Promise<string[]> {
  if (!job?.id || !job.userId) return []

  const status = job.status
  let eventType = ''
  if (status === 'COMPLETED') {
    eventType = 'job.completed'
  } else if (status === 'FAILED') {
    eventType = 'job.failed'
  } else {
    return []
  }

  logger.info(
    { jobId: job.id, userId: job.userId, eventType },
    'Checking webhooks for job completion',
  )

  // Get active endpoints registered by user
  let userEndpoints: WebhookEndpoint[] = []
  try {
    userEndpoints = await listActiveWebhookEndpointsForUser(job.userId)
  } catch (err) {
    logger.error({ err, userId: job.userId }, 'Failed to fetch user webhook endpoints')
  }

  const targets: WebhookTarget[] = []

  // Check user endpoints
  for (const ep of userEndpoints) {
    if (ep.events.includes(eventType) || ep.events.includes('*')) {
      targets.push({
        endpointId: ep.id,
        url: ep.url,
        secret: ep.secret,
        events: ep.events,
      })
    }
  }

  // Check per-job parameter override (e.g. parameters.webhookUrl)
  const jobParams = job.parameters || {}
  const jobWebhookUrl = jobParams.webhookUrl || jobParams.webhook_url
  if (jobWebhookUrl && typeof jobWebhookUrl === 'string') {
    const jobSecret =
      jobParams.webhookSecret ||
      jobParams.webhook_secret ||
      `whsec_${randomBytes(16).toString('hex')}`
    if (!targets.some(t => t.url === jobWebhookUrl)) {
      targets.push({
        url: jobWebhookUrl,
        secret: jobSecret,
      })
    }
  }

  if (targets.length === 0) {
    logger.info({ jobId: job.id }, 'No webhook targets found for job')
    return []
  }

  const deliveryIds: string[] = []

  for (const target of targets) {
    const eventId = `evt_${randomBytes(12).toString('hex')}`
    const payload = {
      id: eventId,
      event: eventType,
      createdAt: new Date().toISOString(),
      data: {
        jobId: job.id,
        userId: job.userId,
        status: job.status,
        jobType: jobParams.jobType || 'demo',
        videoUrl: job.videoUrl ?? null,
        rawVideoUrl: job.rawVideoUrl ?? null,
        pdfUrl: job.pdfUrl ?? null,
        audioUrl: job.audioUrl ?? null,
        thumbnailUrl: job.thumbnailUrl ?? null,
        error: job.error ?? null,
        cost: job.cost ?? 0,
        parameters: jobParams,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    }

    try {
      // Idempotency guard: prevent duplicate deliveries for the same job and endpoint/URL
      const existingDelivery = await prisma.webhookDelivery.findFirst({
        where: {
          jobId: job.id,
          event: eventType,
          ...(target.endpointId
            ? { endpointId: target.endpointId }
            : { payload: { contains: target.url } }),
        },
      })

      if (existingDelivery) {
        logger.info(
          { jobId: job.id, url: target.url, deliveryId: existingDelivery.id },
          'Webhook delivery already created for job and target — skipping',
        )
        deliveryIds.push(existingDelivery.id)
        continue
      }

      const delivery = await createWebhookDelivery({
        endpointId: target.endpointId,
        userId: job.userId,
        jobId: job.id,
        event: eventType,
        payload,
        maxAttempts: 5,
      })

      deliveryIds.push(delivery.id)

      if (targetQueue) {
        await targetQueue.add(
          'send-webhook',
          {
            deliveryId: delivery.id,
            endpointId: target.endpointId,
            userId: job.userId,
            url: target.url,
            secret: target.secret,
            payload,
          },
          {
            jobId: delivery.id,
            attempts: 5,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          },
        )
      }

      logger.info(
        { deliveryId: delivery.id, url: target.url, jobId: job.id },
        'Queued webhook delivery',
      )
    } catch (err) {
      logger.error(
        { err, jobId: job.id, url: target.url },
        'Failed to create/enqueue webhook delivery',
      )
    }
  }

  return deliveryIds
}

/**
 * Executes a single webhook delivery attempt over HTTP with HMAC signing and status tracking.
 */
export async function executeWebhookDelivery(
  jobData: {
    deliveryId: string
    endpointId?: string
    userId: string
    url: string
    secret: string
    payload: any
  },
  attemptNumber = 1,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const { deliveryId, url, secret, payload } = jobData
  const payloadString = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = computeWebhookSignature(payloadString, secret, timestamp)

  logger.info({ deliveryId, url, attemptNumber }, `Sending webhook attempt #${attemptNumber}`)

  let statusCode: number | undefined
  let responseText: string | undefined
  let errorMsg: string | undefined

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Pitch-Webhook/1.0',
        'X-Pitch-Event': payload.event || 'job.updated',
        'X-Pitch-Signature': signature,
      },
      body: payloadString,
      signal: AbortSignal.timeout(10000), // 10s timeout
    })

    statusCode = res.status
    try {
      responseText = (await res.text()).slice(0, 1000)
    } catch {
      responseText = ''
    }

    if (res.ok) {
      logger.info(
        { deliveryId, statusCode },
        `Webhook delivery successful on attempt #${attemptNumber}`,
      )
      await updateWebhookDelivery(deliveryId, {
        status: 'SUCCESS',
        statusCode,
        responseBody: responseText,
        error: null,
        attempts: attemptNumber,
        nextRetryAt: null,
      })
      return { success: true, statusCode }
    } else {
      errorMsg = `HTTP ${statusCode}: ${responseText || res.statusText}`
    }
  } catch (err: any) {
    errorMsg = err.message || String(err)
    logger.warn(
      { deliveryId, err: errorMsg, attemptNumber },
      `Webhook delivery attempt #${attemptNumber} failed`,
    )
  }

  // Failed attempt
  const maxAttempts = 5
  const isFinal = attemptNumber >= maxAttempts
  const nextRetryDelayMs = Math.min(5000 * 2 ** (attemptNumber - 1), 300000)
  const nextRetryAt = isFinal ? null : new Date(Date.now() + nextRetryDelayMs)

  await updateWebhookDelivery(deliveryId, {
    status: isFinal ? 'FAILED' : 'PENDING',
    statusCode: statusCode ?? null,
    responseBody: responseText ?? null,
    error: errorMsg,
    attempts: attemptNumber,
    nextRetryAt,
  })

  // Throw so BullMQ retries if not final
  throw new Error(`Webhook delivery failed: ${errorMsg}`)
}
