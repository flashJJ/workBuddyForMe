'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import type { AppSettings, BranchLimitSettings, ProviderModel } from '@wbfm/shared/types';
import { useProviders } from './use-providers';
import { apiGet, apiPut } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export type SettingsUpdateBody = Partial<AppSettings> & BranchLimitSettings;

/**
 * v2.23：设置跨窗口同步。
 * 桌宠/舞台是独立窗口、各自持有 React Query 缓存；主窗保存设置只会失效自己的缓存，
 * 桌宠侧（勿扰、互动短句、情绪开关等）会一直用旧值，直到重开桌宠才重新拉取。
 * 用 BroadcastChannel 广播一次「设置已更新」，其余窗口收到后失效查询即可即时生效。
 */
const SETTINGS_SYNC_CHANNEL = 'wbfm:settings-changed';

function broadcastSettingsChanged(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(SETTINGS_SYNC_CHANNEL);
  channel.postMessage('updated');
  channel.close();
}

/** 在需要跟随设置变化的独立窗口里调用（桌宠等）；主窗自身靠 mutation 失效即可 */
export function useSettingsSync(): void {
  const qc = useQueryClient();
  React.useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(SETTINGS_SYNC_CHANNEL);
    const onMessage = () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    };
    channel.addEventListener('message', onMessage);
    return () => {
      channel.removeEventListener('message', onMessage);
      channel.close();
    };
  }, [qc]);
}

export function useSettings() {
  return useVisibleQuery({
    queryKey: QUERY_KEYS.settings,
    queryFn: () => apiGet<AppSettings>(API.settings),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SettingsUpdateBody) => apiPut<AppSettings>(API.settings, body),
    onSuccess: () => {
      // 先通知其余窗口，再刷新本窗缓存
      broadcastSettingsChanged();
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.settings });
    },
  });
}

/** 聚合各供应商下的模型（扁平列表，供默认模型/助手绑定选择） */
export function useAllModels() {
  const { data: providers } = useProviders();
  // queryKey 随供应商集合变化：新增/删除供应商后自动重新聚合。
  // （key 恒定则不会重拉——向导里新建 demo 供应商后，列表页拿不到新模型，只能靠整页刷新兜底）
  const providerIds = (providers ?? []).map((provider) => provider.id).join(',');
  return useVisibleQuery({
    queryKey: [...QUERY_KEYS.modelsAll, providerIds],
    queryFn: async () => {
      if (!providers) return [];
      const lists = await Promise.all(
        providers.map((provider) => apiGet<ProviderModel[]>(API.providerModels(provider.id))),
      );
      return lists.flat();
    },
    enabled: Boolean(providers),
  });
}
