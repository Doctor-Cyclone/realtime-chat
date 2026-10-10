import type { RawData, WebSocket } from 'ws';
import { isClientEvent, type ClientEvent } from '@chat/shared';
import type { Peer } from '../types.js';
import type { ChatRoom } from '../room.js';
import { sendError } from './events.js';
import { handleJoin } from '../handlers/join.js';
import { handleMessage } from '../handlers/message.js';

function parseEvent(socket: WebSocket, data: RawData, binary: boolean): ClientEvent | null {
  let event: unknown;
  try {
    if (binary) throw new Error('Binary frame');
    event = JSON.parse(data.toString());
  } catch {
    sendError(socket, 'INVALID_JSON', 'Ожидается корректное текстовое JSON-событие.');
    return null;
  }
  if (!isClientEvent(event)) {
    sendError(socket, 'INVALID_EVENT', 'Неизвестное событие или некорректные данные.');
    return null;
  }
  return event;
}

/** Bind one connection's handlers; business logic belongs to event handlers/services. */
export function attachConnection(socket: WebSocket, room: ChatRoom) {
  const { peers, typing, publishUsers } = room;
  const peer: Peer = {
    alive: true,
    joinTimer: setTimeout(() => socket.close(1008, 'Join required'), 10000),
  };
  peers.set(socket, peer);
  socket.on('pong', () => {
    peer.alive = true;
  });
  socket.on('error', () => socket.terminate());
  socket.on('close', () => {
    clearTimeout(peer.joinTimer);
    typing.stop(peer);
    peers.delete(socket);
    if (peer.user) publishUsers();
  });
  socket.on('message', (data, binary) => {
    const event = parseEvent(socket, data, binary);
    if (!event) return;
    if (event.type === 'user:join') {
      handleJoin(socket, peer, event.payload, room);
      return;
    }
    const { user, clientId } = peer;
    if (!user || !clientId) {
      sendError(socket, 'NOT_JOINED', 'Сначала укажите имя.');
      return;
    }
    switch (event.type) {
      case 'message:send':
        handleMessage(socket, peer, { user, clientId }, event.payload, room);
        break;
      case 'typing:start':
        typing.start(peer);
        break;
      case 'typing:stop':
        typing.stop(peer);
        break;
    }
  });
}
