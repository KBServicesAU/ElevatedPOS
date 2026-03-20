export class NexusApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly detail: string | undefined;
  readonly requestId: string | undefined;

  constructor(options: {
    message: string;
    statusCode: number;
    code: string;
    detail?: string;
    requestId?: string;
  }) {
    super(options.message);
    this.name = 'NexusApiError';
    this.statusCode = options.statusCode;
    this.code = options.code;
    this.detail = options.detail;
    this.requestId = options.requestId;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  isNotFound(): boolean {
    return this.statusCode === 404;
  }

  isUnauthorized(): boolean {
    return this.statusCode === 401;
  }

  isForbidden(): boolean {
    return this.statusCode === 403;
  }

  isValidationError(): boolean {
    return this.statusCode === 422;
  }

  isRateLimited(): boolean {
    return this.statusCode === 429;
  }

  isServerError(): boolean {
    return this.statusCode >= 500;
  }

  toString(): string {
    return `NexusApiError [${this.statusCode}/${this.code}]: ${this.message}${this.detail ? ` — ${this.detail}` : ''}`;
  }
}

export class NexusWebhookSignatureError extends Error {
  constructor(message = 'Webhook signature verification failed') {
    super(message);
    this.name = 'NexusWebhookSignatureError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class NexusNetworkError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'NexusNetworkError';
    this.cause = cause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
