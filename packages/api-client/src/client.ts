import ky, { type KyInstance, type Options } from 'ky';
import { NexusApiError } from './errors';
import type { AuthTokens } from './types';

interface NexusClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null;
  onTokenRefreshed?: (tokens: AuthTokens) => void;
  onUnauthorized?: () => void;
}

export function createNexusClient(options: NexusClientOptions): KyInstance {
  const { baseUrl, getAccessToken, onUnauthorized } = options;

  return ky.create({
    prefixUrl: baseUrl,
    timeout: 30_000,
    hooks: {
      beforeRequest: [
        (request) => {
          const token = getAccessToken?.();
          if (token) {
            request.headers.set('Authorization', `Bearer ${token}`);
          }
          request.headers.set('X-Nexus-Version', '1');
        },
      ],
      afterResponse: [
        async (_request, _options, response) => {
          if (!response.ok) {
            let errorBody: { type?: string; title?: string; detail?: string } = {};
            try {
              errorBody = (await response.json()) as typeof errorBody;
            } catch {
              // ignore parse error
            }

            if (response.status === 401) {
              onUnauthorized?.();
            }

            throw new NexusApiError(
              response.status,
              errorBody.type ?? 'about:blank',
              errorBody.title ?? response.statusText,
              errorBody.detail,
            );
          }
        },
      ],
    },
  });
}
