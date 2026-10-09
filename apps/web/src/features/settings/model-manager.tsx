'use client';

import * as React from 'react';
import type { ModelCapability } from '@wbfm/shared/constants';
import type { Provider, ProviderModel } from '@wbfm/shared/types';
import { MODEL_CAPABILITIES } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ApiClientError } from '@/lib/api/client';
import {
  useModelMutations,
  useProviderModels,
  useRemoteModels,
  type ModelCreateBody,
} from '@/lib/hooks/use-providers';

const CAPABILITY_LABEL: Record<ModelCapability, string> = {
  chat: '对话',
  embedding: '向量',
  vision: '视觉',
};

/** 上下文长度展示：1024 的整数倍显示为 K，否则原值 */
function formatContext(tokens: number | null): string | null {
  if (!tokens || tokens <= 0) return null;
  return tokens % 1024 === 0 ? `${tokens / 1024}K` : String(tokens);
}

interface AddFormState {
  modelId: string;
  displayName: string;
  contextWindow: string;
  capabilities: ModelCapability[];
}

const EMPTY_FORM: AddFormState = {
  modelId: '',
  displayName: '',
  contextWindow: '',
  capabilities: ['chat'],
};

export function ModelManager({ provider }: { provider: Provider }) {
  const { data: models, isLoading } = useProviderModels(provider.id);
  const modelMutations = useModelMutations();
  const remoteModels = useRemoteModels(provider.id);
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = React.useState<AddFormState>(EMPTY_FORM);

  const toggleCapability = (capability: ModelCapability) => {
    setForm((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(capability)
        ? prev.capabilities.filter((item) => item !== capability)
        : [...prev.capabilities, capability],
    }));
  };

  const addModel = async (modelId: string, preset?: Partial<ModelCreateBody>) => {
    const body: ModelCreateBody = {
      modelId,
      capabilities: preset?.capabilities ?? form.capabilities,
      displayName: preset?.displayName ?? (form.displayName.trim() || undefined),
      contextWindow:
        preset?.contextWindow ??
        (form.contextWindow ? Number(form.contextWindow) : null),
    };
    try {
      await modelMutations.add.mutateAsync({ providerId: provider.id, body });
      toast.success(`已添加模型 ${modelId}`);
      setForm(EMPTY_FORM);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '添加失败');
    }
  };

  const removeModel = async (model: ProviderModel) => {
    if (
      !(await confirm({
        title: '移除模型',
        description: `确定从该供应商移除模型 ${model.displayName}？`,
        confirmText: '移除',
        danger: true,
      }))
    ) {
      return;
    }
    try {
      await modelMutations.remove.mutateAsync(model.id);
      toast.success('模型已移除');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '移除失败');
    }
  };

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">模型管理</h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => remoteModels.mutate()}
          disabled={remoteModels.isPending}
        >
          {remoteModels.isPending ? '拉取中…' : '从远端拉取'}
        </Button>
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <ul className="space-y-1.5" data-testid={`model-list-${provider.id}`}>
          {models?.map((model) => {
            const context = formatContext(model.contextWindow);
            return (
              <li key={model.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {model.displayName}
                  <span className="ml-1 text-xs text-muted-foreground">{model.modelId}</span>
                  {context && (
                    <span className="ml-1 text-xs text-muted-foreground">· 上下文 {context}</span>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  {model.capabilities.map((capability) => (
                    <Badge key={capability} variant="outline">
                      {CAPABILITY_LABEL[capability]}
                    </Badge>
                  ))}
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-destructive"
                    aria-label={`移除模型 ${model.displayName}`}
                    onClick={() => removeModel(model)}
                  >
                    删除
                  </button>
                </span>
              </li>
            );
          })}
          {models?.length === 0 && <li className="text-xs text-muted-foreground">暂无模型</li>}
        </ul>
      )}

      {remoteModels.data && remoteModels.data.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {remoteModels.data.map((remote) => {
            const context = formatContext(remote.contextLength);
            return (
              <button
                key={remote.id}
                type="button"
                className="rounded border px-2 py-0.5 text-xs hover:bg-accent"
                title={context ? `自动探测上下文长度：${context} tokens` : undefined}
                onClick={() =>
                  addModel(remote.id, { capabilities: ['chat'], contextWindow: remote.contextLength })
                }
              >
                + {remote.id}
                {context && <span className="ml-1 text-muted-foreground">{context}</span>}
              </button>
            );
          })}
        </div>
      )}

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (form.modelId.trim()) void addModel(form.modelId.trim());
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`model-id-${provider.id}`} className="text-xs">
            模型 ID
          </Label>
          <Input
            id={`model-id-${provider.id}`}
            className="h-8 w-40"
            value={form.modelId}
            onChange={(e) => setForm((p) => ({ ...p, modelId: e.target.value }))}
            placeholder="gpt-4o-mini"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">能力</Label>
          <span className="flex h-8 items-center gap-2">
            {MODEL_CAPABILITIES.map((capability) => (
              <label key={capability} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={form.capabilities.includes(capability)}
                  onChange={() => toggleCapability(capability)}
                />
                {CAPABILITY_LABEL[capability]}
              </label>
            ))}
          </span>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`model-ctx-${provider.id}`} className="text-xs">
            上下文长度
          </Label>
          <Input
            id={`model-ctx-${provider.id}`}
            className="h-8 w-28"
            type="number"
            min={1}
            value={form.contextWindow}
            onChange={(e) => setForm((p) => ({ ...p, contextWindow: e.target.value }))}
            placeholder="如 32768"
          />
        </div>
        <Button type="submit" size="sm" disabled={modelMutations.add.isPending}>
          添加
        </Button>
      </form>
    </div>
  );
}
