'use client';

import * as React from 'react';
import type { Assistant, ToolName } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useAllModels } from '@/lib/hooks/use-settings';
import { useKnowledgeBases } from '@/lib/hooks/use-knowledge';
import { useAssistantMutations, type AssistantBody } from '@/lib/hooks/use-assistants';
import { AssistantToolsField } from './assistant-tools-field';
import { NumberField } from './number-field';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistant?: Assistant | null;
}

interface FormState {
  name: string;
  emoji: string;
  color: string;
  systemPrompt: string;
  temperature: string;
  topP: string;
  maxTokens: string;
  modelId: string;
  knowledgeBaseId: string;
  enabledTools: ToolName[];
  retrieveAlways: boolean;
}

function toForm(assistant: Assistant | null | undefined): FormState {
  if (!assistant) {
    return {
      name: '',
      emoji: '🤖',
      color: '#6366f1',
      systemPrompt: '',
      temperature: '1',
      topP: '1',
      maxTokens: '',
      modelId: '',
      knowledgeBaseId: '',
      enabledTools: ['current_time'],
      retrieveAlways: true,
    };
  }
  return {
    name: assistant.name,
    emoji: assistant.emoji ?? '',
    color: assistant.color ?? '#6366f1',
    systemPrompt: assistant.systemPrompt,
    temperature: String(assistant.temperature),
    topP: String(assistant.topP),
    maxTokens: assistant.maxTokens ? String(assistant.maxTokens) : '',
    modelId: assistant.modelId ?? '',
    knowledgeBaseId: assistant.knowledgeBaseId ?? '',
    enabledTools: [...assistant.enabledTools],
    retrieveAlways: assistant.retrieveAlways,
  };
}

export function AssistantFormDialog({ open, onOpenChange, assistant }: Props) {
  const isEdit = Boolean(assistant);
  const mutations = useAssistantMutations();
  const { data: models } = useAllModels();
  const { data: knowledgeBases } = useKnowledgeBases();
  const toast = useToast();
  const [form, setForm] = React.useState<FormState>(() => toForm(assistant));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(toForm(assistant));
  }, [open, assistant]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));
  const chatModels = (models ?? []).filter((model) => model.capabilities.includes('chat'));

  const buildBody = (): AssistantBody => ({
    name: form.name.trim(),
    emoji: form.emoji.trim() || null,
    color: form.color || null,
    systemPrompt: form.systemPrompt,
    temperature: Number(form.temperature),
    topP: Number(form.topP),
    maxTokens: form.maxTokens ? Number(form.maxTokens) : null,
    modelId: form.modelId || null,
    knowledgeBaseId: form.knowledgeBaseId || null,
    enabledTools: form.enabledTools,
    retrieveAlways: form.retrieveAlways,
  });

  const toggleTool = (tool: ToolName) => {
    setForm((prev) => {
      const has = prev.enabledTools.includes(tool);
      return {
        ...prev,
        enabledTools: has
          ? prev.enabledTools.filter((t) => t !== tool)
          : [...prev.enabledTools, tool],
      };
    });
  };

  const changeKnowledgeBase = (knowledgeBaseId: string) => {
    setForm((prev) => ({
      ...prev,
      knowledgeBaseId,
      // 取消关联知识库时，连带移除知识库检索工具
      enabledTools: knowledgeBaseId
        ? prev.enabledTools
        : prev.enabledTools.filter((t) => t !== 'knowledge_search'),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit && assistant) {
        await mutations.update.mutateAsync({ id: assistant.id, body: buildBody() });
        toast.success('助手已更新');
      } else {
        await mutations.create.mutateAsync(buildBody());
        toast.success('助手已创建');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑助手' : '新建助手'}</DialogTitle>
          <DialogDescription>定义人设、采样参数，可绑定模型与知识库。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="w-20 space-y-1.5">
              <Label htmlFor="assistant-emoji">图标</Label>
              <Input
                id="assistant-emoji"
                value={form.emoji}
                onChange={(e) => update({ emoji: e.target.value })}
                maxLength={8}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="assistant-name">名称</Label>
              <Input
                id="assistant-name"
                value={form.name}
                onChange={(e) => update({ name: e.target.value })}
                placeholder="例如：产品经理"
                required
                maxLength={60}
              />
            </div>
            <div className="w-24 space-y-1.5">
              <Label htmlFor="assistant-color">配色</Label>
              <Input
                id="assistant-color"
                type="color"
                value={form.color}
                onChange={(e) => update({ color: e.target.value })}
                className="h-9 p-1"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assistant-prompt">系统提示词（人设）</Label>
            <Textarea
              id="assistant-prompt"
              value={form.systemPrompt}
              onChange={(e) => update({ systemPrompt: e.target.value })}
              rows={5}
              maxLength={8000}
              placeholder="你是一名……"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="assistant-temperature"
              label="Temperature（0-2）"
              value={form.temperature}
              step="0.1"
              min="0"
              max="2"
              onChange={(value) => update({ temperature: value })}
            />
            <NumberField
              id="assistant-topp"
              label="Top P（0-1）"
              value={form.topP}
              step="0.05"
              min="0"
              max="1"
              onChange={(value) => update({ topP: value })}
            />
            <NumberField
              id="assistant-maxtokens"
              label="最大输出 Token（空=不限）"
              value={form.maxTokens}
              step="100"
              min="1"
              onChange={(value) => update({ maxTokens: value })}
            />
            <div className="space-y-1.5">
              <Label htmlFor="assistant-model">绑定模型</Label>
              <Select
                id="assistant-model"
                value={form.modelId}
                onChange={(e) => update({ modelId: e.target.value })}
              >
                <option value="">跟随系统默认</option>
                {chatModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.displayName}（{model.modelId}）
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="assistant-kb">关联知识库</Label>
            <Select
              id="assistant-kb"
              value={form.knowledgeBaseId}
              onChange={(e) => changeKnowledgeBase(e.target.value)}
            >
              <option value="">不关联</option>
              {knowledgeBases?.map((kb) => (
                <option key={kb.id} value={kb.id}>
                  {kb.name}
                </option>
              ))}
            </Select>
          </div>

          <AssistantToolsField
            enabledTools={form.enabledTools}
            knowledgeBaseId={form.knowledgeBaseId}
            retrieveAlways={form.retrieveAlways}
            onToggleTool={toggleTool}
            onRetrieveAlwaysChange={(value) => update({ retrieveAlways: value })}
          />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

