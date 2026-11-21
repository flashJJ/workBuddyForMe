'use client';

import * as React from 'react';
import { useUpdateSettings } from '@/lib/hooks/provider';
import { apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { resolveSearxngDeploySettings } from '@/lib/settings/searxng-deploy-apply';
import type { PendingLocalSearchStart } from '../../types/chat-session.types';

/**
 * v4.16：本地 SearXNG 未运行的启动询问。
 * 桌面端走既有 IPC 拉起容器并保存设置，然后放行编排器重试本次搜索；
 * 浏览器模式只负责「我已手动启动，继续搜索」的放行。
 */
export function useLocalSearchStart(params: {
  pending: PendingLocalSearchStart | null;
  clearPending: () => void;
}) {
  const { pending, clearPending } = params;
  const updateSettings = useUpdateSettings();
  const [running, setRunning] = React.useState(false);
  const canAutoStart =
    typeof window !== 'undefined' && Boolean(window.wbfm?.search);

  React.useEffect(() => {
    if (!pending) setRunning(false);
  }, [pending]);

  const decide = React.useCallback(
    async (action: 'allow' | 'deny'): Promise<boolean> => {
      if (!pending) return false;
      try {
        await apiPost(API.toolConfirm, {
          callId: pending.callId,
          tool: 'web_search',
          action,
        });
        clearPending();
        return true;
      } catch {
        // 服务端挂起项已超时/中断：关闭弹窗，让本轮按原结果收尾
        clearPending();
        return false;
      }
    },
    [pending, clearPending],
  );

  const start = React.useCallback(async (): Promise<{ ok: boolean; error?: string; reason?: 'confirm_timeout' }> => {
    if (!pending || running) return { ok: false };
    setRunning(true);
    try {
      const bridge = typeof window !== 'undefined' ? window.wbfm?.search : undefined;
      if (bridge) {
        const result = await bridge.deploySearxng();
        if (!result.ok) {
          const error = result.manualCommand
            ? `${result.message}\n${result.manualCommand}`
            : result.message;
          return { ok: false, error };
        }
        // 容器端口可能变化：先落设置，重启搜索才会连到新实例
        const next = await resolveSearxngDeploySettings(result.endpoint);
        await updateSettings.mutateAsync({ searchSettings: next });
      }
      const submitted = await decide('allow');
      return submitted ? { ok: true } : { ok: false, reason: 'confirm_timeout' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      setRunning(false);
    }
  }, [pending, running, decide, updateSettings]);

  const cancel = React.useCallback(async () => {
    await decide('deny');
  }, [decide]);

  return { pending, running, canAutoStart, start, cancel };
}
