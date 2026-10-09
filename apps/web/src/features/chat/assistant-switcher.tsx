'use client';

import type { Assistant } from '@wbfm/shared/types';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  assistants: Assistant[];
  value: string;
  disabled?: boolean;
  onChange: (assistantId: string) => void;
}

export function AssistantSwitcher({ assistants, value, disabled, onChange }: Props) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{t('chat.currentAssistant')}</span>
      <Select
        aria-label={t('chat.switchAssistantAria')}
        className="h-8 w-44"
        value={value}
        disabled={disabled || assistants.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {assistants.map((assistant) => (
          <option key={assistant.id} value={assistant.id}>
            {assistant.emoji ? `${assistant.emoji} ` : ''}
            {assistant.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
