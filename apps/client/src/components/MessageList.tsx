import type { MessageRow } from '../model/messageRows';
import { useMessageScroll } from '../hooks/useMessageScroll';
import { formatDate } from '../utils/formatDate';
import { MessageItem } from './MessageItem';
import styles from '../App.module.css';

interface MessageListProps {
  rows: MessageRow[];
  connected: boolean;
  onRetry: (id: string) => void;
  scrollRequest: number;
}
export function MessageList({ rows, connected, onRetry, scrollRequest }: MessageListProps) {
  const { scroll, hasNewMessages, handleScroll, scrollToBottom } = useMessageScroll(
    rows,
    scrollRequest,
  );
  return (
    <>
      {' '}
      <div
        className={styles.messages}
        ref={scroll}
        role="log"
        aria-label="Сообщения чата"
        aria-live="polite"
        onScroll={handleScroll}
      >
        <div className={styles.welcome}>
          <span>#</span>
          <h2>Здесь начинается разговор</h2>
          <p>Скажите «привет» — и вы уже часть комнаты.</p>
          <small>
            Время сообщений определяется сервером · ACK означает принятие, а не прочтение
          </small>
        </div>
        {rows.map((row, index) => (
          <div key={row.key}>
            {(index === 0 ||
              row.timestamp.slice(0, 10) !== rows[index - 1]?.timestamp.slice(0, 10)) && (
              <div className={styles.date}>{formatDate(row.timestamp)}</div>
            )}
            <MessageItem message={row} connected={connected} onRetry={onRetry} />
          </div>
        ))}
      </div>
      {hasNewMessages && (
        <button
          className={styles.newMessages}
          onClick={() => {
            scrollToBottom();
          }}
        >
          Новые сообщения ↓
        </button>
      )}
    </>
  );
}
