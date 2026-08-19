import { randomUUID } from 'node:crypto'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { extname, join } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { z } from 'zod'
import {
  createDemoVideoJob,
  createEditJob,
  createEnhanceJob,
  createLaunchVideoJob,
  createPdfJob,
  InsufficientCreditsError,
} from '../lib/job-service.js'
import { getProject, listProjects } from '../lib/launch-video/projects.js'

const logger = createLogger('api:mcp')

const ENHANCE_MAX_BYTES = 50 * 1024 * 1024 // 50 MB
const ENHANCE_EXTS = ['.pdf', '.pptx']
const EDIT_MAX_BYTES = 500 * 1024 * 1024 // 500 MB
const EDIT_EXTS = ['.mp4', '.webm', '.mov', '.mkv', '.avi']

/** Project names double as directory names — keep path traversal out. */
function isValidProjectName(name: string): boolean {
  return /^[^/\\]+$/.test(name) && name !== '..' && name !== '.' && !name.startsWith('.')
}

type ToolTextResult = {
  isError?: boolean
  content: { type: 'text'; text: string }[]
}

const jsonResult = (value: unknown): ToolTextResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})

const errorResult = (error: unknown): ToolTextResult => {
  if (error instanceof InsufficientCreditsError) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Insufficient credits: your current balance is ${error.balance}. Buy more at https://trypitch.co/pricing, then retry.`,
        },
      ],
    }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { isError: true, content: [{ type: 'text', text: message }] }
}

/** Decode a base64 upload, validate extension + size, and stage it as a temp
 * file for the job services (which expect a local path, like multer produces). */
const stageUpload = async (
  fileBase64: string,
  fileName: string,
  allowedExts: string[],
  maxBytes: number,
): Promise<string> => {
  const ext = extname(fileName).toLowerCase()
  if (!allowedExts.includes(ext)) {
    throw new Error(`Unsupported file type: ${ext || '(none)'}. Allowed: ${allowedExts.join(', ')}`)
  }
  const buffer = Buffer.from(fileBase64, 'base64')
  if (buffer.length === 0) {
    throw new Error('fileBase64 decoded to an empty file')
  }
  if (buffer.length > maxBytes) {
    throw new Error(
      `File is too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB exceeds the ${maxBytes / 1024 / 1024} MB limit.`,
    )
  }
  const tmpFilePath = join(tmpdir(), `mcp-upload-${randomUUID()}${ext}`)
  await writeFile(tmpFilePath, buffer)
  return tmpFilePath
}

/** Builds a stateless MCP server bound to a single API-key-authenticated user. */
export const buildMcpServer = (userId: string): McpServer => {
  const server = new McpServer({ name: 'pitch-hormuz', version: '1.0.0' })

  server.registerTool(
    'create_demo_video',
    {
      description:
        'Create an AI demo video job for a product URL (costs 3 credits). Returns the created job id and status.',
      inputSchema: {
        url: z.string().url().describe('Product or website URL to demo'),
        instructions: z.string().optional().describe('Free-text guidance for the video'),
        script: z.string().optional().describe('Narration script to use'),
        voice: z.string().optional().describe('Narration voice id'),
        assets: z
          .array(z.string())
          .optional()
          .describe('Asset URLs (PDFs/images) to build the video from'),
      },
    },
    async ({ url, instructions, script, voice, assets }) => {
      try {
        const parameters: Record<string, unknown> = {
          url,
          ...(instructions ? { instructions } : {}),
          ...(script ? { script } : {}),
          ...(voice ? { voice } : {}),
          ...(assets ? { assets } : {}),
        }
        const job = await createDemoVideoJob(userId, parameters)
        return jsonResult({ jobId: job.id, status: job.status })
      } catch (error) {
        logger.error({ err: error, userId }, 'MCP create_demo_video failed')
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'create_pdf',
    {
      description: 'Create a PDF/slides generation job for a topic (costs 1 credit).',
      inputSchema: {
        topic: z.string().describe('Topic of the PDF deck'),
        instructions: z.string().optional().describe('Free-text guidance for the deck'),
      },
    },
    async ({ topic, instructions }) => {
      try {
        const job = await createPdfJob(userId, { topic, ...(instructions ? { instructions } : {}) })
        return jsonResult({ jobId: job.id, status: job.status })
      } catch (error) {
        logger.error({ err: error, userId }, 'MCP create_pdf failed')
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'enhance_presentation',
    {
      description:
        'Enhance an existing PDF/PPTX presentation (costs 1 credit). Provide the file base64-encoded, max 50 MB.',
      inputSchema: {
        fileBase64: z.string().describe('Base64-encoded PDF or PPTX file'),
        fileName: z.string().describe('Original file name, used for the extension (.pdf/.pptx)'),
        mode: z
          .enum(['recreate', 'preserve'])
          .optional()
          .describe('Enhancement mode (default: recreate)'),
        enhancePrompt: z.string().optional().describe('Free-text enhancement instructions'),
        slideCount: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Target number of slides in recreate mode'),
      },
    },
    async ({ fileBase64, fileName, mode, enhancePrompt, slideCount }) => {
      let tmpFilePath: string | undefined
      try {
        tmpFilePath = await stageUpload(fileBase64, fileName, ENHANCE_EXTS, ENHANCE_MAX_BYTES)
        const job = await createEnhanceJob(userId, {
          tmpFilePath,
          originalFileName: fileName,
          mode: mode || 'recreate',
          enhancePrompt: enhancePrompt || 'Enhance and modernize this presentation.',
          slideCount,
        })
        return jsonResult({ jobId: job.id, status: job.status })
      } catch (error) {
        logger.error({ err: error, userId }, 'MCP enhance_presentation failed')
        return errorResult(error)
      } finally {
        if (tmpFilePath) await unlink(tmpFilePath).catch(() => {})
      }
    },
  )

  server.registerTool(
    'edit_recording',
    {
      description:
        'Edit a narrated screen recording into a polished demo video (costs 2 credits). Provide the file base64-encoded, max 500 MB.',
      inputSchema: {
        fileBase64: z.string().describe('Base64-encoded video file'),
        fileName: z
          .string()
          .describe('Original file name, used for the extension (.mp4/.webm/.mov/.mkv/.avi)'),
        productName: z.string().optional().describe('Product name, used on the intro card'),
        productUrl: z.string().optional().describe('Product URL, used on the outro card'),
        instructions: z.string().optional().describe('Extra guidance for the editing agent'),
      },
    },
    async ({ fileBase64, fileName, productName, productUrl, instructions }) => {
      let tmpFilePath: string | undefined
      try {
        tmpFilePath = await stageUpload(fileBase64, fileName, EDIT_EXTS, EDIT_MAX_BYTES)
        const job = await createEditJob(userId, {
          tmpFilePath,
          originalFileName: fileName,
          productName,
          productUrl,
          instructions,
        })
        return jsonResult({ jobId: job.id, status: job.status })
      } catch (error) {
        logger.error({ err: error, userId }, 'MCP edit_recording failed')
        return errorResult(error)
      } finally {
        if (tmpFilePath) await unlink(tmpFilePath).catch(() => {})
      }
    },
  )

  // ---------------------------------------------------------------------------
  // Launch video studio (durable queued job)
  // ---------------------------------------------------------------------------

  server.registerTool(
    'create_launch_video',
    {
      description:
        'Start an AI product launch video project. The agent runs the full html-motion-video ' +
        'workflow end-to-end (recon, direction, storyboard, VO, build, mix, render). ' +
        'Costs 5 credits. Poll get_job by the returned job id to check progress and get the final video URL.',
      inputSchema: {
        name: z
          .string()
          .describe('Project name (unique per user). Used as the project folder name.'),
        prompt: z
          .string()
          .describe('Creative brief: product, audience, tone, length, key messages, etc.'),
        music: z
          .string()
          .optional()
          .describe('Filename of a track from the shared music library (assets/music/<music>)'),
      },
    },
    async ({ name, prompt: userPrompt, music }) => {
      if (!isValidProjectName(name)) {
        return errorResult(
          new Error(
            `Invalid project name: "${name}". Cannot contain / or \\, start with ".", or be "." or "..".`,
          ),
        )
      }

      try {
        const job = await createLaunchVideoJob(userId, name, userPrompt, music)
        return jsonResult({ jobId: job.id, status: job.status })
      } catch (error) {
        logger.error({ err: error, userId, project: name }, 'MCP create_launch_video failed')
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'get_launch_video',
    {
      description:
        'Get a launch video project by name: scenes, duration, and the rendered video URL when ready.',
      inputSchema: {
        name: z.string().describe('Project name'),
      },
    },
    async ({ name }) => {
      if (!isValidProjectName(name)) {
        return errorResult(
          new Error(
            `Invalid project name: "${name}". Cannot contain / or \\, start with ".", or be "." or "..".`,
          ),
        )
      }

      try {
        const project = await getProject(userId, name)
        if (!project) return errorResult(new Error(`Project not found: ${name}`))
        return jsonResult(project)
      } catch (error) {
        logger.error({ err: error, userId, project: name }, 'MCP get_launch_video failed')
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'list_launch_videos',
    {
      description: 'List all launch video projects for the API key owner.',
    },
    async () => {
      try {
        return jsonResult(await listProjects(userId))
      } catch (error) {
        logger.error({ err: error, userId }, 'MCP list_launch_videos failed')
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'get_job',
    {
      description: 'Get a single job by id, scoped to the authenticated API key owner.',
      inputSchema: {
        jobId: z.string().describe('Job id returned by a create_* tool'),
      },
    },
    async ({ jobId }) => {
      try {
        const job = await db.getJob(jobId, { id: userId })
        if (!job) return errorResult(new Error(`Job not found: ${jobId}`))
        return jsonResult(job)
      } catch (error) {
        logger.error({ err: error, jobId, userId }, 'MCP get_job failed')
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'list_jobs',
    {
      description: 'List the API key owner’s jobs, newest first. Optionally filter by type.',
      inputSchema: {
        type: z
          .enum(['video', 'pdf', 'enhance', 'edit-recording'])
          .optional()
          .describe('Filter by job type'),
      },
    },
    async ({ type }) => {
      try {
        const jobs = await db.listJobs({ id: userId })
        const filtered = type
          ? jobs.filter(j => {
              const jobType = j.parameters?.jobType
              return type === 'video'
                ? jobType !== 'pdf' && jobType !== 'enhance' && jobType !== 'edit-recording'
                : jobType === type
            })
          : jobs
        return jsonResult(filtered)
      } catch (error) {
        logger.error({ err: error, userId }, 'MCP list_jobs failed')
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'get_credits',
    {
      description: 'Get the API key owner’s credit balance, subscription, and transactions.',
    },
    async () => {
      try {
        return jsonResult(await db.getCreditSummary(userId))
      } catch (error) {
        logger.error({ err: error, userId }, 'MCP get_credits failed')
        return errorResult(error)
      }
    },
  )

  return server
}
