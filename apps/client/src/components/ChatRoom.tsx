import { useMemo, useState } from 'react';
import { useChat } from '../hooks/useChat';
import { buildMessageRows } from '../model/messageRows';
import { getWebSocketUrl } from '../utils/getWebSocketUrl';
import { ChatHeader } from './ChatHeader';
import { UserSidebar } from './UserSidebar';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { ErrorNotice } from './ErrorNotice';
import styles from '../App.module.css';

interface ChatRoomProps {
  nickname: string;
  onLeave: () => void;
}

/** Composes the chat screen; transport and rendering remain in their own modules. */
export function ChatRoom({ nickname, onLeave }: ChatRoomProps) {
  const { state, client } = useChat(nickname, getWebSocketUrl());
  const { status, users, self, messages, outgoing, typing, error } = state;
  const { clientId } = client;
  const [showUsers, setShowUsers] = useState(false);
  const [scrollRequest, setScrollRequest] = useState(0);
  const connected = status === 'connected';
  const rows = useMemo(
    () => buildMessageRows({ messages, outgoing, clientId, nickname }),
    [messages, outgoing, clientId, nickname],
  );

  function sendMessage(text: string) {
    const accepted = client.sendMessage(text);
    if (accepted) setScrollRequest((request) => request + 1);
    return accepted;
  }
  function leave() {
    client.disconnect();
    onLeave();
  }

  return (
    <main className={styles.shell}>
      <UserSidebar
        users={users}
        selfId={self?.id}
        showUsers={showUsers}
        onClose={() => setShowUsers(false)}
      />
      <section className={styles.chatPanel}>
        <ChatHeader
          status={status}
          userCount={users.length}
          onToggleUsers={() => setShowUsers((visible) => !visible)}
          onLeave={leave}
        />
        {error && <ErrorNotice message={error} onDismiss={() => client.clearError()} />}
        <MessageList
          rows={rows}
          connected={connected}
          onRetry={(id) => client.retryMessage(id)}
          scrollRequest={scrollRequest}
        />
        <MessageComposer
          connected={connected}
          typing={typing}
          onSend={sendMessage}
          onTyping={(text) => client.typing(text)}
          onStopTyping={() => client.stopTyping()}
        />
      </section>
    </main>
  );
}
