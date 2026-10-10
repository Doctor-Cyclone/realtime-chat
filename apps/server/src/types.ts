import type { WebSocket } from 'ws';
import type { User } from '@chat/shared';

export interface Peer {
  user?: User;
  clientId?: string;
  alive: boolean;
  joinTimer: ReturnType<typeof setTimeout>;
  typingTimer?: ReturnType<typeof setTimeout>;
}
export type Peers = Map<WebSocket, Peer>;
export interface ServerOptions {
  port?: number;
  host?: string;
  heartbeatMs?: number;
  typingExpiryMs?: number;
}
