import express from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createServer } from './index.js';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const transports = new Map<string, SSEServerTransport>();

app.get('/sse', async (req, res) => {
  console.log('New SSE connection');
  const transport = new SSEServerTransport('/message', res);
  const server = await createServer();
  
  transports.set(transport.sessionId, transport);
  
  res.on('close', () => {
    transports.delete(transport.sessionId);
  });
  
  await server.connect(transport);
});

app.post('/message', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = transports.get(sessionId);
  
  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  
  await transport.handlePostMessage(req, res);
});

app.get('/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Gemini MCP HTTP server running on port ${PORT}`);
});
