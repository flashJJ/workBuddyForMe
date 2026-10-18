'use client';

import * as React from 'react';
import {
  ACTION_CHAIN_IDS,
  MOTION_MOODS,
  RELATIONSHIP_LEVEL_NAMES,
  TRIGGER_KEY_GROUPS,
  type ActionChainId,
  type InteractionGraphCondition,
  type InteractionGraphEntry,
  type MotionMood,
  type RelationshipLevel,
} from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';

const SELECT = 'h-8 rounded-md border bg-background px-2 text-sm';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** 时段下拉的选项文案：`7:00` */
const hourLabel = (hour: number) => `${hour}:00`;

/** 触发键分组标签（技术键保持原值，只有分组名本地化） */
const GROUP_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  touch: 'settingsGraph.groupTouch',
  context: 'settingsGraph.groupContext',
  system: 'settingsGraph.groupSystem',
  relationship: 'settingsGraph.groupRelationship',
};

interface Props {
  entry: InteractionGraphEntry;
  index: number;
  onChange: (next: InteractionGraphEntry) => void;
  onRemove: () => void;
}

/**
 * 动画图覆盖条目的可视化编辑器：触发键（全事件类型分组下拉）+ 条件（等级 / 档位 / 时段）
 * + 动作条目。纯受控组件，不持有状态——所有改动经 onChange 交回面板（面板持有草稿、显式保存）。
 */
export function InteractionGraphRow({ entry, index, onChange, onRemove }: Props) {
  const { t } = useI18n();
  const condition = entry.condition ?? {};
  const hours = condition.hours;

  const patch = (next: Partial<InteractionGraphEntry>) => onChange({ ...entry, ...next });
  const patchCondition = (next: Partial<InteractionGraphCondition>) =>
    patch({ condition: { ...condition, ...next } });

  return (
    <div className="space-y-2 rounded-md border bg-background/60 p-3" data-testid={`graph-row-${index}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('settingsGraph.triggerKey')}</span>
        <select
          className={SELECT}
          data-testid={`graph-key-${index}`}
          value={entry.key}
          onChange={(e) => patch({ key: e.target.value })}
        >
          {TRIGGER_KEY_GROUPS.map((group) => (
            <optgroup
              key={group.id}
              label={t(GROUP_LABEL_KEYS[group.id] ?? 'settingsGraph.triggerKey')}
            >
              {group.keys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={onRemove}
          data-testid={`graph-remove-${index}`}
          className="ml-auto rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          {t('settingsGraph.remove')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('settingsGraph.condition')}</span>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t('settingsGraph.levelLabel')}
          <select
            className={SELECT}
            data-testid={`graph-level-${index}`}
            value={condition.minLevel ?? ''}
            onChange={(e) =>
              patchCondition({ minLevel: (e.target.value || undefined) as RelationshipLevel | undefined })
            }
          >
            <option value="">{t('settingsGraph.any')}</option>
            {RELATIONSHIP_LEVEL_NAMES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t('settingsGraph.moodLabel')}
          <select
            className={SELECT}
            data-testid={`graph-mood-${index}`}
            value={condition.mood ?? ''}
            onChange={(e) => patchCondition({ mood: (e.target.value || undefined) as MotionMood | undefined })}
          >
            <option value="">{t('settingsGraph.any')}</option>
            {MOTION_MOODS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            data-testid={`graph-hours-toggle-${index}`}
            checked={Boolean(hours)}
            onChange={(e) =>
              patchCondition({ hours: e.target.checked ? { startHour: 23, endHour: 6 } : undefined })
            }
          />
          {t('settingsGraph.hoursLabel')}
        </label>
        {hours && (
          <>
            <select
              className={SELECT}
              data-testid={`graph-hours-start-${index}`}
              value={hours.startHour}
              onChange={(e) => patchCondition({ hours: { ...hours, startHour: Number(e.target.value) } })}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
            <select
              className={SELECT}
              data-testid={`graph-hours-end-${index}`}
              value={hours.endHour}
              onChange={(e) => patchCondition({ hours: { ...hours, endHour: Number(e.target.value) } })}
            >
              {HOURS.map((hour) => (
                <option key={hour} value={hour}>
                  {hourLabel(hour)}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('settingsGraph.chain')}</span>
        <select
          className={SELECT}
          data-testid={`graph-chain-${index}`}
          value={entry.chainId}
          onChange={(e) => patch({ chainId: e.target.value as ActionChainId })}
        >
          {ACTION_CHAIN_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
