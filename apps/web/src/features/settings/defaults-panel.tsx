'use client';

import * as React from 'react';
import type { AppSettings, ProviderModel } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { apiGet } from '@/lib/api/client';
import { copyText } from '@/lib/utils/clipboard';
import { useAllModels, useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';

function modelLabel(model: ProviderModel): string {
  return `${model.displayName}（${model.modelId}）`;
}

function DataDirField() {
  const [dataDir, setDataDir] = React.useState<string>('');
  const toast = useToast();

  React.useEffect(() => {
    let alive = true;
    void apiGet<{ dataDir: string }>('/api/system/info')
      .then((info) => alive && setDataDir(info.dataDir))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const copy = async () => {
    if (!dataDir) return;
    await copyText(dataDir);
    toast.success('数据目录已复制');
  };

  return (
    <div className="space-y-1.5">
      <Label>本地数据目录</Label>
      <div className="flex gap-2">
        <input
          readOnly
          value={dataDir}
          aria-label="本地数据目录"
          className="h-9 flex-1 truncate rounded-md border bg-muted px-3 text-sm text-muted-foreground"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          复制
        </Button>
      </div>
    </div>
  );
}

export function DefaultsPanel() {
  const { data: settings } = useSettings();
  const { data: models } = useAllModels();
  const updateSettings = useUpdateSettings();
  const toast = useToast();
  const [draft, setDraft] = React.useState<AppSettings | null>(null);

  React.useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  if (!draft) return null;

  const chatModels = (models ?? []).filter((model) => model.capabilities.includes('chat'));
  const embeddingModels = (models ?? []).filter((model) =>
    model.capabilities.includes('embedding'),
  );

  const save = async (patch: Partial<AppSettings>) => {
    try {
      const next = await updateSettings.mutateAsync(patch);
      setDraft(next);
      toast.success('设置已保存');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '保存失败');
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="defaults-panel">
      <h3 className="font-medium">默认偏好</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="default-chat-model">默认对话模型</Label>
          <Select
            id="default-chat-model"
            value={draft.defaultChatModelId ?? ''}
            onChange={(e) => void save({ defaultChatModelId: e.target.value || null })}
          >
            <option value="">未选择</option>
            {chatModels.map((model) => (
              <option key={model.id} value={model.id}>
                {modelLabel(model)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="default-embedding-model">默认向量模型（知识库）</Label>
          <Select
            id="default-embedding-model"
            value={draft.defaultEmbeddingModelId ?? ''}
            onChange={(e) => void save({ defaultEmbeddingModelId: e.target.value || null })}
          >
            <option value="">未选择</option>
            {embeddingModels.map((model) => (
              <option key={model.id} value={model.id}>
                {modelLabel(model)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-preference">主题</Label>
          <Select
            id="theme-preference"
            value={draft.theme}
            onChange={(e) => void save({ theme: e.target.value as AppSettings['theme'] })}
          >
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </Select>
        </div>
      </div>
      <DataDirField />
      <p className="text-xs text-muted-foreground">
        助手可单独指定模型；未指定时使用上方默认对话模型。设置项即时保存。
      </p>
    </section>
  );
}
