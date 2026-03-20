import { describe, it, expect, vi } from 'vitest';
import { WebhookHandler } from './webhooks';
import { NexusWebhookSignatureError } from './errors';

const SECRET = 'test-secret-32-chars-long-enough';

function buildSignature(secret: string, payload: string, ts: number): string {
  // Mirrors the HMAC-SHA256 logic in WebhookHandler
  const { createHmac } = require('crypto') as typeof import('crypto');
  return 'sha256=' + createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
}

describe('WebhookHandler', () => {
  it('constructs without throwing', () => {
    expect(() => new WebhookHandler(SECRET)).not.toThrow();
  });

  describe('verifySignature', () => {
    it('returns true for a valid signature', () => {
      const handler = new WebhookHandler(SECRET);
      const payload = JSON.stringify({ id: 'evt_1', type: 'order.created' });
      const ts = Date.now();
      const sig = buildSignature(SECRET, payload, ts);
      expect(handler.verifySignature(payload, sig, String(ts))).toBe(true);
    });

    it('returns false for a tampered payload', () => {
      const handler = new WebhookHandler(SECRET);
      const payload = JSON.stringify({ id: 'evt_1', type: 'order.created' });
      const ts = Date.now();
      const sig = buildSignature(SECRET, payload, ts);
      const tampered = JSON.stringify({ id: 'evt_1', type: 'order.deleted' });
      expect(handler.verifySignature(tampered, sig, String(ts))).toBe(false);
    });

    it('returns false for an expired timestamp (> 5 minutes)', () => {
      const handler = new WebhookHandler(SECRET);
      const payload = JSON.stringify({ id: 'evt_old' });
      const oldTs = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      const sig = buildSignature(SECRET, payload, oldTs);
      expect(handler.verifySignature(payload, sig, String(oldTs))).toBe(false);
    });

    it('returns false for a wrong secret', () => {
      const handler = new WebhookHandler('different-secret-here');
      const payload = JSON.stringify({ id: 'evt_2' });
      const ts = Date.now();
      const sig = buildSignature(SECRET, payload, ts);
      expect(handler.verifySignature(payload, sig, String(ts))).toBe(false);
    });
  });

  describe('parseEvent', () => {
    it('parses a valid order.created event', () => {
      const handler = new WebhookHandler(SECRET);
      const raw = JSON.stringify({ id: 'evt_3', type: 'order.created', data: { orderId: 'ord_1' }, timestamp: new Date().toISOString(), merchantId: 'org_1' });
      const ts = Date.now();
      const sig = buildSignature(SECRET, raw, ts);
      const event = handler.parseEvent(raw, sig, String(ts));
      expect(event.type).toBe('order.created');
      expect(event.id).toBe('evt_3');
    });

    it('throws NexusWebhookSignatureError for invalid signature', () => {
      const handler = new WebhookHandler(SECRET);
      const raw = JSON.stringify({ id: 'evt_4', type: 'order.created', data: {}, timestamp: new Date().toISOString(), merchantId: 'org_1' });
      expect(() => handler.parseEvent(raw, 'sha256=bad', String(Date.now()))).toThrow(NexusWebhookSignatureError);
    });
  });

  describe('on / handle', () => {
    it('calls registered handler for matching event type', async () => {
      const handler = new WebhookHandler(SECRET);
      const spy = vi.fn();
      handler.on('order.created', spy);

      const payload = { id: 'evt_5', type: 'order.created' as const, data: { orderId: 'ord_5' }, timestamp: new Date().toISOString(), merchantId: 'org_1' };
      const raw = JSON.stringify(payload);
      const ts = Date.now();
      const sig = buildSignature(SECRET, raw, ts);

      await handler.handle(raw, sig, String(ts));
      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0]).toMatchObject({ type: 'order.created' });
    });

    it('does not call handler for non-matching event type', async () => {
      const handler = new WebhookHandler(SECRET);
      const spy = vi.fn();
      handler.on('payment.captured', spy);

      const payload = { id: 'evt_6', type: 'order.created' as const, data: {}, timestamp: new Date().toISOString(), merchantId: 'org_1' };
      const raw = JSON.stringify(payload);
      const ts = Date.now();
      const sig = buildSignature(SECRET, raw, ts);

      await handler.handle(raw, sig, String(ts));
      expect(spy).not.toHaveBeenCalled();
    });

    it('removes handler after off() is called', async () => {
      const handler = new WebhookHandler(SECRET);
      const spy = vi.fn();
      handler.on('order.completed', spy);
      handler.off('order.completed', spy);

      const payload = { id: 'evt_7', type: 'order.completed' as const, data: {}, timestamp: new Date().toISOString(), merchantId: 'org_1' };
      const raw = JSON.stringify(payload);
      const ts = Date.now();
      const sig = buildSignature(SECRET, raw, ts);

      await handler.handle(raw, sig, String(ts));
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
