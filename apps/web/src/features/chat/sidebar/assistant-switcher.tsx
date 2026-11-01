'use client';

import type { Assistant } from '@wbfm/shared/types';
import { SimpleSelect } from '@/components/ui/simple-select';
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
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">{t('chat.currentAssistant')}</span>
      <SimpleSelect
        aria-label={t('chat.switchAssistantAria')}
        className="h-8 w-full min-w-0 max-w-[12rem]"
        value={value}
        disabled={disabled || assistants.length === 0}
        onValueChange={onChange}
      >
        {assistants.map((assistant) => (
          <option key={assistant.id} value={assistant.id}>
            {assistant.emoji ? `${assistant.emoji} ` : ''}
            {assistant.name}
          </option>
        ))}
      </SimpleSelect>
    </div>
  );
}
