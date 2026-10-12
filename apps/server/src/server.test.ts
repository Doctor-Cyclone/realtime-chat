import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import { isServerEvent, LIMITS, type ClientEvent, type ServerEvent } from '@chat/shared';
import { createChatServer } from './server.js';
import { ChatClient, type SocketLike } from '../../client/src/lib/ChatClient';

/** Queue messages before any assertions, avoiding races with server broadcasts. */
class Probe {
  events: ServerEvent[] = [];
  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const event: unknown = JSON.parse(data.toString());
      if (!isServerEvent(event)) throw new Error('Invalid server contract');
      this.events.push(event);
    });
    socket.on('error', () => {});
  }
  send(event: ClientEvent) {
    this.socket.send(JSON.stringify(event));
  }
  async next<T extends ServerEvent['type']>(
    type: T,
  ): Promise<Extract<ServerEvent, { type: T }> | (ServerEvent & { type: T })> {
    return waitUntil(() => {
      const index = this.events.findIndex((e) => e.type === type);
      if (index < 0) return undefined;
      return this.events.splice(index, 1)[0] as ServerEvent & { type: T };
    });
  }
}
async function waitUntil<T>(get: () => T | undefined, timeout = 3000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = get();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for network state');
}
describe('real local WebSocket server', () => {
  let server: Awaited<ReturnType<typeof createChatServer>> | undefined;
  const probes: Probe[] = [];
  const clients: ChatClient[] = [];
  afterEach(async () => {
    clients.splice(0).forEach((c) => c.disconnect());
    probes.splice(0).forEach((p) => p.socket.terminate());
    await server?.close();
    server = undefined;
  });
  async function start() {
    server = await createChatServer({ port: 0, typingExpiryMs: 80 });
    return server;
  }
  async function connect(nickname = 'Аня', clientId: string = randomUUID()) {
    const p = new Probe(new WebSocket(`ws://127.0.0.1:${server!.port}/ws`));
    probes.push(p);
    await new Promise<void>((resolve, reject) => {
      p.socket.once('open', resolve);
      p.socket.once('error', reject);
    });
    p.send({ type: 'user:join', payload: { nickname, clientId } });
    const joined = await p.next('user:join');
    await p.next('message:history');
    await p.next('users:list');
    return { p, user: joined.payload, clientId };
  }
  it('connects two equal nicknames with unique connection ids; broadcasts, ACKs and syncs history/users', async () => {
    await start();
    const a = await connect();
    const b = await connect();
    expect(a.user.id).not.toBe(b.user.id);
    expect((await a.p.next('users:list')).payload).toHaveLength(2);
    const id = randomUUID();
    a.p.send({ type: 'message:send', payload: { clientMessageId: id, text: 'Привет' } });
    const own = await a.p.next('message:new');
    const received = await b.p.next('message:new');
    const ack = await a.p.next('message:ack');
    expect(own.payload).toEqual(received.payload);
    expect(ack.payload).toEqual(own.payload);
    expect(own.payload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(own.payload.senderId).toBe(a.user.id);
    const late = new Probe(new WebSocket(`ws://127.0.0.1:${server!.port}/ws`));
    probes.push(late);
    await new Promise<void>((resolve) => late.socket.once('open', resolve));
    late.send({ type: 'user:join', payload: { nickname: 'Борис', clientId: randomUUID() } });
    expect((await late.next('message:history')).payload).toEqual([own.payload]);
    await b.p.next('users:list');
    late.socket.close();
    expect((await b.p.next('users:list')).payload).toHaveLength(2);
  });
  it('deduplicates retry across reconnect, but permits identical ids from independent clients', async () => {
    await start();
    const a = await connect();
    const id = randomUUID();
    const event: ClientEvent = {
      type: 'message:send',
      payload: { clientMessageId: id, text: 'Привет' },
    };
    a.p.send(event);
    const first = await a.p.next('message:ack');
    await a.p.next('message:new');
    a.p.send(event);
    expect((await a.p.next('message:ack')).payload.id).toBe(first.payload.id);
    expect(a.p.events.filter((e) => e.type === 'message:new')).toHaveLength(0);
    a.p.socket.close();
    await new Promise<void>((resolve) => a.p.socket.once('close', resolve));
    const again = await connect('Аня', a.clientId);
    again.p.send(event);
    expect((await again.p.next('message:ack')).payload.id).toBe(first.payload.id);
    again.p.send({ type: 'message:send', payload: { clientMessageId: id, text: 'Другое' } });
    expect((await again.p.next('error')).payload.code).toBe('ID_CONFLICT');
    const b = await connect();
    b.p.send(event);
    expect((await b.p.next('message:ack')).payload.id).not.toBe(first.payload.id);
  });
  it('rejects malformed, unknown, oversized text and unregistered sends without crashing', async () => {
    await start();
    const a = await connect();
    for (const raw of [
      '{',
      JSON.stringify({ type: 'unknown', payload: {} }),
      JSON.stringify({
        type: 'message:send',
        payload: { clientMessageId: randomUUID(), text: 'x'.repeat(501) },
      }),
      JSON.stringify({ type: 'typing:start', payload: null }),
    ]) {
      a.p.socket.send(raw);
      expect((await a.p.next('error')).payload.code).toMatch(/^INVALID_/);
    }
    a.p.socket.send(Buffer.from('binary'));
    expect((await a.p.next('error')).payload.code).toBe('INVALID_JSON');
    const raw = new Probe(new WebSocket(`ws://127.0.0.1:${server!.port}/ws`));
    probes.push(raw);
    await new Promise<void>((resolve) => raw.socket.once('open', resolve));
    raw.send({ type: 'message:send', payload: { clientMessageId: randomUUID(), text: 'Hello' } });
    expect((await raw.next('error')).payload.code).toBe('NOT_JOINED');
    a.p.send({
      type: 'message:send',
      payload: { clientMessageId: randomUUID(), text: 'Работает' },
    });
    expect((await a.p.next('message:ack')).payload.text).toBe('Работает');
  });
  it('closes frames beyond maxPayload with 1009', async () => {
    await start();
    const a = await connect();
    const closed = new Promise<number>((resolve) =>
      a.p.socket.once('close', (code) => resolve(code)),
    );
    a.p.socket.send('x'.repeat(LIMITS.frameBytes + 1));
    expect(await closed).toBe(1009);
  });
  it('broadcasts typing, expires stale typing and clears it when a peer leaves', async () => {
    await start();
    const a = await connect();
    const b = await connect();
    a.p.send({ type: 'typing:start', payload: {} });
    expect((await b.p.next('typing:start')).payload.id).toBe(a.user.id);
    expect((await b.p.next('typing:stop')).payload.id).toBe(a.user.id);
    a.p.send({ type: 'typing:start', payload: {} });
    await b.p.next('typing:start');
    a.p.socket.close();
    expect((await b.p.next('typing:stop')).payload.id).toBe(a.user.id);
    expect((await b.p.next('users:list')).payload).toHaveLength(1);
  });
  it('forwards typing refresh so recipients can keep their indicator alive', async () => {
    await start();
    const a = await connect();
    const b = await connect();
    a.p.send({ type: 'typing:start', payload: {} });
    await b.p.next('typing:start');
    a.p.send({ type: 'typing:start', payload: {} });
    expect((await b.p.next('typing:start')).payload.id).toBe(a.user.id);
    a.p.send({ type: 'typing:stop', payload: {} });
    expect((await b.p.next('typing:stop')).payload.id).toBe(a.user.id);
  });
  it('uses the actual ChatClient to reconnect, resync and manually cancel reconnect', async () => {
    await start();
    const client = new ChatClient(`ws://127.0.0.1:${server!.port}/ws`, 'Кирилл', {
      socketFactory: (url) => new WebSocket(url) as unknown as SocketLike,
      reconnectBaseMs: 30,
      random: () => 1,
    });
    clients.push(client);
    client.connect();
    await waitUntil(() => (client.getSnapshot().status === 'connected' ? true : undefined));
    const oldId = client.getSnapshot().self!.id;
    client.sendMessage('Привет');
    await waitUntil(() => (client.getSnapshot().outgoing[0]?.status === 'sent' ? true : undefined));
    server!.disconnectAll();
    await waitUntil(() =>
      client.getSnapshot().self && client.getSnapshot().self!.id !== oldId ? true : undefined,
    );
    await waitUntil(() =>
      client.getSnapshot().messages.length === 1 && client.getSnapshot().users.length === 1
        ? true
        : undefined,
    );
    client.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(client.getSnapshot().status).toBe('disconnected');
  });
});
