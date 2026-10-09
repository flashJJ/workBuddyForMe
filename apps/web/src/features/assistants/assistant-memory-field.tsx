'use client';

import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/** 助手编辑表单中的长期记忆开关（v0.5） */
export function AssistantMemoryField({ checked, onChange }: Props) {
  const { t } = useI18n();
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        data-testid="assistant-memory-enabled"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {t('assistants.memory.label')}
        <span className="ml-1 text-xs text-muted-foreground">
          {t('assistants.memory.hint')}
        </span>
      </span>
    </label>
  );
}
