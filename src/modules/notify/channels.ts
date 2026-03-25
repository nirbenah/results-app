/**
 * Notification channels — abstractions for delivering notifications.
 *
 * INotificationChannel is the contract for any delivery mechanism
 * (push, email, SMS, in-app). InAppChannel is a console-based
 * placeholder for Phase 1.
 *
 * ChannelManager fans out to all registered channels.
 */

// ─── Channel interface ───

export interface INotificationChannel {
  /** Deliver a notification to a single user. */
  send(userId: string, title: string, body: string): Promise<void>;
}

// ─── In-app channel (placeholder — logs to console) ───

export class InAppChannel implements INotificationChannel {
  async send(userId: string, title: string, body: string): Promise<void> {
    console.log(
      `[Notify:InApp] user=${userId} title="${title}" body="${body}"`
    );
  }
}

// ─── Channel manager — sends to all registered channels ───

export class ChannelManager {
  private channels: INotificationChannel[] = [];

  addChannel(channel: INotificationChannel): void {
    this.channels.push(channel);
  }

  /**
   * Send a notification through every registered channel.
   * Errors in one channel don't block others.
   */
  async sendAll(userId: string, title: string, body: string): Promise<void> {
    const results = await Promise.allSettled(
      this.channels.map((ch) => ch.send(userId, title, body))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[Notify] Channel delivery failed:', result.reason);
      }
    }
  }

  /**
   * Send a notification to multiple users through every channel.
   */
  async sendToMany(userIds: string[], title: string, body: string): Promise<void> {
    await Promise.allSettled(
      userIds.map((uid) => this.sendAll(uid, title, body))
    );
  }
}
