'use client';

import * as React from 'react';
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
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useKnowledgeMutations } from '@/lib/hooks/use-knowledge';

interface Props {
  kbId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** v0.3 网页剪藏：贴 URL → 后台抓取/抽取/摄入，文档列表轮询复用既有状态 */
export function ClipDialog({ kbId, open, onOpenChange }: Props) {
  const mutations = useKnowledgeMutations();
  const toast = useToast();
  const [url, setUrl] = React.useState('');

  React.useEffect(() => {
    if (open) setUrl('');
  }, [open]);

  const submit = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error('网址必须以 http:// 或 https:// 开头');
      return;
    }
    try {
      await mutations.clipDocument.mutateAsync({ kbId, url: trimmed });
      toast.success('网页已提交，正在后台抽取正文并索引');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '网页剪藏失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>从网页导入</DialogTitle>
          <DialogDescription>
            粘贴公开文章链接，自动抽取标题与正文入库；仅支持 http/https，无法抓取内网或需登录页面。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="clip-url">网页地址</Label>
          <Input
            id="clip-url"
            data-testid="clip-url-input"
            placeholder="https://example.com/article"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit();
            }}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            data-testid="clip-submit"
            disabled={mutations.clipDocument.isPending}
            onClick={() => void submit()}
          >
            {mutations.clipDocument.isPending ? '抓取中…' : '开始导入'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
