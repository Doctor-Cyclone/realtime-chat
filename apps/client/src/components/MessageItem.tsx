import type { DeliveryStatus } from '@chat/shared';
import type { MessageRow } from '../model/messageRows';
import { formatTime } from '../utils/formatDate';
import styles from '../App.module.css';

const deliveryLabels: Record<DeliveryStatus, string> = {
  pending: 'Отправляется…',
  sent: '✓ Принято сервером',
  failed: 'Не подтверждено',
};
interface MessageItemProps {
  message: MessageRow;
  connected: boolean;
  onRetry: (id: string) => void;
}
export function MessageItem({
  message: { id, own, sender, text, timestamp, delivery },
  connected,
  onRetry,
}: MessageItemProps) {
  return (
    <article className={`${styles.message} ${own ? styles.own : ''}`}>
      <div className={styles.messageMeta}>
        <strong>{own ? 'Вы' : sender}</strong>
        <time dateTime={timestamp}>{formatTime(timestamp)}</time>
      </div>
      <div className={styles.bubble}>{text}</div>
      {delivery && (
        <div className={`${styles.delivery} ${delivery === 'failed' ? styles.failed : ''}`}>
          <span>{deliveryLabels[delivery]}</span>
          {delivery === 'failed' && (
            <button disabled={!connected} onClick={() => onRetry(id)}>
              Повторить
            </button>
          )}
        </div>
      )}
    </article>
  );
}
