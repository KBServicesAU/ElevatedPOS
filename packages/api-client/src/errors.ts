export class NexusApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly type: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = 'NexusApiError';
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isValidationError() {
    return this.status === 422;
  }

  get isServerError() {
    return this.status >= 500;
  }
}
