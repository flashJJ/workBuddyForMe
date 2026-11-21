import type { AppSettings, SearchSettings } from '@wbfm/shared/types';
import {
  RESEARCH_DEPTH_DEFAULT,
  SEARCH_MAX_RESULTS_DEFAULT,
  SEARCH_TIMEOUT_DEFAULT_MS,
  WEB_FETCH_MAX_BYTES_DEFAULT,
} from '@wbfm/shared/constants';
import { apiGet } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

const FALLBACK: SearchSettings = {
  provider: 'none',
  endpoint: '',
  maxResults: SEARCH_MAX_RESULTS_DEFAULT,
  timeoutMs: SEARCH_TIMEOUT_DEFAULT_MS,
  allowPrivateEndpoint: false,
  fetchMaxBytes: WEB_FETCH_MAX_BYTES_DEFAULT,
  researchDepth: RESEARCH_DEPTH_DEFAULT,
};

/**
 * v4.16：一键部署成功后，算出要写回的新搜索设置。
 * 调用方用设置更新 mutation 落库（复用跨窗口广播与缓存失效）。
 */
export async function resolveSearxngDeploySettings(endpoint: string): Promise<SearchSettings> {
  const settings = await apiGet<AppSettings>(API.settings);
  return {
    ...(settings.searchSettings ?? FALLBACK),
    provider: 'searxng',
    endpoint,
    allowPrivateEndpoint: true,
  };
}
