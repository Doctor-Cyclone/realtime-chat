import { WebSocket } from 'ws';
import type { ServerEvent } from '@chat/shared';
import type { Peers } from '../types.js';

export function send(socket: WebSocket, event: ServerEvent) {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(event), (error) => {
    if (error) socket.terminate();
  });
}
export function sendError(
  socket: WebSocket,
  code: string,
  message: string,
  clientMessageId?: string,
) {
  send(socket, {
    type: 'error',
    payload: { code, message, ...(clientMessageId ? { clientMessageId } : {}) },
  });
}
export function createBroadcast(peers: Peers) {
  return (event: ServerEvent) => {
    for (const [socket, { user }] of peers) if (user) send(socket, event);
  };
}
