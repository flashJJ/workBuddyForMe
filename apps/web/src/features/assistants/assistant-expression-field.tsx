'use client';

import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/** v1.0 M3：助手「表情指令」开关——开启后系统提示词追加表情标签指令片段 */
export function AssistantExpressionField({ checked, onChange }: Props) {
  const { t } = useI18n();
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4"
        data-testid="assistant-expression-enabled"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        {t('assistants.expression.label')}
        <span className="ml-1 text-xs text-muted-foreground">
          {t('assistants.expression.hint')}
        </span>
      </span>
    </label>
  );
}
