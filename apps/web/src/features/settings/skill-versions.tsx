'use client';

import type { SkillInfo } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ApiClientError } from '@/lib/api/client';
import { useSkillVersionRollback, useSkillVersions } from '@/lib/hooks/use-skill-versions';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v2.14：技能面板内的版本快照列表与回退入口 */
export function SkillVersionsPanel({ skill }: { skill: SkillInfo }) {
  const { t } = useI18n();
  const { data, isLoading, isError } = useSkillVersions(skill.name);
  const rollback = useSkillVersionRollback(skill.name);
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

  if (isLoading) {
    return <p className="text-xs text-muted-foreground">{t('common.actions.loading')}</p>;
  }
  if (isError || !data) {
    return <p className="text-xs text-destructive">{t('settingsMcp.skills.versions.loadFailed')}</p>;
  }
  if (!data.versioningAvailable || data.versions.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('settingsMcp.skills.versions.empty')}</p>;
  }

  return (
    <div className="rounded-md border bg-muted/30 p-2" data-testid="skill-versions">
      <ul className="space-y-1">
        {data.versions.map((version) => (
          <li
            key={version.id}
            className="flex items-center justify-between gap-2 text-xs"
            data-testid="skill-version-item"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-medium">v{version.version}</span>
              <span className="text-muted-foreground">
                {new Date(version.createdAt).toLocaleString()}
              </span>
              {version.active && (
                <Badge variant="success">{t('settingsMcp.skills.versions.active')}</Badge>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={version.active || rollback.isPending}
              onClick={() => void requestRollback(version.version)}
            >
              {t('settingsMcp.skills.versions.rollback')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
