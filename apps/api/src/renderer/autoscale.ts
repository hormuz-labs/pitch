/**
 * The render tier's autoscaler: the API sets the render Deployment's
 * replica count itself.
 *
 * There is one number that moves in this fleet — render pods, one per
 * RenderJob queued or running — and the API already computes it
 * (renderer/queue.ts → renderDemand). Turning that into a replica count
 * through KEDA meant a Helm chart, two custom resources and a metrics
 * adapter for a PATCH on a scale subresource, so the API does the PATCH.
 *
 * Up is immediate: demand above the current count is applied at once.
 * Down waits: the count only drops after RENDER_SCALE_IDLE_MS of demand
 * below it, so a burst does not pay a node boot twice. Every API replica
 * runs this loop; the PATCH is idempotent and each replica's own idle
 * clock starts at its boot, so the effect of several is a slightly more
 * patient scale-down, never a fight.
 *
 * Runs only where it can: in a cluster (KUBERNETES_SERVICE_HOST) with
 * STUDIO_RENDER_SCALE_TARGET naming the Deployment, using the pod's own
 * service account (a Role in infra/gke/render.yaml allows the two verbs).
 */
import { readFileSync } from 'node:fs'
import { createLogger } from '@saas/shared'
import { renderDemand } from './queue.js'

const logger = createLogger('studio:render-scale')

const SA = '/var/run/secrets/kubernetes.io/serviceaccount'

export interface ScaleTarget {
  namespace: string
  name: string
  min: number
  max: number
}

export interface ScaleDecisionInput {
  current: number
  demand: number
  min: number
  max: number
  /** ms since demand last called for at least `current` pods. */
  idleFor: number
  idleMs: number
}

/** Pure: what the count should become, or null to leave it. */
export function decide(i: ScaleDecisionInput): number | null {
  const wanted = Math.max(i.min, Math.min(i.max, i.demand))
  if (wanted > i.current) return wanted
  if (wanted < i.current && i.idleFor >= i.idleMs) return wanted
  return null
}

interface K8s {
  base: string
  token: string
  ca: Buffer
}

function cluster(): K8s | null {
  const host = process.env.KUBERNETES_SERVICE_HOST
  const port = process.env.KUBERNETES_SERVICE_PORT || '443'
  if (!host) return null
  try {
    return {
      base: `https://${host}:${port}`,
      token: readFileSync(`${SA}/token`, 'utf8').trim(),
      ca: readFileSync(`${SA}/ca.crt`),
    }
  } catch {
    return null
  }
}

async function k8sFetch(k: K8s, path: string, init: RequestInit = {}): Promise<Response> {
  // Bun's fetch takes a `tls` option; Node would want an Agent. The image
  // runs bun, and the CA is the cluster's own.
  return fetch(`${k.base}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${k.token}`, ...(init.headers ?? {}) },
    // @ts-expect-error bun-specific
    tls: { ca: k.ca },
  })
}

async function readReplicas(k: K8s, t: ScaleTarget): Promise<number> {
  const res = await k8sFetch(
    k,
    `/apis/apps/v1/namespaces/${t.namespace}/deployments/${t.name}/scale`,
  )
  if (!res.ok) throw new Error(`scale read ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const body = (await res.json()) as { spec?: { replicas?: number } }
  return body.spec?.replicas ?? 0
}

async function writeReplicas(k: K8s, t: ScaleTarget, replicas: number): Promise<void> {
  const res = await k8sFetch(
    k,
    `/apis/apps/v1/namespaces/${t.namespace}/deployments/${t.name}/scale`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/merge-patch+json' },
      body: JSON.stringify({ spec: { replicas } }),
    },
  )
  if (!res.ok) throw new Error(`scale write ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

function targetFromEnv(): ScaleTarget | null {
  const name = (process.env.STUDIO_RENDER_SCALE_TARGET || '').trim()
  if (!name) return null
  let namespace = (process.env.STUDIO_RENDER_SCALE_NAMESPACE || '').trim()
  if (!namespace) {
    try {
      namespace = readFileSync(`${SA}/namespace`, 'utf8').trim()
    } catch {
      namespace = 'default'
    }
  }
  return {
    namespace,
    name,
    min: Math.max(0, Number(process.env.STUDIO_RENDER_SCALE_MIN || 0)),
    max: Math.max(1, Number(process.env.STUDIO_RENDER_SCALE_MAX || 8)),
  }
}

const TICK_MS = Math.max(2000, Number(process.env.STUDIO_RENDER_SCALE_TICK_MS || 10_000))
const IDLE_MS = Math.max(30_000, Number(process.env.STUDIO_RENDER_SCALE_IDLE_MS || 10 * 60_000))

let timer: NodeJS.Timeout | null = null

/** Start the loop if this process is in a cluster and a target is named. */
export function startRenderAutoscaler(): boolean {
  const t = targetFromEnv()
  const k = cluster()
  if (!t || !k) return false
  let busyAt = Date.now()
  let running = false
  const tick = async () => {
    if (running) return
    running = true
    try {
      const [{ queued, running: inFlight }, current] = await Promise.all([
        renderDemand(0, t.max),
        readReplicas(k, t),
      ])
      const demand = queued + inFlight
      const now = Date.now()
      if (demand >= current) busyAt = now
      const next = decide({
        current,
        demand,
        min: t.min,
        max: t.max,
        idleFor: now - busyAt,
        idleMs: IDLE_MS,
      })
      if (next !== null) {
        await writeReplicas(k, t, next)
        busyAt = now
        logger.info({ from: current, to: next, queued, running: inFlight }, 'render tier scaled')
      }
    } catch (err) {
      logger.warn({ err }, 'render autoscale tick failed')
    } finally {
      running = false
    }
  }
  timer = setInterval(() => void tick(), TICK_MS)
  timer.unref()
  void tick()
  logger.info(
    { target: `${t.namespace}/${t.name}`, min: t.min, max: t.max, idleMs: IDLE_MS },
    'render autoscaler started',
  )
  return true
}

export function stopRenderAutoscaler(): void {
  if (timer) clearInterval(timer)
  timer = null
}
