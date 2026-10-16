'use client';

import * as React from 'react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';

/**
 * v2.0 M3 系统事件感知授权分组：
 * - 独立授权开关，默认关闭（缺省 false，与剧情总开关分开治理）；
 * - 挂载门控防水合结构交换；乐观翻转 + 失败回落（与 EventPanel 同纪律）；
 * - 文案明示用途与边界：仅本机判定、不读窗口标题/屏幕/文档、原始信号不保存。
 */
export function AwarenessPermissionSection() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  const enabled = settings?.systemEventAwarenessEnabled === true;
  const [override, setOverride] = React.useState<boolean | null>(null);
  React.useEffect(() => setOverride(null), [settings?.systemEventAwarenessEnabled]);
  const shown = override ?? enabled;

  const toggle = async (next: boolean) => {
    setOverride(next);
    try {
      await updateSettings.mutateAsync({ systemEventAwarenessEnabled: next });
    } catch {
      setOverride(null);
    }
  };

  return (
    <div
      className="space-y-1.5 border-t pt-3"
      data-testid="awareness-permission-section"
    >
      <div className="text-sm font-medium">{t('settings.events.awarenessTitle')}</div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded px-1 py-1">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          data-testid="awareness-enabled-toggle"
          checked={hydrated && shown}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span className="space-y-0.5">
          <span className="block text-xs font-medium">{t('settings.events.awarenessEnable')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('settings.events.awarenessHint')}
          </span>
        </span>
      </label>
    </div>
  );
}
