/**
 * Shared by /v1 and /mcp: the public shape of a project, creation from an
 * API request (base64 uploads staged to object storage), and pricing.
 */
import { LAUNCH_VIDEO_RESOLUTIONS, launchVideoCreditCost } from '@saas/shared'
import * as storage from '@saas/storage'
import { z } from 'zod'
import type { UploadRef } from '../flows/types.js'
import { exportProject, getExport } from '../projects/export.js'
import {
  createProject,
  getProject,
  getRow,
  listProjects,
  type ProjectInfo,
  promptProject,
} from '../projects/service.js'
import { COMPUTE_USD_PER_SEC, CREDIT_USD } from '../projects/usage.js'
import { isFlowId } from '../studio/paths.js'
import {
  EDIT_EXTS,
  EDIT_MAX_BYTES,
  ENHANCE_EXTS,
  ENHANCE_MAX_BYTES,
  stageBase64Upload,
} from './base64-upload.js'

const APP_URL = process.env.APP_URL || 'https://trypitch.co'

export const publicProject = (p: ProjectInfo & { description?: any }) => ({
  id: p.id,
  flow: p.flow,
  title: p.title,
  status: p.status,
  busy: p.busy,
  prompt: p.prompt,
  options: p.options,
  outputs: p.outputs,
  thumbnailUrl: p.thumbnailUrl,
  shareUrl: p.isPublic && p.shareSlug ? `${APP_URL}/d/${p.shareSlug}` : null,
  error: p.lastError,
  scenes: p.description?.scenes ?? undefined,
  slides: p.description?.slides ?? undefined,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
})

export const uploadSchema = z.object({ fileBase64: z.string().min(1), fileName: z.string().min(1) })

export const createSchema = z.object({
  /** Accepted and ignored: there is one agent, and it reads the request. */
  flow: z.enum(['studio', 'launch-video', 'demo-video', 'deck', 'recording-edit']).optional(),
  prompt: z.string().default(''),
  options: z.record(z.string(), z.any()).optional(),
  uploads: z.array(uploadSchema).optional(),
  name: z.string().optional(),
})
export type CreateRequest = z.infer<typeof createSchema>

const ASSET_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp']

async function stageUploads(
  userId: string,
  uploads: z.infer<typeof uploadSchema>[] | undefined,
): Promise<UploadRef[]> {
  if (!uploads?.length) return []
  // One agent, so one allowlist: whatever it can open, it may be handed.
  const exts = [...new Set([...EDIT_EXTS, ...ENHANCE_EXTS, ...ASSET_EXTS])]
  const max = Math.max(EDIT_MAX_BYTES, ENHANCE_MAX_BYTES)
  const out: UploadRef[] = []
  for (const u of uploads) {
    const tmp = await stageBase64Upload(u.fileBase64, u.fileName, exts, max)
    try {
      const url = await storage.uploadFile(tmp, undefined, `pitch/${userId}/uploads`)
      out.push({ url, name: u.fileName, type: '', size: Buffer.byteLength(u.fileBase64, 'base64') })
    } finally {
      const { unlink } = await import('node:fs/promises')
      await unlink(tmp).catch(() => {})
    }
  }
  return out
}

export async function createFromApi(userId: string, body: CreateRequest) {
  const uploads = await stageUploads(userId, body.uploads)
  const project = await createProject(userId, {
    prompt: body.prompt,
    options: body.options ?? {},
    uploads,
    name: body.name,
  })
  return publicProject(project)
}

export async function promptFromApi(
  userId: string,
  id: string,
  text: string,
  opts: {
    targets?: any[]
    scene?: string | null
    slide?: number | null
    delivery?: 'queue' | 'steer'
  } = {},
) {
  const p = await getRow(userId, id)
  await promptProject(p, text, opts)
  return publicProject(await getProject(userId, id))
}

export async function listFromApi(userId: string, flow?: string, limit = 50) {
  const rows = await listProjects(userId, flow && isFlowId(flow) ? flow : undefined)
  return rows.slice(0, limit).map(publicProject)
}

export async function getFromApi(userId: string, id: string) {
  return publicProject(await getProject(userId, id))
}

export function pricing() {
  return {
    model: 'usage',
    creditUsd: CREDIT_USD,
    computeUsdPerSecond: COMPUTE_USD_PER_SEC,
    explanation:
      'Projects are not priced up front. The studio meters what the work costs — the ' +
      "agent's model usage plus the machine time spent recording and rendering — and " +
      `charges one credit per $${CREDIT_USD.toFixed(2)} of it. Asking a question is nearly ` +
      'free; rendering 4K is not.',
    launchVideo: {
      tiers: Object.entries(LAUNCH_VIDEO_RESOLUTIONS).map(([res, t]) => ({
        res,
        credits: t.credits,
        narrated: launchVideoCreditCost(res, true),
        note: 'Indicative: an export is billed on the render time it actually takes.',
      })),
    },
  }
}

/** Kick off (or read) an export: launch videos render an MP4 at `res`; other flows return their latest output. */
export async function exportFromApi(userId: string, id: string, body: Record<string, any> = {}) {
  return exportProject(userId, id, body)
}

export async function exportStatusFromApi(userId: string, id: string) {
  const p = await getRow(userId, id)
  return getExport(p.id)
}
