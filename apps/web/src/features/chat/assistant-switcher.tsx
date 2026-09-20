'use client';

import type { Assistant } from '@wbfm/shared';
import { Select } from '@/components/ui/select';

interface Props {
  assistants: Assistant[];
  value: string;
  disabled?: boolean;
  onChange: (assistantId: string) => void;
}

export function AssistantSwitcher({ assistants, value, disabled, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">当前助手</span>
      <Select
        aria-label="切换助手"
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
