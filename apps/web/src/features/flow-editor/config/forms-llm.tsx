'use client';

import { useQueries } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import type { KnowledgeBase, ProviderModel } from '@wbfm/shared';
import { useProviders } from '@/lib/hooks/use-providers';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import {
  Field,
  Input,
  RefTextarea,
  Select,
  num,
  str,
  type NodeConfigFormProps,
} from './form-primitives';

/** 跨供应商模型扁平选项（modelId 为全局唯一标识） */
function useModelOptions() {
  const providers = useProviders();
  const ids = (providers.data ?? []).map((p) => p.id);
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['models', id],
      queryFn: () => apiGet<ProviderModel[]>(API.providerModels(id)),
    })),
  });
  return (providers.data ?? []).flatMap((p, i) =>
    (results[i]?.data ?? []).map((m) => ({
      modelId: m.modelId,
      label: `${p.name} / ${m.displayName || m.modelId}`,
    })),
  );
}

export function LlmForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const modelOptions = useModelOptions();
  const modelId = str(config.modelId);

  return (
    <div className="flex flex-col gap-3">
      <Field label="模型" hint="留空则跟随系统默认对话模型">
        <Select value={modelId} onChange={(e) => patch({ modelId: e.target.value })}>
          <option value="">跟随默认模型</option>
          {modelOptions.map((m) => (
            <option key={m.modelId} value={m.modelId}>
              {m.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="System 提示词（可选）">
        <RefTextarea
          value={str(config.system)}
          nodes={nodes}
          currentNodeId={nodeId}
          onChange={(system) => patch({ system })}
          rows={3}
          placeholder="设定角色与约束，例如：你是严谨的资料研究助手。"
        />
      </Field>
      <Field label="User 提示词">
        <RefTextarea
          value={str(config.user)}
          nodes={nodes}
          currentNodeId={nodeId}
          onChange={(user) => patch({ user })}
          rows={5}
          placeholder="支持插入变量，例如：基于以下资料回答：{{$nodes.kb.outputs.context}}"
        />
      </Field>
      <Field label="采样温度（可选 0–2）">
        <Input
          type="number"
          min={0}
          max={2}
          step={0.1}
          value={config.temperature === undefined ? '' : num(config.temperature, 0.7)}
          onChange={(e) =>
            patch({ temperature: e.target.value === '' ? undefined : Number(e.target.value) })
          }
          className="h-8 text-xs"
        />
      </Field>
    </div>
  );
}

export function KnowledgeForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const kbs = useKnowledgeBases();
  const list = kbs.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <Field label="知识库">
        <Select
          value={str(config.knowledgeBaseId)}
          onChange={(e) => patch({ knowledgeBaseId: e.target.value })}
        >
          <option value="">请选择知识库</option>
          {list.map((kb: KnowledgeBase) => (
            <option key={kb.id} value={kb.id}>
              {kb.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="检索词" hint="支持插入 start 入参或上游节点变量">
        <RefTextarea
          value={str(config.query)}
          nodes={nodes}
          currentNodeId={nodeId}
          onChange={(query) => patch({ query })}
          rows={3}
          placeholder="例如：{{$nodes.start.params.topic}}"
        />
      </Field>
      <Field label="返回条数 topK">
        <Input
          type="number"
          min={1}
          max={20}
          value={num(config.topK, 4)}
          onChange={(e) => patch({ topK: Number(e.target.value) || 4 })}
          className="h-8 text-xs"
        />
      </Field>
    </div>
  );
}
