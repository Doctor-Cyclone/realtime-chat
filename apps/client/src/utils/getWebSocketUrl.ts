export function getWebSocketUrl() {
  const { protocol, host } = window.location;
  return import.meta.env.VITE_WS_URL || `${protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/ws`;
}
