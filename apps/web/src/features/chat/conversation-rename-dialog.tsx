'use client';

import * as React from 'react';
import type { Conversation } from '@wbfm/shared';
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

interface Props {
  conversation: Conversation | null;
  onOpenChange: (open: boolean) => void;
  /** 返回 false 表示保存失败（父级负责提示），弹窗保持打开 */
  onSubmit: (id: string, title: string) => Promise<boolean>;
}

export function ConversationRenameDialog({ conversation, onOpenChange, onSubmit }: Props) {
  const [title, setTitle] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (conversation) setTitle(conversation.title);
  }, [conversation]);

  const trimmed = title.trim();
  const unchanged = Boolean(conversation) && trimmed === conversation?.title;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!conversation || !trimmed || unchanged || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onSubmit(conversation.id, trimmed);
      if (ok !== false) onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(conversation)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>重命名对话</DialogTitle>
          <DialogDescription>给这个对话起一个更容易识别的标题。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conversation-title">对话标题</Label>
            <Input
              id="conversation-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="输入新的对话标题"
              maxLength={120}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting || !trimmed || unchanged}>
              {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
