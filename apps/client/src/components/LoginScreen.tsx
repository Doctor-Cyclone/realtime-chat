import { useState, type FormEvent } from 'react';
import { LIMITS } from '@chat/shared';
import styles from '../App.module.css';

interface LoginScreenProps {
  onJoin: (nickname: string) => void;
}
export function LoginScreen({ onJoin }: LoginScreenProps) {
  const [draft, setDraft] = useState('');
  function join(event: FormEvent) {
    event.preventDefault();
    const nickname = draft.trim();
    if (nickname) onJoin(nickname);
  }
  return (
    <main className={styles.loginPage}>
      <div className={styles.loginCard}>
        <div className={styles.logo}>
          s<span>·</span>
        </div>
        <span className={styles.eyebrow}>REAL-TIME CONNECTIONS</span>
        <h1>
          Хороший разговор
          <br />
          начинается здесь.
        </h1>
        <p>
          Одна комната. Живые сообщения.
          <br />
          Присоединяйтесь под любым именем.
        </p>
        <form onSubmit={join}>
          <label htmlFor="nickname">Как вас представить?</label>
          <input
            id="nickname"
            autoFocus
            autoComplete="nickname"
            maxLength={LIMITS.nickname}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ваше имя"
            required
          />
          <button type="submit" disabled={!draft.trim()}>
            Войти в разговор <span aria-hidden>↗</span>
          </button>
        </form>
        <div className={styles.loginNote}>
          <span className={styles.dot} /> Без регистрации · История в памяти сервера
        </div>
      </div>
      <div className={styles.loginDecoration} aria-hidden>
        <div />
        <div />
        <div />
        <span>signal / chat</span>
      </div>
    </main>
  );
}
