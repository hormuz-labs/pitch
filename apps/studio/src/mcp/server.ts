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
        'Start a studio project: launch-video (a motion-graphics launch film from a product URL), demo-video (a narrated browser demo of a web app, optionally from uploaded PDFs/images), deck (a slide deck from a topic, or an enhanced version of an uploaded PDF/PPTX), or recording-edit (camera moves and cards over an uploaded screen recording). The first prompt is charged (see get_pricing); every later prompt_project call is free. Returns the project; poll get_project for outputs.',
      inputSchema: {
        flow: z.enum(['launch-video', 'demo-video', 'deck', 'recording-edit']),
        prompt: z
          .string()
          .describe('What to make: the product URL and brief, the topic, the instructions…'),
        options: z
          .record(z.string(), z.any())
          .optional()
          .describe(
            'Flow options: launch-video {resolution 720p|1080p|4k, narration, music}; demo-video {url, voice, script, background, shape, browserHeader}; deck {slideCount, template, mode recreate|preserve}; recording-edit {productName, productUrl}',
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
        "Send a follow-up message to a project's agent (edits, changes, exports). Free. Returns the project; the agent works asynchronously.",
      inputSchema: {
        projectId: z.string(),
        text: z.string(),
        scene: z.string().optional().describe('Scope to a scene/shot id'),
        slide: z.number().int().optional().describe('Scope to a slide (1-based)'),
      },
    },
    async ({ projectId, text, scene, slide }) => {
      try {
        return jsonResult(
          await promptFromApi(userId, projectId, text, {
            scene: scene ?? null,
            slide: slide ?? null,
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
        flow: z.enum(['launch-video', 'demo-video', 'deck', 'recording-edit']).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ flow, limit }) => {
      try {
        return jsonResult(await listFromApi(userId, flow, limit ?? 50))
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
    { description: 'What each project flow costs in credits.' },
    async () => jsonResult(pricing()),
  )

  return server
}
