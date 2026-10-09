/** Shared wire contract. Network data is unknown until validated below. */
export const LIMITS = {
  nickname: 24,
  message: 500,
  history: 1000,
  dedup: 5000,
  frameBytes: 8192,
} as const;
export const TIMING = {
  ack: 5000,
  typingThrottle: 1000,
  typingIdle: 1500,
  typingExpiry: 3500,
  reconnectBase: 500,
  reconnectMax: 15000,
} as const;
export interface User {
  id: string;
  nickname: string;
}
export interface ChatMessage {
  id: string;
  clientMessageId: string;
  clientId: string;
  senderId: string;
  sender: string;
  text: string;
  timestamp: string;
}
export type ClientEvent =
  | { type: 'user:join'; payload: { nickname: string; clientId: string } }
  | { type: 'message:send'; payload: { clientMessageId: string; text: string } }
  | { type: 'typing:start' | 'typing:stop'; payload: Record<string, never> };
export type ServerEvent =
  | { type: 'user:join'; payload: User }
  | { type: 'users:list'; payload: User[] }
  | { type: 'message:history'; payload: ChatMessage[] }
  | { type: 'message:new' | 'message:ack'; payload: ChatMessage }
  | { type: 'typing:start' | 'typing:stop'; payload: User }
  | { type: 'error'; payload: { code: string; message: string; clientMessageId?: string } };
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
export type DeliveryStatus = 'pending' | 'sent' | 'failed';
export interface OutgoingMessage {
  clientMessageId: string;
  text: string;
  timestamp: string;
  status: DeliveryStatus;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const uuid = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const shortText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const user = (value: unknown): value is User =>
  record(value) && uuid(value.id) && shortText(value.nickname, LIMITS.nickname);
const message = (value: unknown): value is ChatMessage =>
  record(value) &&
  uuid(value.id) &&
  uuid(value.clientMessageId) &&
  uuid(value.clientId) &&
  uuid(value.senderId) &&
  shortText(value.sender, LIMITS.nickname) &&
  shortText(value.text, LIMITS.message) &&
  typeof value.timestamp === 'string' &&
  Number.isFinite(Date.parse(value.timestamp));

export function isClientEvent(value: unknown): value is ClientEvent {
  if (!record(value) || !record(value.payload)) return false;
  const p = value.payload;
  switch (value.type) {
    case 'user:join':
      return shortText(p.nickname, LIMITS.nickname) && uuid(p.clientId);
    case 'message:send':
      return uuid(p.clientMessageId) && shortText(p.text, LIMITS.message);
    case 'typing:start':
    case 'typing:stop':
      return Object.keys(p).length === 0;
    default:
      return false;
  }
}
export function isServerEvent(value: unknown): value is ServerEvent {
  if (!record(value)) return false;
  const p = value.payload;
  switch (value.type) {
    case 'user:join':
    case 'typing:start':
    case 'typing:stop':
      return user(p);
    case 'users:list':
      return Array.isArray(p) && p.length <= 10000 && p.every(user);
    case 'message:history':
      return Array.isArray(p) && p.length <= LIMITS.history && p.every(message);
    case 'message:new':
    case 'message:ack':
      return message(p);
    case 'error':
      return (
        record(p) &&
        typeof p.code === 'string' &&
        typeof p.message === 'string' &&
        (p.clientMessageId === undefined || uuid(p.clientMessageId))
      );
    default:
      return false;
  }
}
