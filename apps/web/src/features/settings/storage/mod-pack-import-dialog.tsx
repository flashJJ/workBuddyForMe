'use client';

import * as React from 'react';
import { apiUpload, ApiClientError } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';
import { useToast } from '@/components/common/toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { PackPreview, PackPreviewEntry, PackImportResult } from '@wbfm/core/services';

type Phase = 'pick' | 'inspecting' | 'preview' | 'importing' | 'done';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KIND_ORDER: PackPreviewEntry['kind'][] = ['characterCard', 'stageScene', 'stageBackground'];

function groupLabel(t: ReturnType<typeof useI18n>['t'], kind: PackPreviewEntry['kind'], n: number) {
  if (kind === 'characterCard') return t('modPack.import.cardsGroup', { count: n });
  if (kind === 'stageScene') return t('modPack.import.scenesGroup', { count: n });
  return t('modPack.import.backgroundsGroup', { count: n });
}

export function ModPackImportDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const [phase, setPhase] = React.useState<Phase>('pick');
  const [fileName, setFileName] = React.useState('');
  const [preview, setPreview] = React.useState<PackPreview | null>(null);
  const [pickedFile, setPickedFile] = React.useState<File | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [result, setResult] = React.useState<PackImportResult | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setPhase('pick');
    setFileName('');
    setPreview(null);
    setPickedFile(null);
    setSelected(new Set());
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [open]);

  const inspect = async (file: File) => {
    setPhase('inspecting');
    setFileName(file.name);
    setPickedFile(file);
    try {
      const form = new FormData();
      form.append('file', file);
      const resp = await apiUpload<{ preview: PackPreview }>(API.modPackInspect, form);
      setPreview(resp.preview);
      setSelected(new Set(resp.preview.entries.filter((e) => e.valid).map((e) => e.path)));
      setPhase('preview');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('modPack.import.failed'));
      setPhase('pick');
      setFileName('');
      setPickedFile(null);
    }
  };

  const toggle = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectAllValid = () => {
    if (!preview) return;
    const all = preview.entries.filter((e) => e.valid).every((e) => selected.has(e.path));
    setSelected(all ? new Set() : new Set(preview.entries.filter((e) => e.valid).map((e) => e.path)));
  };

  const doImport = async () => {
    if (!pickedFile || selected.size === 0) return;
    setPhase('importing');
    try {
      const form = new FormData();
      form.append('file', pickedFile);
      form.append('selectedPaths', JSON.stringify([...selected]));
      const resp = await apiUpload<{ result: PackImportResult }>(API.modPackImport, form);
      setResult(resp.result);
      setPhase('done');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('modPack.import.failed'));
      setPhase('preview');
    }
  };

  const busy = phase === 'inspecting' || phase === 'importing';
  const groups = new Map<PackPreviewEntry['kind'], PackPreviewEntry[]>();
  preview?.entries.forEach((e) => groups.set(e.kind, [...(groups.get(e.kind) ?? []), e]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('modPack.import.title')}</DialogTitle>
          <DialogDescription>{t('modPack.import.fileHint')}</DialogDescription>
        </DialogHeader>

        {(phase === 'pick' || phase === 'inspecting') && (
          <div className="space-y-2" data-testid="mod-pack-import-pick">
            <input
              ref={fileRef}
              type="file"
              accept=".wbfm-pack,application/x-wbfm-pack"
              aria-label={t('modPack.import.pickFile')}
              disabled={busy}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-primary-foreground hover:file:bg-primary/90"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void inspect(f);
              }}
            />
            {busy && <p className="text-sm text-muted-foreground">{t('modPack.import.inspecting')}</p>}
          </div>
        )}

        {phase === 'preview' && preview && (
          <div className="space-y-3" data-testid="mod-pack-import-preview">
            {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
            {preview.fatal ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive">{t('modPack.import.fatalTitle')}</p>
                <p className="mt-1 text-sm text-destructive">{preview.fatal.message}</p>
              </div>
            ) : (
              <>
                {preview.pack && (
                  <p className="text-sm">
                    {t('modPack.import.packInfo', {
                      name: preview.pack.name,
                      version: preview.pack.packVersion,
                      author: preview.pack.authorName,
                    })}
                  </p>
                )}
                <Button type="button" variant="outline" size="sm" onClick={selectAllValid}>
                  {t('modPack.import.selectAll')}
                </Button>
                {KIND_ORDER.filter((k) => groups.has(k)).map((kind) => (
                  <fieldset key={kind} className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      {groupLabel(t, kind, groups.get(kind)?.length ?? 0)}
                    </p>
                    {(groups.get(kind) ?? []).map((e) => (
                      <label
                        key={e.path}
                        className={`flex items-start gap-2 rounded-md p-1.5 text-sm ${
                          e.valid ? 'cursor-pointer hover:bg-muted/50' : 'opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4"
                          checked={selected.has(e.path)}
                          disabled={!e.valid}
                          onChange={() => toggle(e.path)}
                        />
                        <span className="space-y-0.5">
                          <span className="block">{e.name}</span>
                          {e.conflict && e.valid && (
                            <span className="block text-xs text-amber-600 dark:text-amber-400">
                              {t('modPack.import.conflict')}
                            </span>
                          )}
                          {!e.valid && e.errors.map((msg) => (
                            <span key={msg} className="block text-xs text-destructive">
                              {t('modPack.import.invalid')}：{msg}
                            </span>
                          ))}
                        </span>
                      </label>
                    ))}
                  </fieldset>
                ))}
              </>
            )}
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-2 text-sm" data-testid="mod-pack-import-done">
            <p>{t('modPack.import.done', {
              cards: result.counts.characterCards,
              scenes: result.counts.stageScenes,
              backgrounds: result.counts.stageBackgrounds,
            })}</p>
          </div>
        )}

        <DialogFooter>
          {phase === 'preview' && !preview?.fatal && (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.actions.cancel')}
              </Button>
              <Button type="button" onClick={() => void doImport()} disabled={selected.size === 0}>
                {t('modPack.import.submit')}（{selected.size}）
              </Button>
            </>
          )}
          {phase === 'done' && (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t('common.actions.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
