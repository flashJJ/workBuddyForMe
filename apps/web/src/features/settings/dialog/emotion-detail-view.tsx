'use client';

import * as React from 'react';
import type {
  EmotionEventView,
  EmotionState,
  RelationLevel,
} from '@wbfm/shared/schemas';
import { moodLevelOf, relationLevelOf } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { apiDelete, apiGet } from '@/lib/api/client';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';

interface EmotionDetail {
  state: EmotionState;
  events: EmotionEventView[];
}

/** 数值→等级 i18n key（UI 边界，与模型边界中文文案不同源；负向/正向共用六档） */
function moodKey(value: number): MessageKey {
  return `emotion.levels.mood.${moodLevelOf(value)}` as MessageKey;
}
function relationKey(value: number): MessageKey {
  const level: RelationLevel = relationLevelOf(value);
  return `emotion.levels.relation.${level}` as MessageKey;
}

function StateRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/60 px-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** 助手情绪状态快照 + 近期事件流水 + 重置（M4）；从 emotion-panel 拆出守行数门禁 */
export function EmotionDetailView({ assistantId }: { assistantId: string }) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [detail, setDetail] = React.useState<EmotionDetail | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setDetail(await apiGet<EmotionDetail>(`/api/assistants/${assistantId}/emotion?events=10`));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'settings.emotion.loadFailed' }));
    } finally {
      setLoading(false);
    }
    // toast 在回调内读取，t 随语言变化时也应重载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantId, locale]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const reset = async () => {
    if (
      !(await confirm({
        title: t('settings.emotion.resetTitle'),
        description: t('settings.emotion.resetConfirm'),
        confirmText: t('settings.emotion.resetConfirmText'),
        danger: true,
      }))
    ) {
      return;
    }
    try {
      const fresh = await apiDelete<EmotionState>(`/api/assistants/${assistantId}/emotion`);
      setDetail({ state: fresh, events: [] });
      toast.success(t('settings.emotion.resetDone'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'settings.emotion.loadFailed' }));
    }
  };

  if (loading || !detail) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  const { state, events } = detail;
  const timeFmt = new Intl.DateTimeFormat(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="space-y-3" data-testid="emotion-detail">
      <div className="space-y-1.5">
        <StateRow label={t('settings.emotion.moodHappiness')} value={t(moodKey(state.mood.happiness))} />
        <StateRow label={t('settings.emotion.moodAnger')} value={t(moodKey(state.mood.anger))} />
        <StateRow label={t('settings.emotion.moodSadness')} value={t(moodKey(state.mood.sadness))} />
        <StateRow label={t('settings.emotion.intimacy')} value={t(relationKey(state.relation.intimacy))} />
        <StateRow label={t('settings.emotion.trust')} value={t(relationKey(state.relation.trust))} />
        <StateRow
          label={t('settings.emotion.need')}
          value={t(`emotion.need.${state.currentNeed}` as MessageKey)}
        />
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">
          {t('settings.emotion.eventsTitle')}
        </div>
        {events.length === 0 ? (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {t('settings.emotion.eventsEmpty')}
          </p>
        ) : (
          <ul className="space-y-1">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-1.5 text-xs"
              >
                <span className="flex items-center gap-1.5">
                  <span className="font-medium">
                    {t(`emotion.event.${event.type}` as MessageKey)}
                  </span>
                  {event.emotion && event.emotion !== 'neutral' && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {event.emotion}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {t(`emotion.source.${event.source}` as MessageKey)}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {timeFmt.format(new Date(event.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => void reset()}>
          {t('settings.emotion.reset')}
        </Button>
      </div>
    </div>
  );
}
