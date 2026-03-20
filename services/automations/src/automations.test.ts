import { describe, it, expect } from 'vitest';

// Unit tests for automations business logic

type AutomationTrigger =
  | 'order_completed'
  | 'customer_created'
  | 'loyalty_tier_changed'
  | 'low_stock'
  | 'birthday';

type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

function triggerLabel(trigger: AutomationTrigger): string {
  const labels: Record<AutomationTrigger, string> = {
    order_completed: 'Order Completed',
    customer_created: 'Customer Created',
    loyalty_tier_changed: 'Loyalty Tier Changed',
    low_stock: 'Low Stock',
    birthday: 'Birthday',
  };
  return labels[trigger];
}

function isValidTrigger(value: string): value is AutomationTrigger {
  return [
    'order_completed',
    'customer_created',
    'loyalty_tier_changed',
    'low_stock',
    'birthday',
  ].includes(value);
}

type Condition = { field: string; op: 'eq' | 'gt' | 'lt' | 'contains'; value: unknown };

function evaluateCondition(condition: Condition, payload: Record<string, unknown>): boolean {
  const actual = payload[condition.field];
  switch (condition.op) {
    case 'eq':
      return actual === condition.value;
    case 'gt':
      return typeof actual === 'number' && actual > (condition.value as number);
    case 'lt':
      return typeof actual === 'number' && actual < (condition.value as number);
    case 'contains':
      return typeof actual === 'string' && actual.includes(condition.value as string);
    default:
      return false;
  }
}

function evaluateConditions(
  conditions: Condition[],
  payload: Record<string, unknown>,
): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((c) => evaluateCondition(c, payload));
}

function executionStatusBadge(status: ExecutionStatus): 'blue' | 'yellow' | 'green' | 'red' {
  const map: Record<ExecutionStatus, 'blue' | 'yellow' | 'green' | 'red'> = {
    pending: 'yellow',
    running: 'blue',
    completed: 'green',
    failed: 'red',
  };
  return map[status];
}

function canRetry(status: ExecutionStatus): boolean {
  return status === 'failed';
}

function estimateNextRun(
  trigger: AutomationTrigger,
  lastRunAt: string | undefined,
): string {
  // For event-driven triggers, next run is whenever the event fires
  if (trigger !== 'birthday') return 'On next event';
  // Birthday runs annually
  if (!lastRunAt) return 'Not yet run';
  const last = new Date(lastRunAt);
  const next = new Date(last);
  next.setFullYear(next.getFullYear() + 1);
  return next.toISOString().split('T')[0];
}

function summariseActions(actions: Array<{ type: string }>): string {
  if (actions.length === 0) return 'No actions';
  if (actions.length === 1) return `1 action: ${actions[0].type}`;
  return `${actions.length} actions`;
}

describe('triggerLabel', () => {
  it('returns correct label for order_completed', () => {
    expect(triggerLabel('order_completed')).toBe('Order Completed');
  });

  it('returns correct label for loyalty_tier_changed', () => {
    expect(triggerLabel('loyalty_tier_changed')).toBe('Loyalty Tier Changed');
  });

  it('returns correct label for birthday', () => {
    expect(triggerLabel('birthday')).toBe('Birthday');
  });

  it('covers all trigger types', () => {
    const triggers: AutomationTrigger[] = [
      'order_completed',
      'customer_created',
      'loyalty_tier_changed',
      'low_stock',
      'birthday',
    ];
    triggers.forEach((t) => {
      expect(triggerLabel(t)).toBeTruthy();
    });
  });
});

describe('isValidTrigger', () => {
  it('accepts known trigger names', () => {
    expect(isValidTrigger('order_completed')).toBe(true);
    expect(isValidTrigger('birthday')).toBe(true);
  });

  it('rejects unknown trigger names', () => {
    expect(isValidTrigger('purchase_made')).toBe(false);
    expect(isValidTrigger('')).toBe(false);
  });
});

describe('evaluateCondition', () => {
  it('evaluates eq condition correctly', () => {
    expect(evaluateCondition({ field: 'status', op: 'eq', value: 'active' }, { status: 'active' })).toBe(true);
    expect(evaluateCondition({ field: 'status', op: 'eq', value: 'active' }, { status: 'inactive' })).toBe(false);
  });

  it('evaluates gt condition correctly', () => {
    expect(evaluateCondition({ field: 'total', op: 'gt', value: 100 }, { total: 150 })).toBe(true);
    expect(evaluateCondition({ field: 'total', op: 'gt', value: 100 }, { total: 50 })).toBe(false);
  });

  it('evaluates lt condition correctly', () => {
    expect(evaluateCondition({ field: 'stock', op: 'lt', value: 10 }, { stock: 5 })).toBe(true);
    expect(evaluateCondition({ field: 'stock', op: 'lt', value: 10 }, { stock: 15 })).toBe(false);
  });

  it('evaluates contains condition correctly', () => {
    expect(evaluateCondition({ field: 'tier', op: 'contains', value: 'gold' }, { tier: 'gold-plus' })).toBe(true);
    expect(evaluateCondition({ field: 'tier', op: 'contains', value: 'gold' }, { tier: 'silver' })).toBe(false);
  });
});

describe('evaluateConditions', () => {
  it('returns true when conditions array is empty', () => {
    expect(evaluateConditions([], { anything: 'value' })).toBe(true);
  });

  it('returns true only when all conditions pass', () => {
    const conditions: Condition[] = [
      { field: 'total', op: 'gt', value: 50 },
      { field: 'status', op: 'eq', value: 'paid' },
    ];
    expect(evaluateConditions(conditions, { total: 100, status: 'paid' })).toBe(true);
    expect(evaluateConditions(conditions, { total: 100, status: 'pending' })).toBe(false);
  });
});

describe('executionStatusBadge', () => {
  it('maps pending to yellow', () => {
    expect(executionStatusBadge('pending')).toBe('yellow');
  });

  it('maps running to blue', () => {
    expect(executionStatusBadge('running')).toBe('blue');
  });

  it('maps completed to green', () => {
    expect(executionStatusBadge('completed')).toBe('green');
  });

  it('maps failed to red', () => {
    expect(executionStatusBadge('failed')).toBe('red');
  });
});

describe('canRetry', () => {
  it('allows retry for failed executions', () => {
    expect(canRetry('failed')).toBe(true);
  });

  it('does not allow retry for completed executions', () => {
    expect(canRetry('completed')).toBe(false);
  });

  it('does not allow retry for pending or running', () => {
    expect(canRetry('pending')).toBe(false);
    expect(canRetry('running')).toBe(false);
  });
});

describe('estimateNextRun', () => {
  it('returns "On next event" for event-driven triggers', () => {
    expect(estimateNextRun('order_completed', undefined)).toBe('On next event');
    expect(estimateNextRun('low_stock', '2026-01-01T00:00:00Z')).toBe('On next event');
  });

  it('returns "Not yet run" for birthday trigger with no last run', () => {
    expect(estimateNextRun('birthday', undefined)).toBe('Not yet run');
  });

  it('returns next year date for birthday trigger', () => {
    const result = estimateNextRun('birthday', '2025-03-15T00:00:00Z');
    expect(result).toBe('2026-03-15');
  });
});

describe('summariseActions', () => {
  it('returns "No actions" for empty array', () => {
    expect(summariseActions([])).toBe('No actions');
  });

  it('returns singular form for one action', () => {
    expect(summariseActions([{ type: 'send_email' }])).toBe('1 action: send_email');
  });

  it('returns count for multiple actions', () => {
    expect(summariseActions([{ type: 'send_email' }, { type: 'add_points' }, { type: 'update_tag' }])).toBe('3 actions');
  });
});
