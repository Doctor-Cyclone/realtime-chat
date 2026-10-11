import type { ChatMessage, DeliveryStatus, OutgoingMessage } from '@chat/shared';

export interface MessageRow {
  key: string;
  id: string;
  own: boolean;
  sender: string;
  text: string;
  timestamp: string;
  delivery?: DeliveryStatus;
}
interface MessageRowsInput {
  messages: ChatMessage[];
  outgoing: OutgoingMessage[];
  clientId: string;
  nickname: string;
}

/** Merge server messages with unsynchronized outgoing messages without duplicate bubbles. */
export function buildMessageRows({
  messages,
  outgoing,
  clientId,
  nickname,
}: MessageRowsInput): MessageRow[] {
  const confirmedIds = new Set(
    messages
      .filter((message) => message.clientId === clientId)
      .map(({ clientMessageId }) => clientMessageId),
  );
  const deliveryById = new Map(
    outgoing.map(({ clientMessageId, status }) => [clientMessageId, status]),
  );
  const confirmed: MessageRow[] = messages.map(
    ({ id, clientMessageId, clientId: senderClientId, sender, text, timestamp }) => {
      const own = senderClientId === clientId;
      return {
        key: id,
        id: clientMessageId,
        own,
        sender,
        text,
        timestamp,
        delivery: own ? (deliveryById.get(clientMessageId) ?? 'sent') : undefined,
      };
    },
  );
  const unconfirmed: MessageRow[] = outgoing
    .filter(
      ({ clientMessageId, status }) => !confirmedIds.has(clientMessageId) && status !== 'sent',
    )
    .map(({ clientMessageId, text, timestamp, status }) => ({
      key: clientMessageId,
      id: clientMessageId,
      own: true,
      sender: nickname,
      text,
      timestamp,
      delivery: status,
    }));
  return [...confirmed, ...unconfirmed].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
