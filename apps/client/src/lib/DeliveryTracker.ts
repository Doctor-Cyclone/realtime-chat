import type { DeliveryStatus } from '@chat/shared';

/** Owns ACK deadlines; outgoing message data remains in the chat snapshot. */
export class DeliveryTracker {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private onStatus: (id: string, status: DeliveryStatus) => void,
    private timeoutMs: number,
  ) {}

  track(id: string) {
    clearTimeout(this.timers.get(id));
    this.timers.set(
      id,
      setTimeout(() => this.settle(id, 'failed'), this.timeoutMs),
    );
  }
  settle(id: string, status: 'sent' | 'failed') {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.onStatus(id, status);
  }
  clear() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}
