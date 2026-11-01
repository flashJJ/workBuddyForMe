'use client';

import * as React from 'react';
import { apiGet, ApiClientError, withManagedHeaders } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { ExportCandidate } from '@wbfm/core/services';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 触发浏览器下载二进制响应，文件名取 content-disposition（RFC 5987 回退 ASCII） */
function saveBlob(res: Response, fallback: string) {
  return res.blob().then((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cd = res.headers.get('content-disposition');
    a.download = cd?.match(/filename="?([^"]+)"?/)?.[1] ?? fallback;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

export function ModPackExportDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [candidates, setCandidates] = React.useState<ExportCandidate | null>(null);
  const [loadError, setLoadError] = React.useState(false);
  const [cardIds, setCardIds] = React.useState<string[]>([]);
  const [sceneIds, setSceneIds] = React.useState<string[]>([]);
  const [name, setName] = React.useState('');
  const [authorName, setAuthorName] = React.useState('');
  const [authorUrl, setAuthorUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCandidates(null);
    setLoadError(false);
    apiGet<ExportCandidate>(API.modPackCandidates)
      .then((data) => {
        if (cancelled) return;
        setCandidates(data);
        setName((prev) => prev || '');
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const toggle = (list: string[], setList: (v: string[]) => void, id: string) => {
    setList(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  };

  const empty = candidates !== null && candidates.cards.length === 0 && candidates.scenes.length === 0;
  const canSubmit = !busy && !empty && name.trim().length > 0 && (cardIds.length + sceneIds.length > 0);

  const submit = async () => {
    if (!canSubmit) return;
    if (cardIds.length + sceneIds.length === 0) {
      toast.error(t('modPack.export.selectAtLeastOne'));
      return;
    }
    setBusy(true);
    try {
      const headers = new Headers(withManagedHeaders().headers);
      headers.set('content-type', 'application/json');
      const res = await fetch(API.modPackExport, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: name.trim(),
          authorName: authorName.trim() || t('modPack.export.authorNamePlaceholder'),
          authorUrl: authorUrl.trim() ? authorUrl.trim() : null,
          packVersion: '1.0.0',
          characterCardIds: cardIds,
          stageSceneIds: sceneIds,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new ApiClientError(body.error?.code ?? 'PACK_EXPORT', body.error?.message ?? '', res.status);
      }
      await saveBlob(res, 'pack.wbfm-pack');
      toast.success(t('modPack.export.done'));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError && error.message
        ? error.message
        : t('modPack.export.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('modPack.export.title')}</DialogTitle>
          <DialogDescription>{t('modPack.export.backgroundsAuto')}</DialogDescription>
        </DialogHeader>

        {loadError && <p className="text-sm text-destructive">{t('modPack.export.failed')}</p>}
        {!candidates && !loadError && <p className="text-sm text-muted-foreground">…</p>}
        {empty && <p className="text-sm text-muted-foreground">{t('modPack.export.emptyCandidates')}</p>}

        {candidates && !empty && (
          <div className="space-y-4" data-testid="mod-pack-export-form">
            <div className="grid gap-2">
              <Label>{t('modPack.export.packName')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80}
                placeholder={t('modPack.export.packNamePlaceholder')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label>{t('modPack.export.authorName')}</Label>
                <Input value={authorName} onChange={(e) => setAuthorName(e.target.value)} maxLength={80}
                  placeholder={t('modPack.export.authorNamePlaceholder')} />
              </div>
              <div className="grid gap-1">
                <Label>{t('modPack.export.authorUrl')}</Label>
                <Input value={authorUrl} onChange={(e) => setAuthorUrl(e.target.value)} maxLength={500}
                  placeholder={t('modPack.export.authorUrlPlaceholder')} />
              </div>
            </div>

            {candidates.cards.length > 0 && (
              <fieldset className="space-y-1">
                <Label asChild><legend>{t('modPack.export.cardsGroup')}</legend></Label>
                {candidates.cards.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50">
                    <input type="checkbox" className="mt-0.5 h-4 w-4"
                      checked={cardIds.includes(c.id)}
                      onChange={() => toggle(cardIds, setCardIds, c.id)} />
                    <span>{c.name}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {candidates.scenes.length > 0 && (
              <fieldset className="space-y-1">
                <Label asChild><legend>{t('modPack.export.scenesGroup')}</legend></Label>
                {candidates.scenes.map((s) => (
                  <label key={s.id} className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50">
                    <input type="checkbox" className="mt-0.5 h-4 w-4"
                      checked={sceneIds.includes(s.id)}
                      onChange={() => toggle(sceneIds, setSceneIds, s.id)} />
                    <span>{s.name}</span>
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={!canSubmit}>
            {busy ? t('modPack.export.busy') : t('modPack.export.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
