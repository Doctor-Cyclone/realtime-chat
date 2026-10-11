export const formatTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
export const formatDate = (timestamp: string) =>
  new Date(timestamp).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
