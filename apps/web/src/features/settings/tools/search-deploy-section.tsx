'use client';

import * as React from 'react';
import { useMutation } from '@tanstack/react-query';
import type { SearchSettings } from '@wbfm/shared/types';
import type { SearxngDeployResult } from '@wbfm/shared/search';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateSettings } from '@/lib/hooks/provider';
import { apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  form: SearchSettings;
  onFormChange: (next: SearchSettings) => void;
  onSettingsSaved: () => void;
  onTestResult: (result: { ok: boolean; message: string }) => void;
}

/**
 * v2.24：从搜索设置面板拆出的 SearXNG 一键部署区块。
 * 部署由桌面主进程完成（Docker 检测、配置写入、端口选择、健康等待）。
 */
export function SearxngDeploySection({
  form,
  onFormChange,
  onSettingsSaved,
  onTestResult,
}: Props) {
  const { t } = useI18n();
  const update = useUpdateSettings();
  const test = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; message: string }>(API.searchTest),
  });
  const [deploy, setDeploy] = React.useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'ok'; endpoint: string; engines?: string[] }
    | { kind: 'fail'; result: Extract<SearxngDeployResult, { ok: false }> }
  >({ kind: 'idle' });
  /** 端口留空 = 自动从候选里挑空闲端口 */
  const [port, setPort] = React.useState('');

  const bridge = typeof window !== 'undefined' ? window.wbfm?.search : undefined;
  if (!bridge) return null;

  const runDeploy = async () => {
    const portValue = port.trim() ? Number(port) : undefined;
    if (
      portValue !== undefined &&
      (!Number.isInteger(portValue) || portValue < 1024 || portValue > 65535)
    ) {
      setDeploy({
        kind: 'fail',
        result: {
          ok: false,
          reason: 'start_failed',
          message: t('settings.search.deployPortInvalid'),
        },
      });
      return;
    }
    setDeploy({ kind: 'running' });
    try {
      const result = await bridge.deploySearxng(portValue);
      if (!result.ok) {
        setDeploy({ kind: 'fail', result });
        return;
      }
      const next: SearchSettings = {
        ...form,
        provider: 'searxng',
        endpoint: result.endpoint,
        allowPrivateEndpoint: true,
      };
      onFormChange(next);
      await update.mutateAsync({ searchSettings: next });
      onSettingsSaved();
      setDeploy({ kind: 'ok', endpoint: result.endpoint, engines: result.engines });
      const tested = await test.mutateAsync();
      onTestResult(tested);
    } catch (error) {
      setDeploy({
        kind: 'fail',
        result: {
          ok: false,
          reason: 'start_failed',
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  };

  return (
    <div className="space-y-2 rounded-md border border-dashed bg-ui-row p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm">{t('settings.search.deployTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('settings.search.deployHint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>{t('settings.search.deployPort')}</span>
            <Input
              type="number"
              min={1024}
              max={65535}
              value={port}
              onChange={(event) => setPort(event.target.value)}
              placeholder={t('settings.search.deployPortAuto')}
              className="h-8 w-36"
              disabled={deploy.kind === 'running' || update.isPending}
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void runDeploy()}
            disabled={deploy.kind === 'running' || update.isPending}
          >
            {deploy.kind === 'running'
              ? t('settings.search.deploying')
              : t('settings.search.deploy')}
          </Button>
        </div>
      </div>
      {deploy.kind === 'ok' && (
        <div className="space-y-1" role="status">
          <p className="text-sm text-success">
            {t('settings.search.deployOk', { endpoint: deploy.endpoint })}
          </p>
          {deploy.engines &&
            (deploy.engines.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('settings.search.deployEngines', { engines: deploy.engines.join('、') })}
              </p>
            ) : (
              <p className="text-xs text-warning">{t('settings.search.deployNoEngine')}</p>
            ))}
        </div>
      )}
      {deploy.kind === 'fail' && (
        <div className="space-y-1">
          <p className="text-sm text-destructive" role="status">
            {deploy.result.message}
          </p>
          {deploy.result.manualCommand && (
            <pre className="overflow-x-auto rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
              {deploy.result.manualCommand}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
