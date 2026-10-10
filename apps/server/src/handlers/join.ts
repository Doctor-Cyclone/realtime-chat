import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { ClientEvent } from '@chat/shared';
import type { Peer } from '../types.js';
import type { ChatRoom } from '../room.js';
import { send, sendError } from '../transport/events.js';

type JoinPayload = Extract<ClientEvent, { type: 'user:join' }>['payload'];
export function handleJoin(
  socket: WebSocket,
  peer: Peer,
  { nickname, clientId }: JoinPayload,
  { peers, messages, publishUsers }: ChatRoom,
) {
  if (peer.user) {
    sendError(socket, 'ALREADY_JOINED', 'Вы уже вошли в чат.');
    return;
  }
  const user = { id: randomUUID(), nickname: nickname.trim() };
  peer.user = user;
  peer.clientId = clientId;
  clearTimeout(peer.joinTimer);
  send(socket, { type: 'user:join', payload: user });
  send(socket, { type: 'message:history', payload: messages.getHistory() });
  publishUsers();
  for (const { user: typingUser, typingTimer } of peers.values())
    if (typingUser && typingTimer) send(socket, { type: 'typing:start', payload: typingUser });
}
