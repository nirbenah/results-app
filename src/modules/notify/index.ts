export { INotificationChannel, InAppChannel, ChannelManager } from './channels';
export { registerSubscribers } from './subscribers';

import { ChannelManager, InAppChannel } from './channels';
import { registerSubscribers } from './subscribers';

/**
 * Module bootstrap — call once at app startup.
 * Creates the channel manager with default channels and wires up subscribers.
 */
export function register(): ChannelManager {
  const channelManager = new ChannelManager();
  channelManager.addChannel(new InAppChannel());

  registerSubscribers(channelManager);

  return channelManager;
}
