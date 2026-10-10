import type { ServerEvent } from '@chat/shared';
import type { Peer } from '../types.js';

export function createTypingService(broadcast: (event: ServerEvent) => void, expiryMs: number) {
  function stop(peer: Peer) {
    const { user, typingTimer } = peer;
    if (!typingTimer) return;
    clearTimeout(typingTimer);
    peer.typingTimer = undefined;
    if (user) broadcast({ type: 'typing:stop', payload: user });
  }
  function start(peer: Peer) {
    const { user, typingTimer } = peer;
    if (!user) return;
    // Refresh recipients' defensive expiry during continuous typing.
    broadcast({ type: 'typing:start', payload: user });
    clearTimeout(typingTimer);
    peer.typingTimer = setTimeout(() => stop(peer), expiryMs);
  }
  return { start, stop };
}
