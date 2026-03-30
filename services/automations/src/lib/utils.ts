/**
 * Automations utility functions — pure, side-effect-free helpers.
 */

// ─── evaluateCondition ────────────────────────────────────────────────────────

export type ConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'starts_with' | 'ends_with' | 'in';

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
}

/**
 * Evaluates a single condition object against a context object.
 * Safely returns false when the field does not exist or types are incompatible.
 */
export function evaluateCondition(
  condition: Condition,
  context: Record<string, unknown>,
): boolean {
  const actual = context[condition.field];
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
      return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
    case 'gte':
      return typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
    case 'lt':
      return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
    case 'lte':
      return typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
    case 'contains':
      return typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
    case 'starts_with':
      return typeof actual === 'string' && typeof expected === 'string' && actual.startsWith(expected);
    case 'ends_with':
      return typeof actual === 'string' && typeof expected === 'string' && actual.endsWith(expected);
    case 'in':
      return Array.isArray(expected) && expected.includes(actual);
    default:
      return false;
  }
}

// ─── evaluateConditions ───────────────────────────────────────────────────────

export type LogicOperator = 'AND' | 'OR';

/**
 * Evaluates an array of conditions against a context using AND or OR logic.
 * Returns true if the conditions array is empty (no constraints).
 */
export function evaluateConditions(
  conditions: Condition[],
  context: Record<string, unknown>,
  logic: LogicOperator = 'AND',
): boolean {
  if (conditions.length === 0) return true;

  if (logic === 'AND') {
    return conditions.every((c) => evaluateCondition(c, context));
  }
  return conditions.some((c) => evaluateCondition(c, context));
}

// ─── buildTriggerKey ──────────────────────────────────────────────────────────

/**
 * Builds a deduplication key for a trigger event, combining the automation
 * ID and the source event ID with a colon separator.
 */
export function buildTriggerKey(automationId: string, eventId: string): string {
  return `automation:${automationId}:event:${eventId}`;
}

// ─── isWithinSchedule ─────────────────────────────────────────────────────────

export interface Schedule {
  /** ISO 8601 datetime — automation becomes active at or after this time */
  startAt?: string;
  /** ISO 8601 datetime — automation becomes inactive at or after this time */
  endAt?: string;
  /** Days of week automation is allowed to run: 0=Sun, 1=Mon … 6=Sat */
  daysOfWeek?: number[];
  /** Hour-of-day window (inclusive) in which the automation may fire */
  hourStart?: number;
  hourEnd?: number;
}

/**
 * Returns true if the supplied Date falls within all constraints defined in
 * the schedule. Missing constraints are treated as unbounded.
 */
export function isWithinSchedule(schedule: Schedule, now: Date = new Date()): boolean {
  if (schedule.startAt && now < new Date(schedule.startAt)) return false;
  if (schedule.endAt && now >= new Date(schedule.endAt)) return false;

  if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
    if (!schedule.daysOfWeek.includes(now.getDay())) return false;
  }

  if (schedule.hourStart !== undefined && now.getHours() < schedule.hourStart) return false;
  if (schedule.hourEnd !== undefined && now.getHours() > schedule.hourEnd) return false;

  return true;
}

// ─── parseActionConfig ────────────────────────────────────────────────────────

export type ActionType = 'send_email' | 'send_sms' | 'send_push' | 'add_loyalty_points' | 'add_tag' | 'webhook';

export interface ParsedActionConfig {
  type: ActionType;
  config: Record<string, unknown>;
}

export interface ActionParseResult {
  valid: boolean;
  parsed?: ParsedActionConfig;
  error?: string;
}

const REQUIRED_FIELDS: Record<ActionType, string[]> = {
  send_email: ['to', 'subject', 'body'],
  send_sms: ['to', 'body'],
  send_push: ['title', 'body'],
  add_loyalty_points: ['accountId', 'points'],
  add_tag: ['customerId', 'tag'],
  webhook: ['url', 'method'],
};

/**
 * Validates and parses an action config object for the given action type.
 * Returns a validation result indicating missing required fields.
 */
export function parseActionConfig(
  type: ActionType,
  config: Record<string, unknown>,
): ActionParseResult {
  const required = REQUIRED_FIELDS[type];
  if (!required) {
    return { valid: false, error: `Unknown action type: ${type}` };
  }

  const missing = required.filter((f) => config[f] === undefined || config[f] === null || config[f] === '');
  if (missing.length > 0) {
    return { valid: false, error: `Missing required fields: ${missing.join(', ')}` };
  }

  return { valid: true, parsed: { type, config } };
}

// ─── computeRetryDelay ────────────────────────────────────────────────────────

const RETRY_DELAYS_MS: Record<number, number> = {
  1: 60_000,        // 1 minute
  2: 300_000,       // 5 minutes
  3: 1_800_000,     // 30 minutes
  4: 7_200_000,     // 2 hours
  5: 86_400_000,    // 24 hours
};

/**
 * Returns the retry delay in milliseconds for a given attempt number.
 * Uses fixed exponential backoff schedule: 1m, 5m, 30m, 2h, 24h.
 * For attempt > 5 returns the maximum delay (24h).
 */
export function computeRetryDelay(attempt: number): number {
  if (attempt <= 0) return RETRY_DELAYS_MS[1];
  return RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[5];
}
