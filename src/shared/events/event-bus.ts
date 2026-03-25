import { EventEnvelope } from './types';

/**
 * EventBus interface — the contract all adapters must implement.
 * Phase 1: InMemoryEventBus (below).
 * Phase 2+: Swap to RabbitMqEventBus or KafkaEventBus — same interface.
 */
export interface IEventBus {
  publish(envelope: EventEnvelope): Promise<void>;
  subscribe(eventName: string, handler: (envelope: EventEnvelope) => Promise<void>): void;
}

type EventHandler = (envelope: EventEnvelope) => Promise<void>;

/**
 * In-memory event bus for Phase 1 (modular monolith).
 * All events are dispatched asynchronously within the same process.
 * Handlers run concurrently and errors are logged, not thrown — matching
 * the behavior of a real message queue where consumers are independent.
 */
export class InMemoryEventBus implements IEventBus {
  private handlers: Map<string, EventHandler[]> = new Map();

  async publish(envelope: EventEnvelope): Promise<void> {
    const handlers = this.handlers.get(envelope.event) || [];

    // Fire all handlers concurrently — don't let one failure block others
    const results = await Promise.allSettled(
      handlers.map((handler) => handler(envelope))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error(
          `[EventBus] Handler failed for "${envelope.event}":`,
          result.reason
        );
      }
    }
  }

  subscribe(eventName: string, handler: EventHandler): void {
    const existing = this.handlers.get(eventName) || [];
    existing.push(handler);
    this.handlers.set(eventName, existing);
  }
}

// Singleton instance — shared across all modules
let eventBus: IEventBus;

export function getEventBus(): IEventBus {
  if (!eventBus) {
    eventBus = new InMemoryEventBus();
  }
  return eventBus;
}
