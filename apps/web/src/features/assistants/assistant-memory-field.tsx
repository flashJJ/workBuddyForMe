'use client';

interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
}

/** 助手编辑表单中的长期记忆开关（v0.5） */
export function AssistantMemoryField({ checked, onChange }: Props) {
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
        开启长期记忆
        <span className="ml-1 text-xs text-muted-foreground">
          （每轮自动召回相关记忆，对话后提取值得记住的信息；需配置嵌入模型）
        </span>
      </span>
    </label>
  );
}
