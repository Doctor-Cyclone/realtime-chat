import type { ChatMessage, ConnectionStatus, OutgoingMessage, User } from '@chat/shared';

/** Small transport interface allows deterministic tests without putting WebSocket in React. */
export interface SocketLike {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  send(data: string): void;
  close(): void;
}
export interface ChatSnapshot {
  status: ConnectionStatus;
  self: User | null;
  users: User[];
  messages: ChatMessage[];
  outgoing: OutgoingMessage[];
  typing: User[];
  error: string | null;
}
export interface ClientOptions {
  socketFactory?: (url: string) => SocketLike;
  clientId?: string;
  ackMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
  random?: () => number;
}
