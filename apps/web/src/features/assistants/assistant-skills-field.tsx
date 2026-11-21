'use client';

import type { SkillInfo } from '@wbfm/shared/types';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSkills } from '@/lib/hooks/capability';

interface Props {
  /** 已勾选的技能 name（空数组 = 跟随全局全部已启用技能） */
  value: string[];
  /** 技能选择上限；达到后禁用未勾选项，避免保存时被截断（B-62） */
  limit: number;
  onChange: (next: string[]) => void;
}

/**
 * v2.4 M4（P1-2）· 助手级技能勾选。
 *
 * 与「工具」区块的区别：
 * - 技能 = 能力包（提示词流程 + 预绑定工具），勾选后只对该助手生效；
 * - 工具 = 单个工具白名单，与技能相互独立（技能预绑定工具仍会并入）。
 *
 * 只列设置页已全局启用的技能：全局停用的技能即使勾选也不会注入（停用即回收）。
 */
export function AssistantSkillsField({ value, limit, onChange }: Props) {
  const { t } = useI18n();
  const { data: skills } = useSkills();
  const enabledSkills = (skills ?? []).filter((skill) => skill.enabled && skill.manifest !== null);
  const atLimit = value.length >= limit;

  const toggle = (name: string) => {
    onChange(value.includes(name) ? value.filter((item) => item !== name) : [...value, name]);
  };

  return (
    <fieldset className="space-y-2 rounded-md border bg-ui-row p-3" data-testid="assistant-skills-field">
      <legend className="px-1 text-xs font-medium text-muted-foreground">
        {t('assistants.skills.legend')}
      </legend>
      <p className="text-[11px] text-muted-foreground">{t('assistants.skills.hint')}</p>
      {enabledSkills.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('assistants.skills.empty')}</p>
      ) : (
        enabledSkills.map((skill: SkillInfo) => {
          const checked = value.includes(skill.name);
          const disabled = atLimit && !checked;
          return (
            <label
              key={skill.id}
              className={`flex items-start gap-2 text-sm ${
                disabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'
              }`}
              data-testid={`assistant-skill-option-${skill.name}`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(skill.name)}
              />
              <span className="min-w-0">
                <span className="block font-mono leading-tight">{skill.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {skill.manifest?.description}
                </span>
              </span>
            </label>
          );
        })
      )}
      <p className="border-t pt-2 text-[11px] text-muted-foreground">
        {value.length === 0 ? t('assistants.skills.followGlobal') : t('assistants.skills.selected', { count: value.length })}
      </p>
      {atLimit && (
        <p className="text-[11px] text-muted-foreground">
          {t('assistants.skills.limitHint', { max: limit })}
        </p>
      )}
    </fieldset>
  );
}
