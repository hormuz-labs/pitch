/**
 * MCP tools over projects (API-key authenticated): create, prompt, read,
 * list, credits. A project is the same thing the app shows — an agent
 * conversation with a preview — so an MCP client can drive the whole
 * studio.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as db from '@saas/db'
import { createLogger } from '@saas/shared'
import { z } from 'zod'
import {
  createFromApi,
  exportFromApi,
  exportStatusFromApi,
  getFromApi,
  listFromApi,
  pricing,
  promptFromApi,
  uploadSchema,
} from '../lib/public-api.js'
import { InsufficientCreditsError } from '../projects/service.js'

const logger = createLogger('studio:mcp')

type ToolTextResult = { isError?: boolean; content: { type: 'text'; text: string }[] }
const jsonResult = (value: unknown): ToolTextResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
})
const errorResult = (error: unknown): ToolTextResult => {
  if (error instanceof InsufficientCreditsError || (error as any)?.status === 402) {
    const balance = typeof (error as any)?.balance === 'number' ? (error as any).balance : undefined
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text:
            balance === undefined
              ? 'Insufficient credits. Buy more at https://trypitch.co/pricing, then retry.'
              : `Insufficient credits: your current balance is ${balance}. Buy more at https://trypitch.co/pricing, then retry.`,
        },
      ],
    }
  }
  return {
    isError: true,
    content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }],
  }
}

export const buildMcpServer = (userId: string): McpServer => {
  const server = new McpServer({ name: 'pitch', version: '2.0.0' })

  server.registerTool(
    'create_project',
    {
      description:
        'Start a studio project. The agent chooses the tools needed from the prompt and files. Work is usage-metered; poll get_project for outputs.',
      inputSchema: {
        flow: z
          .enum(['launch-video', 'demo-video', 'deck', 'recording-edit'])
          .optional()
          .describe('Deprecated compatibility hint; accepted but ignored'),
        prompt: z
          .string()
          .default('')
          .describe('What to make: the product URL and brief, the topic, the instructions…'),
        options: z
          .record(z.string(), z.any())
          .optional()
          .describe(
            'Flow options: launch-video {resolution 720p|1080p|4k, narration, music}; demo-video {url, voice, script, background, shape, browserHeader, fps 30|60}; deck {slideCount, template, mode recreate|preserve}; recording-edit {productName, productUrl, fps 30|60}',
          ),
        uploads: z
          .array(uploadSchema)
          .optional()
          .describe(
            'Files as base64: PDFs/images (demo-video assets), a PDF/PPTX (deck enhance), a video (recording-edit)',
          ),
      },
    },
    async input => {
      try {
        return jsonResult(await createFromApi(userId, input))
      } catch (error) {
        logger.error({ err: error, userId }, 'MCP create_project failed')
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'prompt_project',
    {
      description:
        "Send a usage-metered follow-up message to a project's agent. Returns the project; the agent works asynchronously.",
      inputSchema: {
        projectId: z.string(),
        text: z.string(),
        scene: z.string().optional().describe('Scope to a scene/shot id'),
        slide: z.number().int().optional().describe('Scope to a slide (1-based)'),
        delivery: z
          .enum(['queue', 'steer'])
          .optional()
          .describe('Queue behind active work (default), or steer the active run'),
      },
    },
    async ({ projectId, text, scene, slide, delivery }) => {
      try {
        return jsonResult(
          await promptFromApi(userId, projectId, text, {
            scene: scene ?? null,
            slide: slide ?? null,
            delivery,
          }),
        )
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'get_project',
    {
      description: 'Read a project: status, outputs (video/pdf URLs), scenes/slides, share URL.',
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => {
      try {
        return jsonResult(await getFromApi(userId, projectId))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'list_projects',
    {
      description: "List the API key owner's projects, newest first.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ limit }) => {
      try {
        return jsonResult(await listFromApi(userId, limit ?? 50))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'export_project',
    {
      description: 'Start an export on the worker that owns the project.',
      inputSchema: {
        projectId: z.string(),
        res: z.enum(['720p', '1080p', '4k']).optional(),
      },
    },
    async ({ projectId, res }) => {
      try {
        return jsonResult(await exportFromApi(userId, projectId, { ...(res ? { res } : {}) }))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'export_status',
    {
      description: 'Read the current export status without starting work.',
      inputSchema: { projectId: z.string() },
    },
    async ({ projectId }) => {
      try {
        return jsonResult(await exportStatusFromApi(userId, projectId))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'get_credits',
    { description: 'Credit balance, subscription and recent transactions.' },
    async () => {
      try {
        return jsonResult(await db.getCreditSummary(userId))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'get_pricing',
    { description: 'How model and host-compute usage is converted to credits.' },
    async () => jsonResult(pricing()),
  )

  return server
}
