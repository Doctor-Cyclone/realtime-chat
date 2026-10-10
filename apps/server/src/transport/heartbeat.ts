import type { Peers } from '../types.js';
export function startHeartbeat(peers: Peers, intervalMs: number) {
  const timer = setInterval(() => {
    for (const [socket, peer] of peers) {
      const { alive } = peer;
      if (!alive) {
        socket.terminate();
        continue;
      }
      peer.alive = false;
      socket.ping();
    }
  }, intervalMs);
  return () => clearInterval(timer);
}
