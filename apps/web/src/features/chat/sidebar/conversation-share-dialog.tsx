'use client';

import * as React from 'react';
import { FileCode2, FileText } from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';
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
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';

type ShareFormat = 'markdown' | 'html';

interface Props {
  conversationId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

interface FormatMeta {
  value: ShareFormat;
  labelKey: MessageKey | null;
  hintKey: MessageKey;
  icon: typeof FileText;
}

const FORMATS: FormatMeta[] = [
  { value: 'markdown', labelKey: null, hintKey: 'chat.share.markdownHint', icon: FileText },
  { value: 'html', labelKey: 'chat.share.htmlLabel', hintKey: 'chat.share.htmlHint', icon: FileCode2 },
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
async function downloadShare(
  conversationId: string,
  format: ShareFormat,
  t: Translate,
  locale: string,
): Promise<void> {
  const res = await fetch(
    `/api/conversations/${conversationId}/export?format=${format}&locale=${encodeURIComponent(locale)}`,
    withManagedHeaders(),
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiClientError(
      body.error?.code ?? 'SHARE_EXPORT_FAILED',
      body.error?.message ?? t('toast.exportFailedStatus', { status: res.status }),
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
  const { t, locale } = useI18n();
  const toast = useToast();
  const [pending, setPending] = React.useState<ShareFormat | null>(null);

  const handleDownload = async (format: ShareFormat) => {
    if (!conversationId || pending) return;
    setPending(format);
    try {
      await downloadShare(conversationId, format, t, locale);
      toast.success(t('toast.shareDownloaded'));
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.exportFailed' }));
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat.share.title')}</DialogTitle>
          <DialogDescription>{t('chat.share.description')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {FORMATS.map(({ value, labelKey, hintKey, icon: Icon }) => (
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
                {pending === value ? t('chat.share.generating') : (labelKey ? t(labelKey) : 'Markdown')}
              </span>
              <span className="text-xs text-muted-foreground">{t(hintKey)}</span>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
