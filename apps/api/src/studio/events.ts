/**
 * Project events.
 *
 * The bus is in-process: a worker's session, watcher and host tools emit on
 * it, and every SSE stream attached to that worker reads from it. When the
 * process that wants to say something is not the one holding the project —
 * an API replica marking a project failed, say — publishProjectEvent() also
 * hands the event to a forwarder (worker/client.ts) that delivers it to the
 * owning worker, whose bus is where the browsers are listening.
 */
import { EventEmitter } from 'node:events'

export type StudioEvent = Record<string, any> & { type: string }

const bus = new EventEmitter()
bus.setMaxListeners(0)

export function emitProjectEvent(projectId: string, ev: StudioEvent): void {
  bus.emit(`project:${projectId}`, ev)
}

export function onProjectEvent(projectId: string, listener: (ev: StudioEvent) => void): () => void {
  const key = `project:${projectId}`
  bus.on(key, listener)
  return () => bus.off(key, listener)
}

export function hasProjectListeners(projectId: string): boolean {
  return bus.listenerCount(`project:${projectId}`) > 0
}

type Forwarder = (projectId: string, ev: StudioEvent) => Promise<void>
let forwarder: Forwarder | null = null

/** Installed once by the worker client; delivers events to a remote owner. */
export function setEventForwarder(fn: Forwarder | null): void {
  forwarder = fn
}

/** Emit here, and to the owning worker when that is somebody else. */
export function publishProjectEvent(projectId: string, ev: StudioEvent): void {
  emitProjectEvent(projectId, ev)
  if (forwarder) void forwarder(projectId, ev).catch(() => {})
}
