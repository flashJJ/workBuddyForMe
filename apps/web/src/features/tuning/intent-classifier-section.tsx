'use client';

import type { ProviderModel } from '@wbfm/shared/types';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useSettings, useUpdateSettings } from '@/lib/hooks/provider';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v4.8：规则低置信度时的小模型意图识别（全局设置，默认关） */
export function IntentClassifierSection({ chatModels }: { chatModels: ProviderModel[] }) {
  const { t } = useI18n();
  const toast = useToast();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const enabled = settings?.intentClassifierEnabled === true;

  const save = async (patch: { intentClassifierEnabled?: boolean; intentClassifierModelId?: string | null }) => {
    try {
      await update.mutateAsync(patch);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
    }
  };

  return (
    <div className="space-y-2 rounded-md border bg-ui-row p-3" data-testid="tuning-intent-classifier">
      <div>
        <h4 className="text-sm font-medium">{t('tuning.intent.title')}</h4>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('tuning.intent.description')}</p>
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          data-testid="tuning-intent-enabled"
          checked={enabled}
          onChange={(e) => void save({ intentClassifierEnabled: e.target.checked })}
        />
        {t('tuning.intent.enabled')}
      </label>
      <div className="space-y-1">
        <Label htmlFor="tuning-intent-model">{t('tuning.intent.model')}</Label>
        <SimpleSelect
          id="tuning-intent-model"
          aria-label={t('tuning.intent.model')}
          data-testid="tuning-intent-model"
          value={settings?.intentClassifierModelId ?? ''}
          disabled={!enabled}
          onValueChange={(value) => void save({ intentClassifierModelId: value || null })}
        >
          <option value="">{t('tuning.intent.followDefault')}</option>
          {chatModels.map((model) => (
            <option key={model.id} value={model.id}>
              {t('assistants.form.modelOption', {
                displayName: model.displayName,
                modelId: model.modelId,
              })}
            </option>
          ))}
        </SimpleSelect>
        <p className="text-[11px] text-muted-foreground">{t('tuning.intent.timeoutHint')}</p>
      </div>
    </div>
  );
}
