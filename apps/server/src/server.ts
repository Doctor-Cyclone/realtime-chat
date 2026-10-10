import { WebSocketServer } from 'ws';
import { LIMITS, TIMING } from '@chat/shared';
import { createRoom } from './room.js';
import { attachConnection } from './transport/connection.js';
import { startHeartbeat } from './transport/heartbeat.js';
import { createHttpServer } from './transport/http.js';
import type { ServerOptions } from './types.js';

export type { ServerOptions } from './types.js';

/** Composition root: create isolated state, start listeners and own shutdown. */
export async function createChatServer({
  port = 3001,
  host = '127.0.0.1',
  heartbeatMs = 15000,
  typingExpiryMs = TIMING.typingExpiry,
}: ServerOptions = {}) {
  const http = createHttpServer();
  const wss = new WebSocketServer({ server: http, path: '/ws', maxPayload: LIMITS.frameBytes });
  const room = createRoom(typingExpiryMs);
  const { peers } = room;
  wss.on('connection', (socket) => attachConnection(socket, room));
  const stopHeartbeat = startHeartbeat(peers, heartbeatMs);

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(port, host, () => {
      http.off('error', reject);
      resolve();
    });
  }).catch((error) => {
    stopHeartbeat();
    wss.close();
    throw error;
  });

  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Missing server address');
  const disconnectAll = () => {
    for (const socket of peers.keys()) socket.terminate();
  };
  const close = async () => {
    stopHeartbeat();
    for (const [socket, { joinTimer, typingTimer }] of peers) {
      clearTimeout(joinTimer);
      clearTimeout(typingTimer);
      socket.terminate();
    }
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) =>
      http.close((error) => (error ? reject(error) : resolve())),
    );
  };
  return { port: address.port, disconnectAll, close };
}
