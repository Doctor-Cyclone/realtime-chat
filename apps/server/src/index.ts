import { createChatServer } from './server.js';
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error('PORT must be an integer between 0 and 65535');
const server = await createChatServer({ port, host: process.env.HOST ?? '127.0.0.1' });
console.log(`Chat server: ws://127.0.0.1:${server.port}/ws`);
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void server.close().then(() => process.exit(0));
  });
