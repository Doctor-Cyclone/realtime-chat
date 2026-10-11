import { useEffect, useRef, useState } from 'react';
import type { MessageRow } from '../model/messageRows';

export function useMessageScroll(rows: MessageRow[], scrollRequest: number) {
  const scroll = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousRequest = useRef(scrollRequest);
  const [hasNewMessages, setHasNewMessages] = useState(false);

  function scrollToBottom() {
    const { current: area } = scroll;
    if (area) area.scrollTop = area.scrollHeight;
    nearBottom.current = true;
    setHasNewMessages(false);
  }
  function handleScroll() {
    const { current: area } = scroll;
    if (!area) return;
    const { scrollHeight, scrollTop, clientHeight } = area;
    nearBottom.current = scrollHeight - scrollTop - clientHeight < 80;
    if (nearBottom.current) setHasNewMessages(false);
  }
  useEffect(() => {
    const requested = previousRequest.current !== scrollRequest;
    previousRequest.current = scrollRequest;
    if (requested || nearBottom.current) scrollToBottom();
    else setHasNewMessages(true);
  }, [rows, scrollRequest]);

  return { scroll, hasNewMessages, handleScroll, scrollToBottom };
}
