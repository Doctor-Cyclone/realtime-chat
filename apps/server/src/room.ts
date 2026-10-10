import { TIMING } from '@chat/shared';
import type { Peers } from './types.js';
import { createMessageStore } from './store/messageStore.js';
import { createBroadcast } from './transport/events.js';
import { createTypingService } from './services/typing.js';

export function createRoom(typingExpiryMs: number = TIMING.typingExpiry) {
  const peers: Peers = new Map();
  const messages = createMessageStore();
  const broadcast = createBroadcast(peers);
  const typing = createTypingService(broadcast, typingExpiryMs);
  const publishUsers = () =>
    broadcast({
      type: 'users:list',
      payload: [...peers.values()].flatMap(({ user }) => (user ? [user] : [])),
    });
  return { peers, messages, broadcast, typing, publishUsers };
}
export type ChatRoom = ReturnType<typeof createRoom>;
