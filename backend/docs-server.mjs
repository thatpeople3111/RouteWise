import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

// Keep this documentation process separate from the Next.js frontend.
const port = 3001;
const page = await readFile(new URL('./docs/index.html', import.meta.url));
const server = createServer((request, response) => {
  const path = (request.url ?? '/').split('?')[0];
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end();
    return;
  }
  if (path === '/') {
    response.writeHead(302, { ...headers, Location: '/docs' }).end();
    return;
  }
  if (path === '/docs' || path === '/docs/') {
    response.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    response.end(request.method === 'HEAD' ? undefined : page);
    return;
  }
  if (path === '/health') {
    response.writeHead(200, { ...headers, 'Content-Type': 'application/json' });
    response.end(request.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', service: 'routewise-backend-docs', apiImplemented: false, port }));
    return;
  }
  response.writeHead(404, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(request.method === 'HEAD' ? undefined : 'Not found. Backend API routes are not implemented. Documentation: /docs');
});
server.on('error', error => {
  console.error(error.code === 'EADDRINUSE' ? 'Port 3001 is already in use. Stop the other process on 3001 before starting the docs server.' : error.message);
  process.exitCode = 1;
});
server.listen({ host: 'localhost', port }, () => console.log('RouteWise backend docs: http://localhost:3001/docs'));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
