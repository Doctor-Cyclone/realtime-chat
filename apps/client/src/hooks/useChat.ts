import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ChatClient } from '../lib/ChatClient';

export function useChat(nickname: string, url: string) {
  const client = useMemo(() => new ChatClient(url, nickname), [url, nickname]);
  const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);
  return { state, client };
}
