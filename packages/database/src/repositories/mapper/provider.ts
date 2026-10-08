import type { Provider, ProviderModel } from '@wbfm/shared/types';
import type {
  ModelCapability,
  ProviderProtocol,
} from '@wbfm/shared/constants';
import { parseJsonArray } from './common';

/** 仓储对外暴露的供应商记录（不含密文；hasApiKey 供服务层判断） */
export interface ProviderRecord extends Omit<Provider, 'apiKeyMasked'> {
  hasApiKey: boolean;
}

export interface ProviderRow {
  id: string;
  name: string;
  protocol: ProviderProtocol;
  base_url: string;
  api_key_cipher: string | null;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ModelRow {
  id: string;
  provider_id: string;
  model_id: string;
  display_name: string;
  capabilities: string;
  context_window: number | null;
  created_at: string;
}

export function mapProvider(row: ProviderRow): ProviderRecord {
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol,
    baseUrl: row.base_url,
    enabled: row.enabled === 1,
    sortOrder: row.sort_order,
    hasApiKey: row.api_key_cipher !== null && row.api_key_cipher !== '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapModel(row: ModelRow): ProviderModel {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    displayName: row.display_name,
    capabilities: parseJsonArray<ModelCapability>(row.capabilities),
    contextWindow: row.context_window,
    createdAt: row.created_at,
  };
}
