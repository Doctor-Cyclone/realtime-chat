// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { App } from '../App';
import { useChat } from '../hooks/useChat';
import { ChatClient, type ChatSnapshot } from '../lib/ChatClient';

vi.mock('../hooks/useChat', () => ({ useChat: vi.fn() }));
let client: ChatClient;
let state: ChatSnapshot;

beforeEach(() => {
  client = new ChatClient('ws://test/ws', 'Аня');
  state = {
    ...client.getSnapshot(),
    status: 'connected',
    self: { id: randomUUID(), nickname: 'Аня' },
  };
  state.users = [state.self!];
  vi.mocked(useChat).mockReturnValue({ client, state });
});
afterEach(() => {
  cleanup();
  client.disconnect();
  vi.clearAllMocks();
});

function enterChat() {
  render(createElement(App));
  fireEvent.change(screen.getByLabelText('Как вас представить?'), { target: { value: ' Аня ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти в разговор' }));
  expect(useChat).toHaveBeenCalledWith('Аня', expect.stringMatching(/^ws/));
}

it('wires login, composer, Enter, button, typing and leave across extracted components', () => {
  const send = vi.spyOn(client, 'sendMessage').mockReturnValue(true);
  const typing = vi.spyOn(client, 'typing').mockImplementation(() => {});
  const disconnect = vi.spyOn(client, 'disconnect');
  enterChat();
  const input = screen.getByLabelText('Текст сообщения');
  fireEvent.change(input, { target: { value: 'Привет' } });
  expect(typing).toHaveBeenCalledWith('Привет');
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(send).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(send).toHaveBeenCalledWith('Привет');
  expect((input as HTMLTextAreaElement).value).toBe('');
  fireEvent.change(input, { target: { value: 'Второе сообщение' } });
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  expect(send).toHaveBeenLastCalledWith('Второе сообщение');
  fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
  expect(disconnect).toHaveBeenCalled();
  expect(screen.getByLabelText('Как вас представить?')).toBeTruthy();
});

it('renders a lost-ACK message once and routes retry/error controls correctly', () => {
  const clientMessageId = randomUUID();
  state.messages = [
    {
      id: randomUUID(),
      clientMessageId,
      clientId: client.clientId,
      senderId: state.self!.id,
      sender: 'Аня',
      text: 'Без дубликата',
      timestamp: new Date().toISOString(),
    },
  ];
  state.outgoing = [
    {
      clientMessageId,
      text: 'Без дубликата',
      timestamp: state.messages[0]!.timestamp,
      status: 'failed',
    },
  ];
  state.error = 'Соединение было потеряно';
  const retry = vi.spyOn(client, 'retryMessage');
  const dismiss = vi.spyOn(client, 'clearError');
  enterChat();
  expect(screen.getAllByText('Без дубликата')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));
  expect(retry).toHaveBeenCalledWith(clientMessageId);
  fireEvent.click(screen.getByRole('button', { name: 'Закрыть уведомление' }));
  expect(dismiss).toHaveBeenCalled();
});
