import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TIMING, type ChatMessage, type ServerEvent } from '@chat/shared';
import { ChatClient, type SocketLike } from './ChatClient';

class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: SocketLike['onopen'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  onmessage: SocketLike['onmessage'] = null;
  sent: string[] = [];
  failSend = false;
  send(data: string) {
    if (this.failSend) throw new Error('Send failure');
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.onclose?.(new Event('close') as CloseEvent);
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }
  emit(event: ServerEvent) {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(event) }));
  }
}
const user = () => ({ id: randomUUID(), nickname: 'Аня' });
const makeMessage = (client: ChatClient, id: string = randomUUID()): ChatMessage => ({
  id: randomUUID(),
  clientMessageId: id,
  clientId: client.clientId,
  senderId: randomUUID(),
  sender: 'Аня',
  text: 'Привет',
  timestamp: new Date().toISOString(),
});

describe('ChatClient lifecycle and delivery', () => {
  let client: ChatClient;
  let sockets: FakeSocket[];
  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    client = new ChatClient('ws://test/ws', 'Аня', {
      socketFactory: () => {
        const s = new FakeSocket();
        sockets.push(s);
        return s;
      },
      random: () => 1,
    });
  });
  afterEach(() => {
    client.disconnect();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
  const connected = () => {
    client.connect();
    const s = sockets.at(-1)!;
    s.open();
    s.emit({ type: 'user:join', payload: user() });
    return s;
  };

  it('registers only once and waits for server registration before enabling send', () => {
    client.connect();
    client.connect();
    expect(sockets).toHaveLength(1);
    expect(client.sendMessage('Привет')).toBe(false);
    sockets[0]!.open();
    expect(JSON.parse(sockets[0]!.sent[0]!)).toEqual({
      type: 'user:join',
      payload: { nickname: 'Аня', clientId: client.clientId },
    });
    expect(client.getSnapshot().status).toBe('connecting');
    sockets[0]!.emit({ type: 'user:join', payload: user() });
    expect(client.getSnapshot().status).toBe('connected');
  });
  it('retries a connection whose server never confirms registration', () => {
    client.connect();
    sockets[0]!.open();
    vi.advanceTimersByTime(10000);
    expect(sockets[0]!.readyState).toBe(3);
    expect(client.getSnapshot().status).toBe('reconnecting');
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(2);
  });
  it('reconnects with exponential backoff, cap, stable identity and resets after success', () => {
    const s = connected();
    s.close();
    expect(client.getSnapshot().status).toBe('reconnecting');
    vi.advanceTimersByTime(499);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);
    sockets[1]!.close();
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);
    for (const delay of [2000, 4000, 8000, 15000, 15000]) {
      const count = sockets.length;
      sockets.at(-1)!.close();
      vi.advanceTimersByTime(delay - 1);
      expect(sockets).toHaveLength(count);
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(count + 1);
    }
    const last = sockets.at(-1)!;
    last.open();
    last.emit({ type: 'user:join', payload: user() });
    expect(JSON.parse(last.sent[0]!).payload.clientId).toBe(client.clientId);
    last.close();
    const count = sockets.length;
    vi.advanceTimersByTime(500);
    expect(sockets).toHaveLength(count + 1);
  });
  it('cancels reconnect and detaches handlers on manual close; supports Strict Mode setup/cleanup', () => {
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);
    const s = connected();
    const oldClose = s.onclose!;
    s.close();
    client.disconnect();
    unsubscribe();
    listener.mockClear();
    vi.advanceTimersByTime(100000);
    expect(sockets).toHaveLength(1);
    expect(s.onmessage).toBeNull();
    expect(s.onclose).toBeNull();
    client.connect();
    oldClose(new Event('close') as CloseEvent);
    expect(sockets).toHaveLength(2);
    expect(client.getSnapshot().status).toBe('connecting');
    expect(listener).not.toHaveBeenCalled();
  });
  it('moves pending to sent on ACK and de-duplicates repeated broadcasts and ACKs', () => {
    const s = connected();
    expect(client.sendMessage('Привет')).toBe(true);
    const outgoing = client.getSnapshot().outgoing[0]!;
    expect(outgoing.status).toBe('pending');
    const message = makeMessage(client, outgoing.clientMessageId);
    s.emit({ type: 'message:new', payload: message });
    s.emit({ type: 'message:new', payload: message });
    expect(client.getSnapshot().outgoing[0]!.status).toBe('pending');
    s.emit({ type: 'message:ack', payload: message });
    s.emit({ type: 'message:ack', payload: message });
    expect(client.getSnapshot().outgoing[0]!.status).toBe('sent');
    expect(client.getSnapshot().messages).toHaveLength(1);
    vi.advanceTimersByTime(TIMING.ack);
    expect(client.getSnapshot().outgoing[0]!.status).toBe('sent');
  });
  it('marks missing ACK failed, retries with the same id and accepts a late ACK', () => {
    const s = connected();
    client.sendMessage('Привет');
    const id = client.getSnapshot().outgoing[0]!.clientMessageId;
    vi.advanceTimersByTime(TIMING.ack);
    expect(client.getSnapshot().outgoing[0]!.status).toBe('failed');
    client.retryMessage(id);
    expect(client.getSnapshot().outgoing[0]!.status).toBe('pending');
    expect(
      s.sent
        .filter((raw) => JSON.parse(raw).type === 'message:send')
        .map((raw) => JSON.parse(raw).payload.clientMessageId),
    ).toEqual([id, id]);
    vi.advanceTimersByTime(TIMING.ack);
    s.emit({ type: 'message:ack', payload: makeMessage(client, id) });
    expect(client.getSnapshot().outgoing[0]!.status).toBe('sent');
  });
  it('fails pending messages on disconnect and reconciles lost ACK from history', () => {
    const s = connected();
    client.sendMessage('Привет');
    const id = client.getSnapshot().outgoing[0]!.clientMessageId;
    s.close();
    expect(client.getSnapshot().outgoing[0]!.status).toBe('failed');
    vi.advanceTimersByTime(500);
    sockets[1]!.open();
    sockets[1]!.emit({ type: 'user:join', payload: user() });
    sockets[1]!.emit({ type: 'message:history', payload: [makeMessage(client, id)] });
    expect(client.getSnapshot().outgoing[0]!.status).toBe('sent');
    sockets[1]!.emit({ type: 'message:history', payload: [] });
    expect(client.getSnapshot().messages).toHaveLength(0);
  });
  it('contains invalid JSON, invalid events and send exceptions', () => {
    const s = connected();
    s.onmessage!(new MessageEvent('message', { data: '{' }));
    expect(client.getSnapshot().error).toBeTruthy();
    s.onmessage!(
      new MessageEvent('message', { data: JSON.stringify({ type: 'message:new', payload: null }) }),
    );
    expect(client.getSnapshot().messages).toHaveLength(0);
    s.failSend = true;
    client.sendMessage('Привет');
    expect(client.getSnapshot().outgoing[0]!.status).toBe('failed');
    expect(client.sendMessage(' ')).toBe(false);
    expect(client.sendMessage('x'.repeat(501))).toBe(false);
  });
  it('throttles typing, stops on idle and expires remote indicators', () => {
    const s = connected();
    client.typing('a');
    client.typing('ab');
    client.typing('abc');
    expect(s.sent.filter((raw) => JSON.parse(raw).type === 'typing:start')).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    client.typing('abcd');
    expect(s.sent.filter((raw) => JSON.parse(raw).type === 'typing:start')).toHaveLength(2);
    vi.advanceTimersByTime(1500);
    expect(JSON.parse(s.sent.at(-1)!).type).toBe('typing:stop');
    const other = user();
    s.emit({ type: 'typing:start', payload: other });
    expect(client.getSnapshot().typing).toHaveLength(1);
    vi.advanceTimersByTime(TIMING.typingExpiry);
    expect(client.getSnapshot().typing).toHaveLength(0);
    s.emit({ type: 'typing:start', payload: other });
    s.emit({ type: 'users:list', payload: [] });
    expect(client.getSnapshot().typing).toHaveLength(0);
  });
});
