'use client';

import * as React from 'react';
import type { EmotionState } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { RELATIONSHIP_MILESTONES } from '@wbfm/shared/constants';
import { displayLevelOf } from '@wbfm/core/relationship-client';
import { Spinner } from '@/components/common/state';
import { apiGet } from '@/lib/api/client';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useToast } from '@/components/common/toast';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useCharacterCards } from '@/lib/hooks/use-character-cards';
import {
  milestoneI18nKey,
  useRelationshipMilestones,
} from '@/lib/hooks/use-relationship-milestones';

const LEVELS = [1, 2, 3] as const;

/**
 * v2.0 助手关系等级明细：当前等级（文案化，无分数/进度条）、
 * 各档剪影与解锁清单（称呼/纪念演出）、规则说明。只读，等级数据来自
 * GET emotion 的 state.relationship；卡称呼经卡库按 assistant.cardId 关联。
 */
export function RelationshipLevelView({ assistantId }: { assistantId: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const [state, setState] = React.useState<EmotionState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const { data: assistants } = useAssistants();
  const { data: cards } = useCharacterCards();
  // 注意：该 hook 必须在 loading 提前返回之前调用（React hooks 顺序约束）
  const { data: milestones } = useRelationshipMilestones(assistantId, true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiGet<EmotionState>(`/api/assistants/${assistantId}/emotion`)
      .then((value) => {
        if (!cancelled && value?.relationship && value.relation) setState(value);
      })
      .catch((error) => {
        toast.error(errorText(error, t, { fallback: 'settings.emotion.loadFailed' }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // toast 取全局稳定实例；locale 切换时重载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, locale]);

  if (loading || !state) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  const level = displayLevelOf(state.relationship, state.relation);
  const cardId = assistants?.find((a) => a.id === assistantId)?.cardId ?? null;
  const nicknames = cards?.find((c) => c.id === cardId)?.parsed.nicknameByLevel;
  const achievedByKey = new Map((milestones ?? []).map((m) => [m.milestoneKey, m]));
  const timeFmt = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="space-y-3" data-testid="relationship-level-view">
      <div className="rounded-md bg-muted/60 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {t('settings.relationship.current')}
          </span>
          <span className="text-sm font-medium" data-testid="relationship-current-level">
            {t(`relationship.level.${level}` as MessageKey)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(`relationship.hint.${level}` as MessageKey)}
        </p>
        {state.relationship.highestLevelEver > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground/80">
            {t('relationship.highestEver', {
              level: t(
                `relationship.level.${state.relationship.highestLevelEver}` as MessageKey,
              ),
            })}
          </p>
        )}
      </div>

      <ul className="space-y-1.5" data-testid="relationship-unlock-list">
        {LEVELS.map((lv) => {
          const unlocked = level >= lv;
          const nickname = nicknames?.[lv];
          return (
            <li
              key={lv}
              className="rounded-md border bg-card px-3 py-2 text-xs"
              data-testid={`relationship-level-row-${lv}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={unlocked ? 'font-medium' : 'text-muted-foreground'}>
                  {t(`relationship.level.${lv}` as MessageKey)}
                </span>
                <span
                  className={
                    unlocked
                      ? 'shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary'
                      : 'shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground'
                  }
                >
                  {unlocked
                    ? t('relationship.unlocks.unlocked')
                    : t('relationship.unlocks.locked')}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">
                {t(`relationship.milestone.${lv}` as MessageKey)}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {t('relationship.unlocks.scene')}
                </span>
                <span
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  title={nickname ?? undefined}
                >
                  {t('relationship.unlocks.nickname')}
                  {nickname ? `：${nickname}` : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="space-y-1.5" data-testid="relationship-milestones">
        <div className="text-xs font-medium">{t('relationship.milestones.title')}</div>
        {(!milestones || milestones.length === 0) && (
          <p className="text-[11px] text-muted-foreground">{t('relationship.milestones.empty')}</p>
        )}
        <ul className="space-y-1">
          {RELATIONSHIP_MILESTONES.map((def) => {
            const achieved = achievedByKey.get(def.key);
            return (
              <li
                key={def.key}
                data-testid={`relationship-milestone-row-${milestoneI18nKey(def.key)}`}
                className="flex items-center justify-between gap-2 rounded border bg-card px-2.5 py-1.5 text-xs"
              >
                <span className={achieved ? 'font-medium' : 'text-muted-foreground'}>
                  {t(`relationship.milestones.${milestoneI18nKey(def.key)}` as MessageKey)}
                </span>
                {achieved ? (
                  <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                    {t('relationship.milestones.achievedAt', {
                      date: timeFmt.format(new Date(achieved.achievedAt)),
                    })}
                  </span>
                ) : (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t('relationship.milestones.lockedHint')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium">{t('relationship.rules.title')}</div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t('relationship.rules.body')}
        </p>
      </div>
    </div>
  );
}
