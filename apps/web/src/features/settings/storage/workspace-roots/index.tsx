'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import {
  useSnapshotCleanup,
  useSnapshotSettings,
  useSnapshotUsage,
  useUpdateSnapshotSettings,
  useUpdateWorkspaceRoots,
  useWorkspaceRoots,
} from '@/lib/hooks/flows';

/** v5.1：授权根、快照开关与占用清理 */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function WorkspaceRootsPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const roots = useWorkspaceRoots();
  const updateRoots = useUpdateWorkspaceRoots();
  const settings = useSnapshotSettings();
  const updateSettings = useUpdateSnapshotSettings();
  const usage = useSnapshotUsage();
  const cleanup = useSnapshotCleanup();
  const [draft, setDraft] = React.useState('');

  const fail = (error: unknown) =>
    toast.error(errorText(error, t, { fallback: 'flowRuns.fileSafety.settings.failed' }));

  const userRoots = (roots.data?.roots ?? []).filter((root) => root !== roots.data?.defaultRoot);

  const addRoot = async () => {
    const next = draft.trim();
    if (!next) return;
    try {
      await updateRoots.mutateAsync([...userRoots, next]);
      setDraft('');
      toast.success(t('flowRuns.fileSafety.settings.saved'));
    } catch (error) {
      fail(error);
    }
  };

  const removeRoot = async (root: string) => {
    try {
      await updateRoots.mutateAsync(userRoots.filter((item) => item !== root));
      toast.success(t('flowRuns.fileSafety.settings.saved'));
    } catch (error) {
      fail(error);
    }
  };

  const toggleSnapshots = async (enabled: boolean) => {
    if (!settings.data) return;
    try {
      await updateSettings.mutateAsync({ ...settings.data, enabled });
      toast.success(t('flowRuns.fileSafety.settings.saved'));
    } catch (error) {
      fail(error);
    }
  };

  const runCleanup = async (dryRun: boolean) => {
    try {
      const result = await cleanup.mutateAsync(dryRun);
      toast.success(t('flowRuns.fileSafety.settings.cleaned', { count: result.removed }));
    } catch (error) {
      fail(error);
    }
  };

  return (
    <section className="space-y-4 text-xs">
      <header>
        <h3 className="font-medium">{t('flowRuns.fileSafety.settings.title')}</h3>
        <p className="mt-1 text-muted-foreground">
          {t('flowRuns.fileSafety.settings.description')}
        </p>
      </header>

      {roots.data && (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            {t('flowRuns.fileSafety.settings.defaultRoot', { path: roots.data.defaultRoot })}
          </p>
          <p className="text-muted-foreground">
            {t('flowRuns.fileSafety.settings.limit', { count: roots.data.maxRoots })}
          </p>
          <ul className="space-y-1">
            {userRoots.map((root) => (
              <li key={root} className="flex items-center justify-between gap-2">
                <span className="truncate">{root}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={updateRoots.isPending}
                  onClick={() => void removeRoot(root)}
                >
                  {t('flowRuns.fileSafety.settings.remove')}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Input
              value={draft}
              placeholder={t('flowRuns.fileSafety.settings.addPlaceholder')}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Button
              size="sm"
              disabled={updateRoots.isPending || !draft.trim()}
              onClick={() => void addRoot()}
            >
              {t('flowRuns.fileSafety.settings.add')}
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.data?.enabled ?? false}
            disabled={!settings.data || updateSettings.isPending}
            onChange={(event) => void toggleSnapshots(event.target.checked)}
          />
          {t('flowRuns.fileSafety.settings.enabled')}
        </label>
        {usage.data && (
          <span className="text-muted-foreground">
            {t('flowRuns.fileSafety.settings.usage', {
              size: formatBytes(usage.data.bytes),
              quota: formatBytes(usage.data.quotaBytes),
            })}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={cleanup.isPending}
          onClick={() => void runCleanup(true)}
        >
          {t('flowRuns.fileSafety.settings.cleanupPreview')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={cleanup.isPending}
          onClick={() => void runCleanup(false)}
        >
          {t('flowRuns.fileSafety.settings.cleanup')}
        </Button>
      </div>
    </section>
  );
}
