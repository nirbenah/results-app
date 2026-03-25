export { router } from './routes';
export { registerSubscribers } from './subscribers';

/**
 * Module bootstrap — call once at app startup.
 * Registers the Express router and wires up event subscribers.
 */
export function register(app: { use(path: string, ...handlers: unknown[]): void }): void {
  const { router } = require('./routes');
  const { registerSubscribers } = require('./subscribers');

  app.use('/v1', router);
  registerSubscribers();
}
