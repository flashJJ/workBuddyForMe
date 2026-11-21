'use client';

import { Button } from '@/components/ui/button';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { SettingsPanelId } from '@/lib/settings/catalog';

const QUICK: { id: SettingsPanelId; labelKey: MessageKey }[] = [
  { id: 'providers', labelKey: 'settingsQuick.providers' },
  { id: 'voice-preference', labelKey: 'settingsQuick.voice' },
  { id: 'mcp', labelKey: 'settingsQuick.mcp' },
  { id: 'appearance', labelKey: 'settingsQuick.appearance' },
  { id: 'backup', labelKey: 'settingsQuick.data' },
];

/** v4.17：未固定任何面板时给出五个常用入口，避免设置中心「找不到从哪开始」 */
export function SettingsQuickLinks({ onOpen }: { onOpen: (id: SettingsPanelId) => void }) {
  const { t } = useI18n();
  return (
    <section
      className="rounded-lg border bg-ui-card p-4"
      data-testid="settings-quick-links"
      aria-label={t('settingsQuick.title')}
    >
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('settingsQuick.title')}
      </p>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((item) => (
          <Button
            key={item.id}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpen(item.id)}
          >
            {t(item.labelKey)}
          </Button>
        ))}
      </div>
    </section>
  );
}
