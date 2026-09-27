import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { handlePlanTrip } from './routes/planTrip';
import { handleSafeWait } from './routes/safeWait';
import { handleSuggestStops } from './routes/suggestStops';
import { sendJson } from './utils/http';

const port = Number(process.env.PORT ?? 4000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean),
);

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse<IncomingMessage>,
): Promise<void> {
  const origin = request.headers.origin;
  const originAllowed = origin !== undefined && allowedOrigins.has(origin);

  response.setHeader('Vary', 'Origin');
  if (originAllowed) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    response.setHeader('Access-Control-Max-Age', '600');
  }

  if (request.method === 'OPTIONS') {
    if (origin !== undefined && !originAllowed) {
      sendJson(response, 403, { error: 'Origin is not allowed.' });
      return;
    }
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && request.url === '/health') {
    sendJson(response, 200, { status: 'ok', service: 'routewise-backend' });
    return;
  }

  if (request.method === 'POST' && request.url === '/api/suggest-stops') {
    await handleSuggestStops(request, response);
    return;
  }

  if (request.method === 'POST' && request.url === '/api/plan-trip') {
    await handlePlanTrip(request, response);
    return;
  }

  if (request.method === 'POST' && request.url === '/api/safe-wait') {
    await handleSafeWait(request, response);
    return;
  }

  sendJson(response, 404, { error: 'Not found' });
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch(error => {
    console.error('Unhandled request error:', error);
    if (response.headersSent) {
      response.destroy();
      return;
    }
    sendJson(response, 500, { error: 'Internal server error.' });
  });
});

server.listen(port, () => {
  console.log(`RouteWise backend listening at http://localhost:${port}`);
});