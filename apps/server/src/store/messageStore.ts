import { randomUUID } from 'node:crypto';
import { LIMITS, type ChatMessage, type User } from '@chat/shared';

interface MessageInput {
  clientId: string;
  clientMessageId: string;
  text: string;
  user: User;
}
type Acceptance = { kind: 'conflict' } | { kind: 'new' | 'existing'; message: ChatMessage };

/** Each room owns its store; retry keys survive connection changes. */
export function createMessageStore() {
  const history: ChatMessage[] = [];
  const accepted = new Map<string, ChatMessage>();

  function accept({
    clientId,
    clientMessageId,
    text: rawText,
    user: { id: senderId, nickname: sender },
  }: MessageInput): Acceptance {
    const text = rawText.trim();
    const key = `${clientId}:${clientMessageId}`;
    const existing = accepted.get(key);
    if (existing)
      return existing.text !== text || existing.sender !== sender
        ? { kind: 'conflict' }
        : { kind: 'existing', message: existing };
    const message: ChatMessage = {
      id: randomUUID(),
      clientMessageId,
      clientId,
      senderId,
      sender,
      text,
      timestamp: new Date().toISOString(),
    };
    history.push(message);
    if (history.length > LIMITS.history) history.shift();
    accepted.set(key, message);
    if (accepted.size > LIMITS.dedup) {
      const { value: oldestKey } = accepted.keys().next();
      if (oldestKey !== undefined) accepted.delete(oldestKey);
    }
    return { kind: 'new', message };
  }

  return { getHistory: () => history, accept };
}
