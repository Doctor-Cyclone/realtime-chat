import type { ConnectionStatus } from '@chat/shared';
import styles from '../App.module.css';

const statusLabels: Record<ConnectionStatus, string> = {
  connecting: 'Connecting',
  connected: 'Connected',
  disconnected: 'Disconnected',
  reconnecting: 'Reconnecting',
};
interface ChatHeaderProps {
  status: ConnectionStatus;
  userCount: number;
  onToggleUsers: () => void;
  onLeave: () => void;
}
export function ChatHeader({ status, userCount, onToggleUsers, onLeave }: ChatHeaderProps) {
  const connected = status === 'connected';
  return (
    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}>SIGNAL / ОБЩАЯ КОМНАТА</span>
        <h1>
          Давайте поговорим<span>·</span>
        </h1>
      </div>
      <div className={styles.headerActions}>
        <span className={`${styles.connection} ${connected ? styles.connected : ''}`} role="status">
          <i className={styles.dot} />
          {statusLabels[status]}
        </span>
        <button className={styles.mobileUsers} onClick={() => onToggleUsers()}>
          Участники ({userCount})
        </button>
        <button className={styles.leave} onClick={onLeave}>
          Выйти <span aria-hidden>↗</span>
        </button>
      </div>
    </header>
  );
}
