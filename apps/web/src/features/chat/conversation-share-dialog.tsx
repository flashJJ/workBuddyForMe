'use client';

import * as React from 'react';
import { FileCode2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { ApiClientError, withManagedHeaders } from '@/lib/api/client';

type ShareFormat = 'markdown' | 'html';

interface Props {
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMATS: Array<{ value: ShareFormat; label: string; hint: string; icon: typeof FileText }> = [
  { value: 'markdown', label: 'Markdown', hint: '.md，适合粘贴到文档 / GitHub', icon: FileText },
  { value: 'html', label: 'HTML 网页', hint: '.html 单文件，浏览器直接打开', icon: FileCode2 },
];

/** 从 Content-Disposition 取文件名：优先 RFC 5987 的 filename*（支持中文） */
function filenameFromDisposition(cd: string | null, fallback: string): string {
  if (cd) {
    const starred = cd.match(/filename\*=UTF-8''([^;]+)/i);
    if (starred?.[1]) return decodeURIComponent(starred[1]);
    const plain = cd.match(/filename="?([^";]+)"?/);
    if (plain?.[1]) return plain[1];
  }
  return fallback;
}

/** 触发浏览器下载（文件名优先取 content-disposition） */
async function downloadShare(conversationId: string, format: ShareFormat): Promise<void> {
  const res = await fetch(
    `/api/conversations/${conversationId}/export?format=${format}`,
    withManagedHeaders(),
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiClientError(
      body.error?.code ?? 'SHARE_EXPORT_FAILED',
      body.error?.message ?? `导出失败（${res.status}）`,
      res.status,
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameFromDisposition(
    res.headers.get('content-disposition'),
    `conversation.${format === 'html' ? 'html' : 'md'}`,
  );
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function ConversationShareDialog({ conversationId, open, onOpenChange }: Props) {
  const toast = useToast();
  const [pending, setPending] = React.useState<ShareFormat | null>(null);

  const handleDownload = async (format: ShareFormat) => {
    if (!conversationId || pending) return;
    setPending(format);
    try {
      await downloadShare(conversationId, format);
      toast.success('分享文件已生成并开始下载');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '导出失败');
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>分享对话</DialogTitle>
          <DialogDescription>
            选择导出格式。导出内容已自动脱敏 API Key、访问令牌与本地路径。
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {FORMATS.map(({ value, label, hint, icon: Icon }) => (
            <button
              key={value}
              type="button"
              data-testid={`share-format-${value}`}
              disabled={pending !== null}
              onClick={() => void handleDownload(value)}
              className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent disabled:opacity-50"
            >
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium">
                {pending === value ? '生成中…' : label}
              </span>
              <span className="text-xs text-muted-foreground">{hint}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
