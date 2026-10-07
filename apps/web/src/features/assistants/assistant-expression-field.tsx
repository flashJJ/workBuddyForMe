'use client';

interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/** v1.0 M3：助手「表情指令」开关——开启后系统提示词追加表情标签指令片段 */
export function AssistantExpressionField({ checked, onChange }: Props) {
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
        启用表情指令
        <span className="ml-1 text-xs text-muted-foreground">
          （回复中插入 [joy] 等标签驱动 Live2D 形象；标签不会显示在对话里、不会被朗读）
        </span>
      </span>
    </label>
  );
}
