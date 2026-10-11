import { useState } from 'react';
import { LoginScreen } from './components/LoginScreen';
import { ChatRoom } from './components/ChatRoom';

export function App() {
  const [nickname, setNickname] = useState('');
  return nickname ? (
    <ChatRoom nickname={nickname} onLeave={() => setNickname('')} />
  ) : (
    <LoginScreen onJoin={setNickname} />
  );
}
