'use client';

import * as React from 'react';
import type {
  EmotionEventView,
  EmotionState,
  MoodLevel,
  RelationLevel,
} from '@wbfm/shared/schemas';
import { moodLevelOf, relationLevelOf } from '@wbfm/shared/schemas';
import type { MessageKey } from '@wbfm/shared/i18n';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/common/state';
import { useToast } from '@/components/common/toast';
import { useConfirm } from '@/components/common/confirm-dialog';
import { apiDelete, apiGet } from '@/lib/api/client';
import { errorText } from '@/lib/i18n/resolve-error';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';

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

function EmotionDetailView({ assistantId }: { assistantId: string }) {
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

/**
 * v1.6 M4 情绪与互动设置面板：
 * 总开关（即时保存）+ 助手选择 + 状态/近期互动查看 + 重置。
 */
export function EmotionPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: assistants } = useAssistants();
  const [selectedId, setSelectedId] = React.useState<string>('');

  // 默认选中第一个助手
  React.useEffect(() => {
    if (!selectedId && assistants && assistants.length > 0) {
      setSelectedId(assistants[0]!.id);
    }
    if (selectedId && assistants && !assistants.some((a) => a.id === selectedId)) {
      setSelectedId(assistants[0]?.id ?? '');
    }
  }, [assistants, selectedId]);

  const enabled = settings?.emotionEnabled !== false;

  const toggle = async (next: boolean) => {
    try {
      await updateSettings.mutateAsync({ emotionEnabled: next });
    } catch (error) {
      // 开关失败由全局 toast 兜底；这里不重复提示
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="emotion-panel">
      <div>
        <h3 className="font-medium">{t('settings.emotion.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.emotion.description')}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          data-testid="emotion-enabled-toggle"
          checked={enabled}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">{t('settings.emotion.enable')}</span>
          <span className="block text-xs text-muted-foreground">{t('settings.emotion.enableHint')}</span>
        </span>
      </label>

      {enabled && (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="emotion-assistant-select">{t('settings.emotion.assistant')}</Label>
            {assistants && assistants.length > 0 ? (
              <select
                id="emotion-assistant-select"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {assistants.map((assistant) => (
                  <option key={assistant.id} value={assistant.id}>
                    {assistant.emoji ? `${assistant.emoji} ` : ''}
                    {assistant.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">{t('settings.emotion.noAssistant')}</p>
            )}
          </div>

          {selectedId && (
            <>
              <div className="text-xs font-medium text-muted-foreground">
                {t('settings.emotion.stateTitle')}
              </div>
              <EmotionDetailView key={selectedId} assistantId={selectedId} />
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('settings.emotion.hint')}</p>
    </section>
  );
}
