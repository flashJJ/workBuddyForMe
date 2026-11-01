import type { SearchSettings, WebSearchInput, WebSearchResponse } from '@wbfm/shared/types';

export type SearchErrorReason =
  | 'not_configured'
  | 'auth_failed'
  | 'rate_limited'
  | 'unreachable'
  | 'invalid_response'
  | 'blocked';

export class SearchError extends Error {
  readonly reason: SearchErrorReason;
  readonly status?: number;

  constructor(reason: SearchErrorReason, message: string, status?: number) {
    super(message);
    this.name = 'SearchError';
    this.reason = reason;
    this.status = status;
  }
}

export interface SearchProvider {
  readonly id: string;
  search(input: WebSearchInput, signal?: AbortSignal): Promise<WebSearchResponse>;
  testConnection(): Promise<{ ok: boolean; message: string }>;
}

export type { SearchSettings };
