'use client';

import type { SkillInfo } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ApiClientError } from '@/lib/api/client';
import {
  useSkillVersionDelete,
  useSkillVersionRollback,
  useSkillVersions,
} from '@/lib/hooks/use-skill-versions';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 字节数展示（KB / MB，保留一位小数） */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** v2.14：技能面板内的版本快照列表与回退入口；v2.15：占用与删除 */
export function SkillVersionsPanel({ skill }: { skill: SkillInfo }) {
  const { t } = useI18n();
  const { data, isLoading, isError } = useSkillVersions(skill.name);
  const rollback = useSkillVersionRollback(skill.name);
  const remove = useSkillVersionDelete(skill.name);
  const confirm = useConfirm();
  const toast = useToast();

  const requestRollback = async (version: string) => {
    if (
      !(await confirm({
        title: t('settingsMcp.skills.versions.rollbackTitle'),
        description: t('settingsMcp.skills.versions.rollbackConfirm', {
          name: skill.name,
          version,
        }),
        confirmText: t('settingsMcp.skills.versions.rollbackButton'),
        danger: true,
      }))
    ) {
      return;
    }
    rollback.mutate(version, {
      onSuccess: () =>
        toast.success(
          t('settingsMcp.skills.versions.rolledBack', { name: skill.name, version }),
        ),
      onError: (error) =>
        toast.error(
          error instanceof ApiClientError
            ? error.message
            : t('settingsMcp.skills.versions.rollbackFailed'),
        ),
    });
  };

  const requestDelete = async (version: string, sizeBytes: number) => {
    if (
      !(await confirm({
        title: t('settingsMcp.skills.versions.deleteTitle'),
        description: t('settingsMcp.skills.versions.deleteConfirm', {
          name: skill.name,
          version,
          size: formatBytes(sizeBytes),
        }),
        confirmText: t('settingsMcp.skills.versions.deleteButton'),
        danger: true,
      }))
    ) {
      return;
    }
    remove.mutate(version, {
      onSuccess: (result) =>
        toast.success(
          t('settingsMcp.skills.versions.deleted', {
            version,
            size: formatBytes(result.deleted.freedBytes),
          }),
        ),
      onError: (error) =>
        toast.error(
          error instanceof ApiClientError
            ? error.message
            : t('settingsMcp.skills.versions.deleteFailed'),
        ),
    });
  };

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">{t('common.actions.loading')}</p>;
  }
  if (isError || !data) {
    return <p className="text-xs text-destructive">{t('settingsMcp.skills.versions.loadFailed')}</p>;
  }
  if (!data.versioningAvailable || data.versions.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('settingsMcp.skills.versions.empty')}</p>;
  }

  const canDelete = (active: boolean) => !active && data.versions.length > 1;

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2" data-testid="skill-versions">
      <p className="text-xs text-muted-foreground" data-testid="skill-versions-total">
        {t('settingsMcp.skills.versions.total', {
          count: String(data.versions.length),
          size: formatBytes(data.totalBytes),
        })}
      </p>
      <ul className="space-y-1">
        {data.versions.map((version) => (
          <li
            key={version.id}
            className="flex items-center justify-between gap-2 text-xs"
            data-testid="skill-version-item"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-medium">v{version.version}</span>
              <span className="text-muted-foreground">{formatBytes(version.sizeBytes)}</span>
              <span className="text-muted-foreground">
                {new Date(version.createdAt).toLocaleString()}
              </span>
              {version.active && (
                <Badge variant="success">{t('settingsMcp.skills.versions.active')}</Badge>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {version.active ? (
                <span className="text-xs text-muted-foreground" data-testid="skill-version-protected">
                  {t('settingsMcp.skills.versions.protectedActive')}
                </span>
              ) : data.versions.length <= 1 ? (
                <span className="text-xs text-muted-foreground" data-testid="skill-version-protected">
                  {t('settingsMcp.skills.versions.protectedLast')}
                </span>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={version.active || rollback.isPending || remove.isPending}
                onClick={() => void requestRollback(version.version)}
              >
                {t('settingsMcp.skills.versions.rollback')}
              </Button>
              {canDelete(version.active) && (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  data-testid={`skill-version-delete-${version.version}`}
                  disabled={remove.isPending}
                  onClick={() => void requestDelete(version.version, version.sizeBytes)}
                >
                  {t('settingsMcp.skills.versions.delete')}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
