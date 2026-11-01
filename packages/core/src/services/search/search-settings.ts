import {
  SEARCH_PROVIDER_KINDS,
  SEARCH_MAX_RESULTS_MIN,
  SEARCH_MAX_RESULTS_MAX,
  SEARCH_MAX_RESULTS_DEFAULT,
  SEARCH_TIMEOUT_MIN_MS,
  SEARCH_TIMEOUT_MAX_MS,
  SEARCH_TIMEOUT_DEFAULT_MS,
} from '@wbfm/shared/constants';
import type { SearchSettings } from '@wbfm/shared/types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** 服务端钳制搜索设置：手改 settings_kv 的非法值一律回落到安全默认 */
export function resolveSearchSettings(value: unknown): SearchSettings {
  const raw = value && typeof value === 'object' ? (value as Partial<SearchSettings>) : {};
  const provider =
    typeof raw.provider === 'string' &&
    (SEARCH_PROVIDER_KINDS as readonly string[]).includes(raw.provider)
      ? (raw.provider as SearchSettings['provider'])
      : 'none';
  return {
    provider,
    endpoint: typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '',
    maxResults:
      typeof raw.maxResults === 'number' && Number.isFinite(raw.maxResults)
        ? clamp(Math.trunc(raw.maxResults), SEARCH_MAX_RESULTS_MIN, SEARCH_MAX_RESULTS_MAX)
        : SEARCH_MAX_RESULTS_DEFAULT,
    timeoutMs:
      typeof raw.timeoutMs === 'number' && Number.isFinite(raw.timeoutMs)
        ? clamp(Math.trunc(raw.timeoutMs), SEARCH_TIMEOUT_MIN_MS, SEARCH_TIMEOUT_MAX_MS)
        : SEARCH_TIMEOUT_DEFAULT_MS,
    allowPrivateEndpoint: raw.allowPrivateEndpoint === true,
  };
}

export const DEFAULT_SEARCH_SETTINGS: SearchSettings = resolveSearchSettings({});
