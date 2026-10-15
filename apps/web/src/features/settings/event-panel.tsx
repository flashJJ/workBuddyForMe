'use client';

import * as React from 'react';
import type { EventFrequencyTier } from '@wbfm/shared/schemas';
import { BUILT_IN_EVENTS } from '@wbfm/shared/events';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { CustomTriggerSection } from '@/features/events/custom-trigger-section';
import { EventUsageStats } from '@/features/events/event-usage-stats';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';

const TIERS: ReadonlyArray<{ id: EventFrequencyTier; labelKey: MessageKey }> = [
  { id: 'low', labelKey: 'settings.events.frequencyLow' },
  { id: 'standard', labelKey: 'settings.events.frequencyStandard' },
  { id: 'high', labelKey: 'settings.events.frequencyHigh' },
];

/**
 * v1.7 剧情演出设置：总开关 + 频率三档 + 内置剧本单条停用（v1.7 八个 + v2.0 九个）。
 * 与 EmotionPanel 同口径：乐观覆盖即时保存、挂载门控防水合结构交换。
 */
export function EventPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const enabled = settings?.eventsEnabled !== false;
  const tier: EventFrequencyTier = settings?.eventFrequencyTier ?? 'standard';
  const disabledIds = React.useMemo(
    () => new Set(settings?.disabledEventIds ?? []),
    [settings?.disabledEventIds],
  );

  const [masterOverride, setMasterOverride] = React.useState<boolean | null>(null);
  React.useEffect(() => setMasterOverride(null), [settings?.eventsEnabled]);
  const shownEnabled = masterOverride ?? enabled;

  const toggleMaster = async (next: boolean) => {
    setMasterOverride(next);
    try {
      await updateSettings.mutateAsync({ eventsEnabled: next });
    } catch {
      setMasterOverride(null);
    }
  };

  const changeTier = (next: EventFrequencyTier) => {
    if (next === tier) return;
    void updateSettings.mutateAsync({ eventFrequencyTier: next });
  };

  const toggleScene = async (eventId: string, nowEnabled: boolean) => {
    const current = settings?.disabledEventIds ?? [];
    const next = nowEnabled
      ? current.filter((id) => id !== eventId)
      : [...current, eventId];
    await updateSettings.mutateAsync({ disabledEventIds: next });
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="event-panel">
      <div>
        <h3 className="font-medium">{t('settings.events.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.events.description')}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          data-testid="event-enabled-toggle"
          checked={shownEnabled}
          onChange={(e) => void toggleMaster(e.target.checked)}
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">{t('settings.events.enable')}</span>
          <span className="block text-xs text-muted-foreground">{t('settings.events.enableHint')}</span>
        </span>
      </label>

      {shownEnabled && (
        <div className="space-y-4 border-t pt-3">
          <div className="space-y-1.5">
            <div className="text-sm font-medium">{t('settings.events.frequency')}</div>
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('settings.events.frequency')}>
              {hydrated &&
                TIERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={tier === item.id}
                    data-testid={`event-tier-${item.id}`}
                    onClick={() => changeTier(item.id)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${
                      tier === item.id
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {t(item.labelKey)}
                  </button>
                ))}
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.events.frequencyHint')}</p>
          </div>

          <div className="space-y-1.5">
            <div className="text-sm font-medium">{t('settings.events.scenesTitle')}</div>
            {hydrated &&
              BUILT_IN_EVENTS.map((def) => {
                const sceneEnabled = !disabledIds.has(def.id);
                return (
                  <label
                    key={def.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded px-1 py-1"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      data-testid={`event-scene-toggle-${def.id}`}
                      checked={sceneEnabled}
                      onChange={(e) => void toggleScene(def.id, e.target.checked)}
                    />
                    <span className="text-xs">{t(def.titleKey as MessageKey)}</span>
                  </label>
                );
              })}
            <p className="pt-1 text-xs text-muted-foreground">{t('settings.events.previewHint')}</p>
          </div>

          {hydrated && <CustomTriggerSection />}

          {hydrated && <EventUsageStats />}
        </div>
      )}
    </section>
  );
}
