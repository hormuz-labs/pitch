/** In-process event bus: project changes reach every open SSE stream and the admin. */
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
