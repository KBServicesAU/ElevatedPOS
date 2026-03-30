/**
 * Kafka event consumer for the automations service.
 *
 * Subscribes to the NEXUS domain topics and, for each incoming event, queries
 * the database for enabled automation rules whose `trigger` matches the event
 * type.  Matching rules are evaluated against the event payload's conditions
 * and, if they pass, inserted as pending execution records.
 *
 * Graceful degradation: if Kafka is not reachable the consumer logs a warning
 * and exits without crashing the main process.
 */

import { Kafka, Consumer, logLevel, EachMessagePayload } from 'kafkajs';
import { eq, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { evaluateConditions, type Condition } from './utils.js';

// ─── Topic → automation trigger mapping ──────────────────────────────────────

/**
 * Maps a NEXUS event type (the `eventType` field in the envelope) to the
 * `automation_trigger` enum value stored in the database.
 *
 * Only event types that have a corresponding trigger enum value are
 * actionable; all others are silently ignored.
 */
const EVENT_TYPE_TO_TRIGGER: Record<string, string> = {
  'order.completed': 'order_completed',
  'customer.created': 'customer_created',
  'loyalty.tier_changed': 'loyalty_tier_changed',
  'stock.low': 'low_stock',
  // 'birthday' is scheduled externally, not triggered by a Kafka event
};

// ─── Topics to subscribe to ───────────────────────────────────────────────────

const SUBSCRIBED_TOPICS = [
  'nexus.orders',
  'nexus.inventory',
  'nexus.customers',
  'nexus.loyalty',
] as const;

// ─── Consumer group ───────────────────────────────────────────────────────────

const CONSUMER_GROUP = 'nexus-automations-consumer';

// ─── Internal state ───────────────────────────────────────────────────────────

let consumer: Consumer | null = null;

// ─── Message handler ──────────────────────────────────────────────────────────

/**
 * Process a single Kafka message.  Parses the JSON envelope, resolves the
 * matching trigger, queries enabled rules, evaluates conditions, and inserts
 * pending execution records for every rule that passes.
 */
async function handleMessage({ topic, message }: EachMessagePayload): Promise<void> {
  if (!message.value) return;

  let envelope: Record<string, unknown>;
  try {
    envelope = JSON.parse(message.value.toString()) as Record<string, unknown>;
  } catch {
    console.warn('[automations/consumer] Could not parse message on topic', topic);
    return;
  }

  const eventType = typeof envelope['eventType'] === 'string' ? envelope['eventType'] : undefined;
  const orgId = typeof envelope['orgId'] === 'string' ? envelope['orgId'] : undefined;
  const payload = (envelope['payload'] ?? {}) as Record<string, unknown>;

  if (!eventType || !orgId) {
    // Not a valid NEXUS event envelope — skip silently
    return;
  }

  const trigger = EVENT_TYPE_TO_TRIGGER[eventType];
  if (!trigger) {
    // No automation trigger mapped for this event type — nothing to do
    return;
  }

  // Fetch all enabled rules for this org and trigger
  let matchingRules: (typeof schema.automationRules.$inferSelect)[];
  try {
    matchingRules = await db.query.automationRules.findMany({
      where: and(
        eq(schema.automationRules.orgId, orgId),
        eq(schema.automationRules.trigger, trigger as 'order_completed' | 'customer_created' | 'loyalty_tier_changed' | 'low_stock' | 'birthday'),
        eq(schema.automationRules.enabled, true),
      ),
    });
  } catch (err) {
    console.error('[automations/consumer] DB query failed for trigger', trigger, err);
    return;
  }

  if (matchingRules.length === 0) return;

  // Build evaluation context from the event payload merged with top-level
  // envelope fields (so conditions can test e.g. `locationId` too)
  const context: Record<string, unknown> = {
    ...payload,
    eventType,
    orgId,
    locationId: envelope['locationId'],
  };

  // Evaluate conditions and collect rules that pass
  const passingRules = matchingRules.filter((rule) => {
    const conditions = Array.isArray(rule.conditions) ? (rule.conditions as Condition[]) : [];
    try {
      return evaluateConditions(conditions, context, 'AND');
    } catch {
      // If condition evaluation throws (malformed condition), skip rule
      return false;
    }
  });

  if (passingRules.length === 0) return;

  // Insert pending execution records for all passing rules
  try {
    await db.insert(schema.automationExecutions).values(
      passingRules.map((rule) => ({
        orgId,
        ruleId: rule.id,
        triggerPayload: context,
        status: 'pending' as const,
      })),
    );
    console.info(
      `[automations/consumer] Queued ${passingRules.length} execution(s) for trigger "${trigger}" (org: ${orgId})`,
    );
  } catch (err) {
    console.error('[automations/consumer] Failed to insert execution records', err);
  }
}

// ─── Start / stop ─────────────────────────────────────────────────────────────

/**
 * Initialise and start the Kafka consumer.
 *
 * This function is non-blocking: it resolves as soon as the consumer is
 * subscribed and begins processing messages in the background.
 *
 * If `KAFKA_BROKERS` is not set the function logs a warning and returns
 * without creating a consumer (graceful degradation for local dev).
 */
export async function startEventConsumer(): Promise<void> {
  const brokers = process.env['KAFKA_BROKERS'];
  if (!brokers) {
    console.warn(
      '[automations/consumer] KAFKA_BROKERS not set — event consumer disabled',
    );
    return;
  }

  try {
    const kafka = new Kafka({
      clientId: 'nexus-automations',
      brokers: brokers.split(','),
      logLevel: logLevel.WARN,
    });

    consumer = kafka.consumer({ groupId: CONSUMER_GROUP });
    await consumer.connect();

    // Subscribe to all relevant domain topics
    for (const topic of SUBSCRIBED_TOPICS) {
      await consumer.subscribe({ topic, fromBeginning: false });
    }

    // Start consuming — runs indefinitely in the background
    await consumer.run({
      autoCommit: true,
      eachMessage: async (payload) => {
        try {
          await handleMessage(payload);
        } catch (err) {
          // Per-message errors must not crash the consumer loop
          console.error('[automations/consumer] Unhandled error in message handler', err);
        }
      },
    });

    console.info(
      `[automations/consumer] Started — group: ${CONSUMER_GROUP}, topics: ${SUBSCRIBED_TOPICS.join(', ')}`,
    );

    // Graceful shutdown on SIGTERM (Docker / Kubernetes)
    process.once('SIGTERM', async () => {
      await stopEventConsumer();
    });
  } catch (err) {
    console.warn('[automations/consumer] Failed to start Kafka consumer — continuing without it', err);
    // Disconnect partially-connected consumer if needed
    if (consumer) {
      try { await consumer.disconnect(); } catch { /* ignore */ }
      consumer = null;
    }
  }
}

/**
 * Gracefully disconnect the consumer.  Safe to call even if the consumer
 * was never started.
 */
export async function stopEventConsumer(): Promise<void> {
  if (consumer) {
    try {
      await consumer.disconnect();
      console.info('[automations/consumer] Disconnected');
    } catch (err) {
      console.error('[automations/consumer] Error during disconnect', err);
    } finally {
      consumer = null;
    }
  }
}
