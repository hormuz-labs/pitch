import { WORKER_URL } from '../worker/config.js'

export function browserHostUrl(): string {
  return (process.env.STUDIO_BROWSER_HOST_URL || WORKER_URL).replace(/\/+$/, '')
}

export function demoStreamId(projectId: string, workerId: string, workerEpoch: number): string {
  return `${projectId}.${workerEpoch}.${Buffer.from(workerId).toString('base64url')}`
}

export function parseDemoStreamId(
  streamId: string,
): { projectId: string; workerId: string; workerEpoch: number } | null {
  const match = streamId.match(/^(.+)\.(\d+)\.([A-Za-z0-9_-]+)$/)
  if (!match) return null
  try {
    return {
      projectId: match[1]!,
      workerEpoch: Number(match[2]),
      workerId: Buffer.from(match[3]!, 'base64url').toString(),
    }
  } catch {
    return null
  }
}
