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
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  kbId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** v0.3 网页剪藏：贴 URL → 后台抓取/抽取/摄入，文档列表轮询复用既有状态 */
export function ClipDialog({ kbId, open, onOpenChange }: Props) {
  const { t } = useI18n();
  const mutations = useKnowledgeMutations();
  const toast = useToast();
  const [url, setUrl] = React.useState('');

  React.useEffect(() => {
    if (open) setUrl('');
  }, [open]);

  const submit = async () => {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error(t('knowledge.clip.invalidUrl'));
      return;
    }
    try {
      await mutations.clipDocument.mutateAsync({ kbId, url: trimmed });
      toast.success(t('knowledge.clip.submitted'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('knowledge.clip.failed'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('knowledge.clip.title')}</DialogTitle>
          <DialogDescription>
            {t('knowledge.clip.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="clip-url">{t('knowledge.clip.urlLabel')}</Label>
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
            {t('common.actions.cancel')}
          </Button>
          <Button
            type="button"
            data-testid="clip-submit"
            disabled={mutations.clipDocument.isPending}
            onClick={() => void submit()}
          >
            {mutations.clipDocument.isPending
              ? t('knowledge.clip.fetching')
              : t('knowledge.clip.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
