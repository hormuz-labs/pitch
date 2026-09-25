import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createLogger } from '@saas/shared'
import cors from 'cors'
import express, { Router } from 'express'
import { buildMcpServer } from '../mcp/server.js'
import { requireApiKey } from '../middleware/auth.js'

const logger = createLogger('studio:mcp')

export const router = Router()
router.use(cors({ origin: true }))
router.use(express.json({ limit: '750mb' }))

// Stateless Streamable HTTP: a fresh McpServer + transport per request, closed
// when the response closes. Authenticated by API key, never by Clerk.
router.post('/', async (req, res) => {
  // Inside the try: requireApiKey hits the database, and an async throw out of
  // an Express 4 handler is not caught anywhere, so a DB failure used to hang
  // the request rather than answer it.
  try {
    const userId = await requireApiKey(req, res)
    if (!userId) return

    const server = buildMcpServer(userId)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      transport.close()
      server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  } catch (error) {
    logger.error({ err: error }, 'MCP request failed')
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' })
    }
  }
})

// Stateless mode has no persistent session or SSE stream to read/terminate.
router.get('/', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed' })
})

router.delete('/', (_req, res) => {
  res.status(405).json({ error: 'Method not allowed' })
})

router.use((error: any, _req: any, res: any, _next: any) => {
  const tooLarge = error?.type === 'entity.too.large' || error?.status === 413
  res.status(tooLarge ? 413 : 400).json({
    jsonrpc: '2.0',
    id: null,
    error: {
      code: tooLarge ? -32000 : -32700,
      message: tooLarge ? 'Request body is too large' : 'Parse error',
    },
  })
})
