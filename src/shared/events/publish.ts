import { v4 as uuidv4 } from 'uuid';
import { getEventBus } from './event-bus';
import { EventEnvelope } from './types';

/**
 * Helper to publish an event with the standard envelope.
 * Correlation ID can be passed from the original HTTP request,
 * or a new one is generated for system-initiated events.
 */
export async function publishEvent<T>(
  eventName: string,
  payload: T,
  correlationId?: string
): Promise<void> {
  const envelope: EventEnvelope<T> = {
    event: eventName,
    version: '1',
    timestamp: new Date().toISOString(),
    correlation_id: correlationId || uuidv4(),
    payload,
  };

  await getEventBus().publish(envelope);
}
