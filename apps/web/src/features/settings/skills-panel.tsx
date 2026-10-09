'use client';

import type { PermissionLevel, SkillInfo } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useSkillMutations, useSkills } from '@/lib/hooks/use-skills';

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  read: '读',
  write: '写',
  danger: '危险',
};

const PERMISSION_VARIANTS: Record<PermissionLevel, 'success' | 'warning' | 'danger'> = {
  read: 'success',
  write: 'warning',
  danger: 'danger',
};

/** 技能形态摘要：提示词注入 / 工具组合（可叠加） */
function shapeSummary(skill: SkillInfo): string {
  const manifest = skill.manifest;
  if (!manifest) return '—';
  const shapes: string[] = [];
  if (manifest.promptTemplates.length > 0) shapes.push('提示词');
  if (manifest.allowedTools.length > 0) shapes.push(`${manifest.allowedTools.length} 个工具`);
  return shapes.join(' · ') || '—';
}

function SkillRow({ skill }: { skill: SkillInfo }) {
  const mutations = useSkillMutations();
  const toast = useToast();

  const toggle = () => {
    mutations.update.mutate(
      { id: skill.id, body: { enabled: !skill.enabled } },
      {
        onSuccess: () => toast.success(skill.enabled ? `已停用「${skill.name}」` : `已启用「${skill.name}」`),
        onError: (error) =>
          toast.error(error instanceof ApiClientError ? error.message : '操作失败'),
      },
    );
  };

  const remove = () => {
    if (
      !window.confirm(
        `删除技能「${skill.name}」的引用？\n\n源文件夹保留在数据目录 skills/ 下不会被删除；重启后若文件夹仍在会重新登记为启用。`,
      )
    ) {
      return;
    }
    mutations.remove.mutate(skill.id, {
      onSuccess: () => toast.success('已删除引用'),
      onError: (error) =>
        toast.error(error instanceof ApiClientError ? error.message : '删除失败'),
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
              {PERMISSION_LABELS[permission]}
            </Badge>
          ))}
          <span className="text-muted-foreground">{shapeSummary(skill)}</span>
          {skill.manifest?.author && (
            <span className="text-muted-foreground">· {skill.manifest.author}</span>
          )}
        </div>
        {!skill.exists && (
          <p className="text-xs text-destructive">源文件夹缺失：{skill.sourcePath}</p>
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
          启用
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={mutations.remove.isPending}
          onClick={remove}
        >
          删除
        </Button>
      </div>
    </li>
  );
}

/** 设置页技能包面板（v0.6 M3）：列表 / 启停 / 权限摘要 / 删除引用 */
export function SkillsPanel() {
  const { data: skills, isLoading, isError, refetch } = useSkills();

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="skills-panel">
      <div>
        <h3 className="font-medium">技能包</h3>
        <p className="text-xs text-muted-foreground">
          数据目录 skills/ 下的技能文件夹（含 skill.json），重启后自动识别；启停即时生效。
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">加载中…</p>}
      {isError && (
        <p className="text-sm text-destructive">
          技能加载失败，
          <button className="underline" onClick={() => void refetch()}>
            重试
          </button>
        </p>
      )}
      {skills && skills.length === 0 && (
        <p className="text-sm text-muted-foreground">
          还没有技能。内置示例（周报生成、会议纪要整理）会在启动后自动出现在这里。
        </p>
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
