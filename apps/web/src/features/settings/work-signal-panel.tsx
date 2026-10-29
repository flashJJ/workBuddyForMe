'use client';

import * as React from 'react';
import type { AppSettings } from '@wbfm/shared/types';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';

type Patch = Partial<AppSettings>;

/**
 * v2.7 工作汇报设置：总开关、气泡模式、三类提示音、减少动态、待机节奏。
 * 乐观覆盖 + 失败回滚，避免受控 checkbox 在设置重拉窗口被旧值弹回。
 */
export function WorkSignalPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [local, setLocal] = React.useState<Patch>({});

  React.useEffect(() => setLocal({}), [settings]);

  const value = <K extends keyof AppSettings>(key: K, fallback: AppSettings[K]): AppSettings[K] =>
    (local[key] ?? settings?.[key] ?? fallback) as AppSettings[K];

  const save = <K extends keyof AppSettings>(key: K, next: AppSettings[K]) => {
    setLocal((prev) => ({ ...prev, [key]: next }));
    void update.mutateAsync({ [key]: next } as Patch).catch(() => {
      setLocal((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    });
  };

  const enabled = value('workSignalEnabled', true);
  const bubbleMode = (value('workBubbleMode', 'auto') ?? 'auto') as 'auto' | 'always' | 'hidden';
  const reduceMotion = value('workReduceMotion', false);

  const soundRow = (
    label: string,
    key: 'workSoundDone' | 'workSoundError' | 'workSoundApproval',
  ) => (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-input"
        checked={value(key, true)}
        onChange={(event) => save(key, event.target.checked)}
        data-testid={`work-${key}`}
      />
      {label}
    </label>
  );

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="work-signal-panel">
      <div>
        <h3 className="font-medium">{t('settings.work.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.work.description')}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          checked={enabled}
          onChange={(event) => save('workSignalEnabled', event.target.checked)}
          data-testid="work-signal-enabled"
        />
        <span className="text-sm font-medium">{t('settings.work.enabled')}</span>
      </label>

      {enabled && (
        <div className="space-y-4 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{t('settings.work.bubbleMode')}</span>
            <SimpleSelect
              value={bubbleMode}
              onValueChange={(next) => save('workBubbleMode', next as typeof bubbleMode)}
              aria-label={t('settings.work.bubbleMode')}
              data-testid="work-bubble-mode"
              className="w-40"
            >
              <option value="auto">{t('settings.work.modeAuto')}</option>
              <option value="always">{t('settings.work.modeAlways')}</option>
              <option value="hidden">{t('settings.work.modeHidden')}</option>
            </SimpleSelect>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">{t('settings.work.sound')}</span>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {soundRow(t('settings.work.soundDone'), 'workSoundDone')}
              {soundRow(t('settings.work.soundError'), 'workSoundError')}
              {soundRow(t('settings.work.soundApproval'), 'workSoundApproval')}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              checked={reduceMotion}
              onChange={(event) => save('workReduceMotion', event.target.checked)}
              data-testid="work-reduce-motion"
            />
            {t('settings.work.reduceMotion')}
          </label>
        </div>
      )}
    </section>
  );
}
