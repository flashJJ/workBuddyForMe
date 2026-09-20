'use client';

import * as React from 'react';
import type { KnowledgeBase } from '@wbfm/shared';
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  MAX_CHUNK_SIZE,
  MIN_CHUNK_SIZE,
} from '@wbfm/shared';
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
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useKnowledgeMutations, type KnowledgeBaseBody } from '@/lib/hooks/use-knowledge';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  knowledgeBase?: KnowledgeBase | null;
}

export function KnowledgeBaseFormDialog({ open, onOpenChange, knowledgeBase }: Props) {
  const isEdit = Boolean(knowledgeBase);
  const mutations = useKnowledgeMutations();
  const toast = useToast();
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [chunkSize, setChunkSize] = React.useState(String(DEFAULT_CHUNK_SIZE));
  const [chunkOverlap, setChunkOverlap] = React.useState(String(DEFAULT_CHUNK_OVERLAP));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setName(knowledgeBase?.name ?? '');
    setDescription(knowledgeBase?.description ?? '');
    setChunkSize(String(knowledgeBase?.chunkSize ?? DEFAULT_CHUNK_SIZE));
    setChunkOverlap(String(knowledgeBase?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP));
  }, [open, knowledgeBase]);

  const buildBody = (): KnowledgeBaseBody => ({
    name: name.trim(),
    description: description.trim(),
    chunkSize: Number(chunkSize),
    chunkOverlap: Number(chunkOverlap),
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit && knowledgeBase) {
        await mutations.update.mutateAsync({ id: knowledgeBase.id, body: buildBody() });
        toast.success('知识库已更新');
      } else {
        await mutations.create.mutateAsync(buildBody());
        toast.success('知识库已创建');
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
          <DialogTitle>{isEdit ? '编辑知识库' : '新建知识库'}</DialogTitle>
          <DialogDescription>文档会按分片参数切分并向量化，用于对话检索增强。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="kb-name">名称</Label>
            <Input
              id="kb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：产品资料库"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-desc">描述</Label>
            <Textarea
              id="kb-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="这个知识库包含哪些内容？"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="kb-chunk-size">分片大小</Label>
              <Input
                id="kb-chunk-size"
                type="number"
                min={MIN_CHUNK_SIZE}
                max={MAX_CHUNK_SIZE}
                value={chunkSize}
                onChange={(e) => setChunkSize(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-chunk-overlap">重叠长度</Label>
              <Input
                id="kb-chunk-overlap"
                type="number"
                min={0}
                value={chunkOverlap}
                onChange={(e) => setChunkOverlap(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            支持 {MIN_CHUNK_SIZE}-{MAX_CHUNK_SIZE} 字符；仅支持 .txt / .md / .pdf。
          </p>
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
