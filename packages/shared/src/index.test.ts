import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { isClientEvent, isServerEvent } from './index.js';
describe('runtime protocol validation', () => {
  it('allows valid join and rejects empty, oversized or non-string nicknames', () => {
    const join = (nickname: unknown) => ({
      type: 'user:join',
      payload: { nickname, clientId: randomUUID() },
    });
    expect(isClientEvent(join('Аня'))).toBe(true);
    for (const value of ['', ' ', 'x'.repeat(25), 42, null])
      expect(isClientEvent(join(value))).toBe(false);
  });
  it('enforces UUIDs, text limit, direction and empty typing payload', () => {
    expect(
      isClientEvent({
        type: 'message:send',
        payload: { clientMessageId: randomUUID(), text: 'x'.repeat(500) },
      }),
    ).toBe(true);
    expect(
      isClientEvent({ type: 'message:send', payload: { clientMessageId: 'spoof', text: 'hi' } }),
    ).toBe(false);
    expect(isClientEvent({ type: 'message:ack', payload: {} })).toBe(false);
    expect(isClientEvent({ type: 'typing:start', payload: { nickname: 'Аня' } })).toBe(false);
    expect(isServerEvent({ type: 'users:list', payload: [null] })).toBe(false);
    expect(isServerEvent({ type: 'message:history', payload: [] })).toBe(true);
    expect(isServerEvent({ type: 'message:send', payload: {} })).toBe(false);
  });
});
