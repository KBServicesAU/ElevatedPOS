import { describe, it, expect } from 'vitest';
import { NexusApiError, NexusWebhookSignatureError, NexusNetworkError } from './errors';

describe('NexusApiError', () => {
  it('constructs with required fields', () => {
    const err = new NexusApiError(404, 'NOT_FOUND', 'Resource not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NexusApiError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
  });

  it('isNotFound() returns true for 404', () => {
    const err = new NexusApiError(404, 'NOT_FOUND', 'Not found');
    expect(err.isNotFound()).toBe(true);
    expect(err.isRateLimited()).toBe(false);
    expect(err.isServerError()).toBe(false);
  });

  it('isRateLimited() returns true for 429', () => {
    const err = new NexusApiError(429, 'RATE_LIMITED', 'Slow down');
    expect(err.isRateLimited()).toBe(true);
    expect(err.isNotFound()).toBe(false);
  });

  it('isServerError() returns true for 5xx', () => {
    const err500 = new NexusApiError(500, 'SERVER_ERROR', 'Internal error');
    const err503 = new NexusApiError(503, 'UNAVAILABLE', 'Service unavailable');
    expect(err500.isServerError()).toBe(true);
    expect(err503.isServerError()).toBe(true);
    const err400 = new NexusApiError(400, 'BAD_REQUEST', 'Bad input');
    expect(err400.isServerError()).toBe(false);
  });

  it('includes optional detail and requestId', () => {
    const err = new NexusApiError(422, 'VALIDATION', 'Validation failed', 'sku is required', 'req_abc123');
    expect(err.detail).toBe('sku is required');
    expect(err.requestId).toBe('req_abc123');
  });
});

describe('NexusWebhookSignatureError', () => {
  it('is an instance of Error', () => {
    const err = new NexusWebhookSignatureError();
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NexusWebhookSignatureError);
    expect(err.message).toMatch(/signature/i);
  });
});

describe('NexusNetworkError', () => {
  it('wraps a cause', () => {
    const cause = new Error('ECONNREFUSED');
    const err = new NexusNetworkError('Connection failed', cause);
    expect(err).toBeInstanceOf(NexusNetworkError);
    expect(err.message).toBe('Connection failed');
    expect(err.cause).toBe(cause);
  });
});
