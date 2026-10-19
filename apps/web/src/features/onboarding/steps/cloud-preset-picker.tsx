'use client';

import { PROVIDER_PRESETS, type ProviderPreset } from '@wbfm/shared/constants';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v2.4 P0-1（T3）：常用厂商预设卡片。
 * 点选只把「名称 + Base URL」填进表单，Key 仍需用户自备（可点旁边链接去申请）。
 */
export function CloudPresetPicker({ onPick }: { onPick: (preset: ProviderPreset) => void }) {
  const { t } = useI18n();

  return (
    <div className="space-y-2" data-testid="ob-cloud-presets">
      <p className="text-xs font-medium">{t('onboarding.provider.presets.title')}</p>
      <div className="flex flex-wrap gap-1.5">
        {PROVIDER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPick(preset)}
            data-testid={`ob-preset-${preset.id}`}
            className="rounded border px-2 py-1 text-xs hover:bg-accent"
          >
            {preset.name}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t('onboarding.provider.presets.lead')}</p>
    </div>
  );
}
