import { createServer } from 'node:http';
export function createHttpServer() {
  return createServer(({ url }, response) => {
    const healthy = url === '/health';
    response.writeHead(healthy ? 200 : 404, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(healthy ? { status: 'ok' } : { error: 'Not found' }));
  });
}
