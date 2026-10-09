'use client';

import type { PermissionLevel, SkillInfo } from '@wbfm/shared/types';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { ApiClientError } from '@/lib/api/client';
import { useSkillMutations, useSkills } from '@/lib/hooks/use-skills';
import { useI18n } from '@/lib/i18n/use-i18n';

const PERMISSION_LABEL_KEYS: Record<PermissionLevel, MessageKey> = {
  read: 'settingsMcp.skills.permissionRead',
  write: 'settingsMcp.skills.permissionWrite',
  danger: 'settingsMcp.skills.permissionDanger',
};

const PERMISSION_VARIANTS: Record<PermissionLevel, 'success' | 'warning' | 'danger'> = {
  read: 'success',
  write: 'warning',
  danger: 'danger',
};

function SkillRow({ skill }: { skill: SkillInfo }) {
  const { t } = useI18n();
  const mutations = useSkillMutations();
  const toast = useToast();
  const confirm = useConfirm();

  /** 技能形态摘要：提示词注入 / 工具组合（可叠加） */
  const shapeSummary = (): string => {
    const manifest = skill.manifest;
    if (!manifest) return '—';
    const shapes: string[] = [];
    if (manifest.promptTemplates.length > 0) {
      shapes.push(t('settingsMcp.skills.shapePrompt'));
    }
    if (manifest.allowedTools.length > 0) {
      shapes.push(t('settingsMcp.skills.shapeTools', { count: manifest.allowedTools.length }));
    }
    return shapes.join(' · ') || '—';
  };

  const toggle = () => {
    mutations.update.mutate(
      { id: skill.id, body: { enabled: !skill.enabled } },
      {
        onSuccess: () =>
          toast.success(
            skill.enabled
              ? t('settingsMcp.skills.disabledName', { name: skill.name })
              : t('settingsMcp.skills.enabledName', { name: skill.name }),
          ),
        onError: (error) =>
          toast.error(error instanceof ApiClientError ? error.message : t('toast.operationFailed')),
      },
    );
  };

  const remove = async () => {
    if (
      !(await confirm({
        title: t('settingsMcp.skills.deleteRefTitle'),
        description: t('settingsMcp.skills.deleteRefConfirm', { name: skill.name }),
        confirmText: t('settingsMcp.skills.deleteRefButton'),
        danger: true,
      }))
    ) {
      return;
    }
    mutations.remove.mutate(skill.id, {
      onSuccess: () => toast.success(t('settingsMcp.skills.refDeleted')),
      onError: (error) =>
        toast.error(
          error instanceof ApiClientError ? error.message : t('settingsMcp.deleteFailed'),
        ),
    });
  };

  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md border p-3"
      data-testid="skill-item"
    >
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{skill.manifest?.description || skill.name}</span>
          <code className="rounded bg-muted px-1 text-xs text-muted-foreground">{skill.name}</code>
          {skill.manifest && (
            <span className="text-xs text-muted-foreground">v{skill.manifest.version}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {skill.manifest?.permissions.map((permission) => (
            <Badge key={permission} variant={PERMISSION_VARIANTS[permission]}>
              {t(PERMISSION_LABEL_KEYS[permission]!)}
            </Badge>
          ))}
          <span className="text-muted-foreground">{shapeSummary()}</span>
          {skill.manifest?.author && (
            <span className="text-muted-foreground">· {skill.manifest.author}</span>
          )}
        </div>
        {!skill.exists && (
          <p className="text-xs text-destructive">
            {t('settingsMcp.skills.sourceMissing', { path: skill.sourcePath })}
          </p>
        )}
        {skill.error && <p className="text-xs text-destructive">{skill.error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={skill.enabled}
            disabled={!skill.exists || skill.error !== null || mutations.update.isPending}
            onChange={toggle}
          />
          {t('common.actions.enable')}
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={mutations.remove.isPending}
          onClick={remove}
        >
          {t('common.actions.delete')}
        </Button>
      </div>
    </li>
  );
}

/** 设置页技能包面板（v0.6 M3）：列表 / 启停 / 权限摘要 / 删除引用 */
export function SkillsPanel() {
  const { t } = useI18n();
  const { data: skills, isLoading, isError, refetch } = useSkills();

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="skills-panel">
      <div>
        <h3 className="font-medium">{t('settingsMcp.skills.title')}</h3>
        <p className="text-xs text-muted-foreground">
          {t('settingsMcp.skills.description')}
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.actions.loading')}</p>}
      {isError && (
        <p className="text-sm text-destructive">
          {t('settingsMcp.skills.loadFailed')}
          <button className="underline" onClick={() => void refetch()}>
            {t('common.actions.retry')}
          </button>
        </p>
      )}
      {skills && skills.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('settingsMcp.skills.empty')}</p>
      )}
      {skills && skills.length > 0 && (
        <ul className="space-y-2" data-testid="skill-list">
          {skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} />
          ))}
        </ul>
      )}
    </section>
  );
}
