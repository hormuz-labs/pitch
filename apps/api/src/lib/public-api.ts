/**
 * Shared by /v1 and /mcp: the public shape of a project, creation from an
 * API request (base64 uploads staged to object storage), and pricing.
 */

import { extname } from 'node:path'
import { createLogger } from '@saas/shared'
import * as storage from '@saas/storage'
import { z } from 'zod'
import type { UploadRef } from '../flows/types.js'
import { IDLE_EXPORT } from '../projects/export.js'
import {
  createProject,
  getProject,
  getRow,
  listProjects,
  type ProjectInfo,
  promptProject,
} from '../projects/service.js'
import {
  COMPUTE_USD_PER_SEC,
  CREDIT_USD,
  PROVIDED_SKILL_MODEL_MULTIPLIER,
} from '../projects/usage.js'
import { currentOwner, withOwner } from '../worker/client.js'
import {
  EDIT_EXTS,
  EDIT_MAX_BYTES,
  ENHANCE_EXTS,
  ENHANCE_MAX_BYTES,
  stageBase64Upload,
} from './base64-upload.js'

const APP_URL = process.env.APP_URL || 'https://trypitch.co'
const logger = createLogger('studio:public-api')

export const publicProject = (p: ProjectInfo & { description?: any }) => ({
  id: p.id,
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
  /** Deprecated compatibility hint. There is one agent, and it reads the request. */
  flow: z.enum(['launch-video', 'demo-video', 'deck', 'recording-edit']).optional(),
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
  staged: UploadRef[],
): Promise<UploadRef[]> {
  if (!uploads?.length) return []
  // One agent, so one allowlist: whatever it can open, it may be handed.
  const exts = [...new Set([...EDIT_EXTS, ...ENHANCE_EXTS, ...ASSET_EXTS])]
  const out: UploadRef[] = []
  for (const u of uploads) {
    const max = EDIT_EXTS.includes(extname(u.fileName).toLowerCase())
      ? EDIT_MAX_BYTES
      : ENHANCE_MAX_BYTES
    const tmp = await stageBase64Upload(u.fileBase64, u.fileName, exts, max)
    try {
      const url = await storage.uploadFile(tmp, undefined, `pitch/${userId}/uploads`)
      const upload = {
        url,
        name: u.fileName,
        type: '',
        size: Buffer.byteLength(u.fileBase64, 'base64'),
      }
      out.push(upload)
      staged.push(upload)
    } finally {
      const { unlink } = await import('node:fs/promises')
      await unlink(tmp).catch(() => {})
    }
  }
  return out
}

export async function createFromApi(userId: string, body: CreateRequest) {
  const staged: UploadRef[] = []
  try {
    const uploads = await stageUploads(userId, body.uploads, staged)
    const project = await createProject(userId, {
      prompt: body.prompt,
      options: body.options ?? {},
      uploads,
      name: body.name,
      source: 'api',
    })
    return publicProject(project)
  } catch (error) {
    const cleanup = await Promise.allSettled(staged.map(upload => storage.deleteFile(upload.url)))
    cleanup.forEach((result, index) => {
      if (result.status === 'rejected')
        logger.warn(
          { err: result.reason, userId, url: staged[index]?.url },
          'could not clean staged upload',
        )
    })
    throw error
  }
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

export async function listFromApi(userId: string, limit = 50) {
  const rows = await listProjects(userId)
  return { data: rows.slice(0, limit).map(publicProject), total: rows.length }
}

export async function getFromApi(userId: string, id: string) {
  return publicProject(await getProject(userId, id))
}

export function pricing() {
  return {
    model: 'usage',
    creditUsd: CREDIT_USD,
    computeUsdPerSecond: COMPUTE_USD_PER_SEC,
    providedSkillModelMultiplier: PROVIDED_SKILL_MODEL_MULTIPLIER,
    explanation:
      'Projects are not priced up front. The studio meters what the work costs — the ' +
      "agent's model usage plus the machine time spent recording and rendering. Model usage " +
      `on turns that load a provided Pitch skill is priced at ${PROVIDED_SKILL_MODEL_MULTIPLIER}x; ` +
      'host compute and provider charges are not multiplied. The studio ' +
      `charges one credit per $${CREDIT_USD.toFixed(4)} of it. Reads are free; work-producing ` +
      'turns vary with model usage, enabled skills, and render time.',
  }
}

/** Kick off (or read) an export: launch videos render an MP4 at `res`; other flows return their latest output. */
export async function exportFromApi(userId: string, id: string, body: Record<string, any> = {}) {
  const p = await getRow(userId, id)
  return withOwner(p.id, owner => owner.startExport(p.id, body))
}

export async function exportStatusFromApi(userId: string, id: string) {
  const p = await getRow(userId, id)
  const owner = await currentOwner(p.id)
  return owner ? owner.exportStatus(p.id) : IDLE_EXPORT
}
