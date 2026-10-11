import type { User } from '@chat/shared';
import styles from '../App.module.css';

interface UserSidebarProps {
  users: User[];
  selfId?: string;
  showUsers: boolean;
  onClose: () => void;
}
export function UserSidebar({ users, selfId, showUsers, onClose }: UserSidebarProps) {
  return (
    <aside className={`${styles.sidebar} ${showUsers ? styles.sidebarOpen : ''}`}>
      <div className={styles.brand}>
        <div className={styles.logo}>
          s<span>·</span>
        </div>
        <strong>signal</strong>
      </div>
      <div className={styles.sectionLabel}>ПРОСТРАНСТВО</div>
      <div className={styles.room}>
        <span>#</span>
        <div>
          <strong>Общая комната</strong>
          <small>Для каждого разговора</small>
        </div>
        <span className={styles.roomDot} />
      </div>
      <div className={styles.usersHeader}>
        <span className={styles.sectionLabel}>СЕЙЧАС ОНЛАЙН</span>
        <span>{users.length}</span>
      </div>
      <ul className={styles.users}>
        {users.map(({ id, nickname }) => (
          <li key={id}>
            <span className={styles.avatar}>{nickname.slice(0, 1).toUpperCase()}</span>
            <span>
              {nickname}
              {id === selfId && <small>вы</small>}
            </span>
            <i className={styles.dot} />
          </li>
        ))}
      </ul>
      {!users.length && <p className={styles.sidebarHint}>Ждём соединения…</p>}
      <div className={styles.sidebarFooter}>
        <p>Разговор в моменте.</p>
        <small>Сообщения хранятся до перезапуска сервера.</small>
      </div>
      <button className={styles.mobileClose} onClick={onClose}>
        Закрыть список
      </button>
    </aside>
  );
}
