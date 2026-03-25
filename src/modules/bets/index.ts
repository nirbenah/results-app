import router from './routes';
import { registerSubscribers } from './subscribers';

export { router };

/**
 * Initialise the Bets module: mount event subscribers.
 * Call this once at application startup after the event bus is available.
 */
export function register(): void {
  registerSubscribers();
}
