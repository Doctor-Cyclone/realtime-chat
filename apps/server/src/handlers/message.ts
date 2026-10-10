import type { WebSocket } from 'ws';
import type { ClientEvent, User } from '@chat/shared';
import type { ChatRoom } from '../room.js';
import type { Peer } from '../types.js';
import { send, sendError } from '../transport/events.js';

type MessagePayload = Extract<ClientEvent, { type: 'message:send' }>['payload'];
interface Sender {
  user: User;
  clientId: string;
}
export function handleMessage(
  socket: WebSocket,
  peer: Peer,
  sender: Sender,
  { clientMessageId, text }: MessagePayload,
  { messages, typing, broadcast }: ChatRoom,
) {
  const result = messages.accept({ ...sender, clientMessageId, text });
  if (result.kind === 'conflict') {
    sendError(
      socket,
      'ID_CONFLICT',
      'Этот идентификатор уже использован для другого сообщения.',
      clientMessageId,
    );
    return;
  }
  const { kind, message } = result;
  if (kind === 'new') {
    typing.stop(peer);
    broadcast({ type: 'message:new', payload: message });
  }
  send(socket, { type: 'message:ack', payload: message });
}
