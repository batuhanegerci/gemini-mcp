/**
 * MCP HTTP Server for Gemini (Railway-compatible)
 *
 * Uses SSE (Server-Sent Events) transport over HTTP so the server
 * can run as a hosted service on Railway (or any cloud platform).
 *
 * Claude.ai custom connector URL: https://<your-railway-url>/sse
 */

import express from 'express'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'

// Import tools
import { getEnabledToolGroups, TOOL_GROUPS } from './tools/tool-groups.js'
import { registerQueryTool } from './tools/query.js'
import { registerBrainstormTool } from './tools/brainstorm.js'
import { registerAnalyzeTool } from './tools/analyze.js'
import { registerSummarizeTool } from './tools/summarize.js'
import { registerImageGenTool } from './tools/image-gen.js'
import { registerImageEditTool } from './tools/image-edit.js'
import { registerVideoGenTool } from './tools/video-gen.js'
import { registerCodeExecTool } from './tools/code-exec.js'
import { registerSearchTool } from './tools/search.js'
import { registerStructuredTool } from './tools/structured.js'
import { registerYouTubeTool } from './tools/youtube.js'
import { registerDocumentTool } from './tools/document.js'
import { registerUrlContextTool } from './tools/url-context.js'
import { registerCacheTool } from './tools/cache.js'
import { registerSpeechTool } from './tools/speech.js'
import { registerTokenCountTool } from './tools/token-count.js'
import { registerDeepResearchTool } from './tools/deep-research.js'
import { registerImageAnalyzeTool } from './tools/image-analyze.js'

import { initGeminiClient } from './gemini-client.js'
import { setupLogger, logger } from './utils/logger.js'

// ─── Setup ───────────────────────────────────────────────────────────────────

setupLogger('normal')

if (!process.env.GEMINI_API_KEY) {
  console.error('Error: GEMINI_API_KEY environment variable is required')
  process.exit(1)
}

const PORT = parseInt(process.env.PORT || '3000', 10)

// ─── MCP server factory ───────────────────────────────────────────────────────

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'Gemini',
    version: '0.8.1',
  })

  const toolRegistrations: Record<string, (server: McpServer) => void> = {
    query: registerQueryTool,
    brainstorm: registerBrainstormTool,
    analyze: registerAnalyzeTool,
    summarize: registerSummarizeTool,
    'image-gen': registerImageGenTool,
    'image-edit': registerImageEditTool,
    'video-gen': registerVideoGenTool,
    'code-exec': registerCodeExecTool,
    search: registerSearchTool,
    structured: registerStructuredTool,
    youtube: registerYouTubeTool,
    document: registerDocumentTool,
    'url-context': registerUrlContextTool,
    cache: registerCacheTool,
    speech: registerSpeechTool,
    'token-count': registerTokenCountTool,
    'deep-research': registerDeepResearchTool,
    'image-analyze': registerImageAnalyzeTool,
  }

  const enabledGroups = getEnabledToolGroups()
  logger.info(`Loading ${enabledGroups.size} of ${Object.keys(TOOL_GROUPS).length} tool groups`)

  for (const [groupId, registerFn] of Object.entries(toolRegistrations)) {
    if (enabledGroups.has(groupId)) {
      registerFn(server)
    }
  }

  return server
}

// ─── Express app ──────────────────────────────────────────────────────────────

async function main() {
  await initGeminiClient()
  logger.info('Gemini client initialized')

  const app = express()

  // In-memory transport store (one per SSE connection)
  const transports: Record<string, SSEServerTransport> = {}

  // Health check — Railway uses this
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'gemini-mcp' })
  })

  // SSE endpoint — Claude connects here
  app.get('/sse', async (req, res) => {
    logger.info(`SSE connection opened from ${req.ip}`)

    const transport = new SSEServerTransport('/messages', res)
    transports[transport.sessionId] = transport

    res.on('close', () => {
      logger.info(`SSE connection closed: ${transport.sessionId}`)
      delete transports[transport.sessionId]
    })

    const server = createMcpServer()
    await server.connect(transport)
  })

  // Message endpoint — Claude posts tool calls here
  app.post('/messages', express.json(), async (req, res) => {
    const sessionId = req.query.sessionId as string
    const transport = transports[sessionId]

    if (!transport) {
      res.status(404).json({ error: `Session not found: ${sessionId}` })
      return
    }

    await transport.handlePostMessage(req, res)
  })

  app.listen(PORT, () => {
    logger.info(`Gemini MCP HTTP server listening on port ${PORT}`)
    logger.info(`SSE endpoint: http://localhost:${PORT}/sse`)
    logger.info(`Health check: http://localhost:${PORT}/health`)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
