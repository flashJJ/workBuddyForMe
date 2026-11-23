'use client';

import * as React from 'react';
import { DEFAULT_FLOW_SCHEDULE_TIMEZONE } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  isCommonTimezone,
  isValidIanaTimeZone,
  type ScheduleDraft,
} from './schedule-helpers';

export interface ScheduleFormProps {
  draft: ScheduleDraft;
  timezones: string[];
  disabled: boolean;
  saving: boolean;
  submitLabel: string;
  onChange: (patch: Partial<ScheduleDraft>) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/** v4.26 新建 / 编辑单条定时 */
export function ScheduleForm({
  draft,
  timezones,
  disabled,
  saving,
  submitLabel,
  onChange,
  onSubmit,
  onCancel,
}: ScheduleFormProps) {
  const { t } = useI18n();
  const [custom, setCustom] = React.useState(() => !isCommonTimezone(draft.timezone));
  const invalidTimeZone = custom && !isValidIanaTimeZone(draft.timezone);

  const toggleCustom = () => {
    if (custom) {
      setCustom(false);
      if (!isCommonTimezone(draft.timezone)) {
        onChange({ timezone: DEFAULT_FLOW_SCHEDULE_TIMEZONE });
      }
      return;
    }
    setCustom(true);
  };

  return (
    <div className="space-y-3 rounded border p-3">
      <label className="block space-y-1">
        <span className="text-xs font-medium">{t('flowEditor.schedule.nameLabel')}</span>
        <Input
          value={draft.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={t('flowEditor.schedule.namePlaceholder')}
          disabled={disabled}
          maxLength={40}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">{t('flowEditor.schedule.cronLabel')}</span>
        <Input
          value={draft.cron}
          onChange={(event) => onChange({ cron: event.target.value })}
          placeholder="0 9 * * *"
          disabled={disabled}
          spellCheck={false}
        />
        <span className="block text-[11px] text-muted-foreground">
          {t('flowEditor.schedule.cronHint')}
        </span>
      </label>

      <div className="block space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t('flowEditor.schedule.timezoneLabel')}</span>
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
            onClick={toggleCustom}
            disabled={disabled}
          >
            {custom
              ? t('flowEditor.schedule.useCommonTimezone')
              : t('flowEditor.schedule.customTimezone')}
          </button>
        </div>
        {custom ? (
          <Input
            value={draft.timezone}
            onChange={(event) => onChange({ timezone: event.target.value })}
            placeholder={t('flowEditor.schedule.customTimezonePlaceholder')}
            disabled={disabled}
            spellCheck={false}
            maxLength={64}
          />
        ) : (
          <SimpleSelect
            value={draft.timezone}
            onValueChange={(value) => onChange({ timezone: value })}
            disabled={disabled}
          >
            {timezones.map((timezone) => (
              <option key={timezone} value={timezone}>
                {timezone}
              </option>
            ))}
          </SimpleSelect>
        )}
        {invalidTimeZone ? (
          <span className="block text-[11px] text-warning">
            {t('flowEditor.schedule.invalidTimezone')}
          </span>
        ) : (
          <span className="block text-[11px] text-muted-foreground">
            {t('flowEditor.schedule.timezoneHint')}
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={draft.enabled}
          disabled={disabled}
          onChange={(event) => onChange({ enabled: event.target.checked })}
        />
        {t('flowEditor.schedule.enabled')}
      </label>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          {t('flowEditor.schedule.cancel')}
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={disabled || saving || invalidTimeZone}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
