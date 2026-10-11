import styles from '../App.module.css';
interface ErrorNoticeProps {
  message: string;
  onDismiss: () => void;
}
export function ErrorNotice({ message, onDismiss }: ErrorNoticeProps) {
  return (
    <div className={styles.error} role="alert">
      <span>{message}</span>
      <button aria-label="Закрыть уведомление" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
