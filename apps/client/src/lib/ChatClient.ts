import {
  isServerEvent,
  LIMITS,
  TIMING,
  type ChatMessage,
  type ClientEvent,
  type OutgoingMessage,
  type DeliveryStatus,
  type ServerEvent,
} from '@chat/shared';

import type { SocketLike, ChatSnapshot, ClientOptions } from './types';
export type { SocketLike, ChatSnapshot, ClientOptions } from './types';
import { DeliveryTracker } from './DeliveryTracker';

const initial = (): ChatSnapshot => ({
  status: 'disconnected',
  self: null,
  users: [],
  messages: [],
  outgoing: [],
  typing: [],
  error: null,
});

export class ChatClient {
  readonly clientId: string;
  private snapshot = initial();
  private listeners = new Set<() => void>();
  private socket: SocketLike | null = null;
  private active = false;
  private attempt = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  private delivery: DeliveryTracker;
  private typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private idleTimer?: ReturnType<typeof setTimeout>;
  private lastTyping = -Infinity;
  private localTyping = false;
  private factory: (url: string) => SocketLike;

  constructor(
    private url: string,
    private nickname: string,
    private options: ClientOptions = {},
  ) {
    const {
      clientId = crypto.randomUUID(),
      socketFactory = (url: string) => new WebSocket(url),
      ackMs = TIMING.ack,
    } = options;
    this.clientId = clientId;
    this.factory = socketFactory;
    this.delivery = new DeliveryTracker((id, status) => this.updateDelivery(id, status), ackMs);
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<ChatSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  connect() {
    if (this.active) return;
    this.active = true;
    this.attempt = 0;
    this.open();
  }
  private open() {
    if (!this.active || this.socket) return;
    this.update({ status: this.attempt ? 'reconnecting' : 'connecting', error: null });
    let socket: SocketLike;
    try {
      socket = this.factory(this.url);
    } catch {
      this.update({ error: 'Не удалось создать соединение.' });
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.handshakeTimer = setTimeout(() => {
      if (!current()) return;
      this.detach(socket);
      this.socket = null;
      socket.close();
      this.update({ error: 'Сервер не подтвердил вход. Повторяем подключение…' });
      this.scheduleReconnect();
    }, 10000);
    // Guard every handler against callbacks from a retired connection.
    const current = () => this.active && this.socket === socket;
    socket.onopen = () => {
      if (!current()) return;
      this.transmit({
        type: 'user:join',
        payload: { nickname: this.nickname, clientId: this.clientId },
      });
    };
    socket.onmessage = (event) => {
      if (!current()) return;
      let value: unknown;
      try {
        if (typeof event.data !== 'string') throw new Error('Non-text event');
        value = JSON.parse(event.data);
      } catch {
        this.update({ error: 'Сервер прислал некорректное сообщение.' });
        return;
      }
      if (!isServerEvent(value)) {
        this.update({ error: 'Не удалось распознать событие сервера.' });
        return;
      }
      this.receive(value);
    };
    socket.onerror = () => {
      if (!current()) return;
      this.update({ error: 'Сервер недоступен. Проверяем соединение…' });
      // Browsers dispatch close after error; reconnect is scheduled only by close.
    };
    socket.onclose = () => {
      if (!current()) return;
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = undefined;
      this.detach(socket);
      this.socket = null;
      this.clearTransient();
      this.failPending();
      this.update({
        self: null,
        users: [],
        typing: [],
        error: 'Соединение потеряно. Восстанавливаем…',
      });
      this.scheduleReconnect();
    };
  }
  private scheduleReconnect() {
    if (!this.active || this.reconnectTimer) return;
    const base = this.options.reconnectBaseMs ?? TIMING.reconnectBase;
    const cap = this.options.reconnectMaxMs ?? TIMING.reconnectMax;
    const delay =
      Math.min(cap, base * 2 ** Math.min(this.attempt++, 20)) *
      (0.8 + (this.options.random ?? Math.random)() * 0.2);
    this.update({ status: 'reconnecting' });
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.open();
    }, delay);
  }
  private detach(socket: SocketLike) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
  }
  disconnect() {
    this.active = false;
    clearTimeout(this.reconnectTimer);
    clearTimeout(this.handshakeTimer);
    this.handshakeTimer = undefined;
    this.reconnectTimer = undefined;
    this.stopTyping();
    if (this.socket) {
      this.detach(this.socket);
      this.socket.close();
      this.socket = null;
    }
    this.clearTransient();
    this.failPending();
    this.update({ status: 'disconnected', self: null, users: [], typing: [], error: null });
  }
  private clearTransient() {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    this.localTyping = false;
    this.lastTyping = -Infinity;
    this.typingTimers.forEach(clearTimeout);
    this.typingTimers.clear();
  }
  private transmit(event: ClientEvent): boolean {
    if (this.socket?.readyState !== 1) return false;
    try {
      this.socket.send(JSON.stringify(event));
      return true;
    } catch {
      this.update({ error: 'Не удалось отправить событие. Попробуйте снова.' });
      return false;
    }
  }
  private receive(event: ServerEvent) {
    const { type, payload } = event;
    switch (type) {
      case 'user:join':
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = undefined;
        this.attempt = 0;
        this.update({ self: payload, status: 'connected', error: null });
        break;
      case 'users:list': {
        const ids = new Set(payload.map((u) => u.id));
        for (const [id, timer] of this.typingTimers)
          if (!ids.has(id)) {
            clearTimeout(timer);
            this.typingTimers.delete(id);
          }
        this.update({
          users: payload,
          typing: this.snapshot.typing.filter((u) => ids.has(u.id)),
        });
        break;
      }
      case 'message:history': {
        // History is authoritative after reconnect, including after server restart.
        const messages = [...new Map(payload.map((m) => [m.id, m])).values()].sort((a, b) =>
          a.timestamp.localeCompare(b.timestamp),
        );
        // A message present in history was accepted, even if its ACK was lost.
        for (const m of messages)
          if (m.clientId === this.clientId) this.delivery.settle(m.clientMessageId, 'sent');
        this.update({ messages });
        break;
      }
      case 'message:new':
        this.addMessage(payload);
        break;
      case 'message:ack':
        if (payload.clientId !== this.clientId) break;
        this.delivery.settle(payload.clientMessageId, 'sent');
        this.addMessage(payload);
        break;
      case 'typing:start': {
        if (payload.id === this.snapshot.self?.id) break;
        const id = payload.id;
        clearTimeout(this.typingTimers.get(id));
        this.typingTimers.set(
          id,
          setTimeout(() => this.removeTyping(id), TIMING.typingExpiry),
        );
        this.update({
          typing: [...this.snapshot.typing.filter((u) => u.id !== id), payload],
        });
        break;
      }
      case 'typing:stop':
        this.removeTyping(payload.id);
        break;
      case 'error':
        if (payload.clientMessageId) this.delivery.settle(payload.clientMessageId, 'failed');
        this.update({ error: payload.message });
        break;
    }
  }
  private addMessage(message: ChatMessage) {
    if (this.snapshot.messages.some((m) => m.id === message.id)) return;
    this.update({
      messages: [...this.snapshot.messages, message]
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .slice(-LIMITS.history),
    });
  }
  private removeTyping(id: string) {
    clearTimeout(this.typingTimers.get(id));
    this.typingTimers.delete(id);
    this.update({ typing: this.snapshot.typing.filter((u) => u.id !== id) });
  }
  private updateDelivery(id: string, status: DeliveryStatus) {
    const { outgoing } = this.snapshot;
    this.update({
      outgoing: outgoing.map((message) =>
        message.clientMessageId === id ? { ...message, status } : message,
      ),
    });
  }
  private failPending() {
    this.delivery.clear();
    this.update({
      outgoing: this.snapshot.outgoing.map((m) =>
        m.status === 'pending' ? { ...m, status: 'failed' } : m,
      ),
    });
  }
  sendMessage(text: string): boolean {
    if (this.snapshot.status !== 'connected' || !text.trim() || text.length > LIMITS.message)
      return false;
    const outgoing: OutgoingMessage = {
      clientMessageId: crypto.randomUUID(),
      text: text.trim(),
      timestamp: new Date().toISOString(),
      status: 'pending',
    };
    // Bound local bookkeeping independently of server history.
    this.update({
      outgoing: [
        ...this.snapshot.outgoing.filter((m) => m.status !== 'sent').slice(-LIMITS.history + 1),
        ...this.snapshot.outgoing.filter((m) => m.status === 'sent').slice(-LIMITS.history),
        outgoing,
      ],
    });
    this.stopTyping();
    this.dispatchMessage(outgoing);
    return true;
  }
  retryMessage(id: string) {
    const outgoing = this.snapshot.outgoing.find((m) => m.clientMessageId === id);
    if (!outgoing || outgoing.status !== 'failed' || this.snapshot.status !== 'connected') return;
    this.update({
      outgoing: this.snapshot.outgoing.map((m) =>
        m === outgoing ? { ...m, status: 'pending' } : m,
      ),
      error: null,
    });
    this.dispatchMessage(outgoing);
  }
  private dispatchMessage({ clientMessageId, text }: OutgoingMessage) {
    // Install before send: deterministic transports may ACK synchronously.
    this.delivery.track(clientMessageId);
    if (!this.transmit({ type: 'message:send', payload: { clientMessageId, text } }))
      this.delivery.settle(clientMessageId, 'failed');
  }
  typing(text: string) {
    if (!text.trim()) {
      this.stopTyping();
      return;
    }
    if (this.snapshot.status !== 'connected') return;
    const now = Date.now();
    if (!this.localTyping || now - this.lastTyping >= TIMING.typingThrottle) {
      this.localTyping = this.transmit({ type: 'typing:start', payload: {} });
      this.lastTyping = now;
    }
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stopTyping(), TIMING.typingIdle);
  }
  stopTyping() {
    clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (this.localTyping) this.transmit({ type: 'typing:stop', payload: {} });
    this.localTyping = false;
  }
  clearError() {
    this.update({ error: null });
  }
}
