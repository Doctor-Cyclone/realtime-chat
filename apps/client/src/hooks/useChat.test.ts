// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { useChat } from './useChat';
import type { SocketLike } from '../lib/ChatClient';

class TestSocket implements SocketLike {
  static instances: TestSocket[] = [];
  readyState = 0;
  onopen: SocketLike['onopen'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  onmessage: SocketLike['onmessage'] = null;
  constructor() {
    TestSocket.instances.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}
afterEach(() => {
  vi.unstubAllGlobals();
  TestSocket.instances = [];
});
it('cleans up the Strict Mode rehearsal and cancels reconnect on real hook unmount', async () => {
  vi.stubGlobal('WebSocket', TestSocket);
  const { result, unmount } = renderHook(() => useChat('Аня', 'ws://test/ws'), {
    reactStrictMode: true,
  });
  expect(TestSocket.instances).toHaveLength(2);
  const first = TestSocket.instances[0]!;
  const second = TestSocket.instances[1]!;
  expect(first.readyState).toBe(3);
  expect(first.onmessage).toBeNull();
  act(() => {
    second.readyState = 1;
    second.onopen?.(new Event('open'));
    second.onmessage?.(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'user:join', payload: { id: randomUUID(), nickname: 'Аня' } }),
      }),
    );
  });
  await waitFor(() => expect(result.current.state.status).toBe('connected'));
  vi.useFakeTimers();
  act(() => {
    second.readyState = 3;
    second.onclose?.(new Event('close') as CloseEvent);
  });
  expect(result.current.state.status).toBe('reconnecting');
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(30000);
  expect(TestSocket.instances).toHaveLength(2);
  expect(second.onmessage).toBeNull();
  vi.useRealTimers();
});
