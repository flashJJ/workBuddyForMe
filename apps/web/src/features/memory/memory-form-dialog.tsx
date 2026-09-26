'use client';

import * as React from 'react';
import type { Memory, MemoryKind, MemoryStatus } from '@wbfm/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useMemoryMutations, type MemoryCreateBody } from '@/lib/hooks/use-memories';
import { MEMORY_KIND_OPTIONS, MEMORY_STATUS_LABELS } from './memory-labels';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传 null 表示新建 */
  memory: Memory | null;
}

interface FormState {
  kind: MemoryKind;
  content: string;
  importance: string;
  status: MemoryStatus;
}

function toForm(memory: Memory | null): FormState {
  return memory
    ? {
        kind: memory.kind,
        content: memory.content,
        importance: String(memory.importance),
        status: memory.status,
      }
    : { kind: 'fact', content: '', importance: '0.5', status: 'active' };
}

/** 记忆新建/编辑弹窗：新建走 POST，编辑走 PATCH；内容变更后服务端自动重算向量 */
export function MemoryFormDialog({ open, onOpenChange, memory }: Props) {
  const [form, setForm] = React.useState<FormState>(() => toForm(memory));
  const [submitting, setSubmitting] = React.useState(false);
  const toast = useToast();
  const mutations = useMemoryMutations();

  React.useEffect(() => {
    if (open) setForm(toForm(memory));
  }, [open, memory]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    const importance = Number(form.importance);
    if (!form.content.trim()) {
      toast.error('记忆内容不能为空');
      return;
    }
    setSubmitting(true);
    try {
      if (memory) {
        await mutations.update.mutateAsync({
          id: memory.id,
          body: {
            kind: form.kind,
            content: form.content.trim(),
            importance,
            status: form.status,
          },
        });
        toast.success('记忆已更新');
      } else {
        const body: MemoryCreateBody = {
          kind: form.kind,
          content: form.content.trim(),
          importance,
        };
        await mutations.create.mutateAsync(body);
        toast.success('记忆已添加');
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{memory ? '编辑记忆' : '添加记忆'}</DialogTitle>
          <DialogDescription>
            记忆会通过语义嵌入在相关对话中自动召回，内容请写成自包含的一句陈述。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>类别</Label>
              <Select
                aria-label="记忆类别"
                value={form.kind}
                onChange={(e) => update({ kind: e.target.value as MemoryKind })}
              >
                {MEMORY_KIND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>重要性（{Number(form.importance).toFixed(1)}）</Label>
              <input
                type="range"
                aria-label="重要性"
                min={0}
                max={1}
                step={0.1}
                value={form.importance}
                onChange={(e) => update({ importance: e.target.value })}
                className="mt-2 h-2 w-full cursor-pointer"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>内容</Label>
            <Textarea
              aria-label="记忆内容"
              value={form.content}
              maxLength={500}
              rows={4}
              onChange={(e) => update({ content: e.target.value })}
              placeholder="例如：用户在准备 PMP 考试，希望用中文交流"
            />
            <div className="text-right text-xs text-muted-foreground">
              {form.content.length}/500
            </div>
          </div>

          {memory && (
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select
                aria-label="记忆状态"
                value={form.status}
                onChange={(e) => update({ status: e.target.value as MemoryStatus })}
              >
                <option value="active">{MEMORY_STATUS_LABELS.active}</option>
                <option value="archived">{MEMORY_STATUS_LABELS.archived}</option>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void submit()}>
            {submitting ? '保存中…' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
