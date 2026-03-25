import { router } from './routes';
import { registerSubscribers } from './subscribers';

export { router };

/**
 * Initialise the Groups module — call once at app startup
 * to wire up event bus subscribers.
 */
export function register(): void {
  registerSubscribers();
}
