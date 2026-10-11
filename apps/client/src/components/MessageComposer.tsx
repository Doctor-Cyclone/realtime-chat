import { useState, type FormEvent } from 'react';
import { LIMITS, type User } from '@chat/shared';
import styles from '../App.module.css';

interface MessageComposerProps {
  connected: boolean;
  typing: User[];
  onSend: (text: string) => boolean;
  onTyping: (text: string) => void;
  onStopTyping: () => void;
}
export function MessageComposer({
  connected,
  typing,
  onSend,
  onTyping,
  onStopTyping,
}: MessageComposerProps) {
  const [text, setText] = useState('');
  function send() {
    if (onSend(text)) setText('');
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    send();
  }
  return (
    <footer className={styles.composer}>
      <div className={styles.typing} role="status">
        {typing.length > 0 && (
          <>
            <span className={styles.typingDots}>•••</span>{' '}
            {typing.map(({ nickname }) => nickname).join(', ')}{' '}
            {typing.length === 1 ? 'печатает' : 'печатают'}…
          </>
        )}
      </div>
      <form onSubmit={submit} className={styles.inputBox}>
        <textarea
          aria-label="Текст сообщения"
          rows={2}
          value={text}
          maxLength={LIMITS.message}
          disabled={!connected}
          placeholder={connected ? 'Напишите что-нибудь хорошее…' : 'Ожидаем соединения…'}
          onChange={({ currentTarget: { value } }) => {
            setText(value);
            onTyping(value);
          }}
          onBlur={onStopTyping}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button
          aria-label="Отправить сообщение"
          type="submit"
          disabled={!connected || !text.trim()}
        >
          Отправить <span aria-hidden>↗</span>
        </button>
      </form>
      <div className={styles.composerHint}>
        <span>
          Enter — отправить <b>·</b> Shift + Enter — новая строка
        </span>
        <span>
          {text.length} / {LIMITS.message}
        </span>
      </div>
    </footer>
  );
}
