/**
 * services/config/eventbus.ts
 * Genesis Reserve — Domain Event Bus (Kafka)
 *
 * Publishes structured domain events for:
 *   - Ledger updates (DEPOSIT, RESERVE, SETTLE, YIELD)
 *   - Compliance events (KYC_COMPLETE, SANCTION_HIT)
 *   - Remittance lifecycle (ORDER_CREATED, IN_TRANSIT, SETTLED)
 *   - Protocol events (HARVEST, REBALANCE, CIRCUIT_BREAKER)
 *
 * In development, falls back to an in-process EventEmitter when
 * Kafka is not available (controlled by KAFKA_ENABLED env var).
 */

import { EventEmitter } from 'events';
import { logger }       from './logger';

// ── Domain event types ────────────────────────────────────────────────────────

export type DomainEventType =
  // Ledger
  | 'ledger.deposit'
  | 'ledger.withdrawal'
  | 'ledger.reserve'
  | 'ledger.release'
  | 'ledger.settlement'
  | 'ledger.yield'
  | 'ledger.reconciliation_alert'
  // Compliance
  | 'compliance.kyc_complete'
  | 'compliance.sanction_hit'
  | 'compliance.travel_rule'
  // Remittance
  | 'remittance.order_created'
  | 'remittance.in_transit'
  | 'remittance.settled'
  | 'remittance.failed'
  | 'remittance.compliance_hold'
  // Protocol (from on-chain events)
  | 'protocol.deposit'
  | 'protocol.withdrawal'
  | 'protocol.harvest'
  | 'protocol.rebalance'
  | 'protocol.circuit_breaker'

export interface DomainEvent<T = unknown> {
  eventId:     string;
  eventType:   DomainEventType;
  aggregateId: string;           // Account ID, Order ID, etc.
  payload:     T;
  metadata: {
    source:      string;
    correlationId?: string;
    traceId?:    string;
    timestamp:   string;         // ISO 8601
    version:     number;
  };
}

// ── EventBus implementation ───────────────────────────────────────────────────

const KAFKA_ENABLED = process.env.KAFKA_ENABLED !== 'false' &&
                      !!process.env.KAFKA_BROKERS;

class InProcessEventBus extends EventEmitter {
  async publish<T>(event: DomainEvent<T>): Promise<void> {
    this.emit(event.eventType, event);
    this.emit('*', event);  // wildcard subscription for logging/monitoring
    logger.debug({ eventType: event.eventType, aggregateId: event.aggregateId }, 'Event published');
  }

  async subscribe(
    eventType: DomainEventType | '*',
    handler: (event: DomainEvent) => void | Promise<void>
  ): Promise<void> {
    this.on(eventType, handler);
  }

  async connect(): Promise<void> {
    logger.info('EventBus: using in-process emitter (Kafka disabled)');
  }

  async disconnect(): Promise<void> {}
}

// Lazy-load Kafka only when explicitly enabled — avoids startup crashes
// when Kafka is not running (common in development)
async function createKafkaBus() {
  const { Kafka, Partitioners } = await import('kafkajs');
  const kafka = new Kafka({
    clientId:  'genesis-api',
    brokers:   (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    retry: { retries: 5, initialRetryTime: 300, factor: 0.2 },
  });

  const producer = kafka.producer({
    createPartitioner: Partitioners.LegacyPartitioner,
    allowAutoTopicCreation: true,
  });

  await producer.connect();
  logger.info({ brokers: process.env.KAFKA_BROKERS }, 'EventBus: Kafka producer connected');

  return {
    async publish<T>(event: DomainEvent<T>): Promise<void> {
      await producer.send({
        topic:    event.eventType,
        messages: [{
          key:   event.aggregateId,
          value: JSON.stringify(event),
          headers: { 'event-version': String(event.metadata.version) },
        }],
      });
    },
    async subscribe(): Promise<void> {
      // Consumer setup handled separately in event-processor service
    },
    async connect(): Promise<void> {},
    async disconnect(): Promise<void> {
      await producer.disconnect();
    },
  };
}

// ── Singleton bus instance ────────────────────────────────────────────────────

let _bus: {
  publish: <T>(event: DomainEvent<T>) => Promise<void>;
  subscribe: (type: DomainEventType | '*', handler: (e: DomainEvent) => void | Promise<void>) => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
} | null = null;

export class EventBus {
  static async getInstance() {
    if (!_bus) {
      if (KAFKA_ENABLED) {
        _bus = await createKafkaBus();
      } else {
        const bus = new InProcessEventBus();
        await bus.connect();
        _bus = bus;
      }
    }
    return _bus;
  }

  static async publish<T>(event: DomainEvent<T>): Promise<void> {
    const bus = await EventBus.getInstance();
    await bus.publish(event);
  }

  static makeEvent<T>(
    eventType: DomainEventType,
    aggregateId: string,
    payload: T,
    correlationId?: string
  ): DomainEvent<T> {
    return {
      eventId:     `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      eventType,
      aggregateId,
      payload,
      metadata: {
        source:        process.env.SERVICE_NAME || 'genesis-api',
        correlationId,
        timestamp:     new Date().toISOString(),
        version:       1,
      },
    };
  }
}
