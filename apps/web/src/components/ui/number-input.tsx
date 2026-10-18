'use client';

import * as React from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18nOptional } from '@/lib/i18n/i18n-context';

export interface NumberInputProps {
  /** 当前值；`null` 表示未设置（配合 allowEmpty 显示为空白） */
  value: number | null;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  /** 步进量，默认 1 */
  step?: number;
  /** 允许清空：清空并失焦后回调 onClear（可选值字段用） */
  allowEmpty?: boolean;
  onClear?: () => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** 输入框宽度类（按钮固定 32px，其余给输入框），默认自适应 */
  inputClassName?: string;
  'aria-label'?: string;
  'data-testid'?: string;
}

const clamp = (value: number, min?: number, max?: number): number => {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};

/**
 * v2.3 统一数值输入：减号 / 输入框 / 加号三件套，带 min/max 钳制。
 *
 * 取代裸用 `<input type="number">`——浏览器原生 spinner 点击生硬、样式不受控、
 * 小窗易挤压（用户反馈「选择数字很生硬」）。输入框走 `type=text` + `inputMode=numeric`
 * 以避免原生 spinner，失焦或回车时统一提交并钳制。
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  allowEmpty,
  onClear,
  id,
  className,
  disabled,
  inputClassName,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: NumberInputProps) {
  const i18n = useI18nOptional();
  const [draft, setDraft] = React.useState<string>(value === null ? '' : String(value));

  // 外部值变化（含钳制后的回写）同步到草稿
  React.useEffect(() => setDraft(value === null ? '' : String(value)), [value]);

  const commit = (raw: string) => {
    if (raw.trim() === '') {
      if (allowEmpty) {
        setDraft('');
        onClear?.();
        return;
      }
      setDraft(value === null ? '' : String(value)); // 不允许清空：回退当前值
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setDraft(value === null ? '' : String(value)); // 非法输入回退当前值，不上报 NaN
      return;
    }
    const next = clamp(parsed, min, max);
    setDraft(String(next));
    if (next !== value) onValueChange(next);
  };

  const stepBy = (direction: 1 | -1) => {
    // 未设置时以最小值为起点（加号先落在下限，避免越过 min）
    const base = value ?? (min ?? 0) - step;
    const next = clamp(base + direction * step, min, max);
    if (next !== value) onValueChange(next);
    setDraft(String(next));
  };

  const atMin = min !== undefined && value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;

  const buttonClass =
    'flex w-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      className={cn(
        'flex h-9 items-stretch rounded-md border border-input bg-background shadow-sm',
        'focus-within:ring-2 focus-within:ring-ring',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
      data-testid={testId}
    >
      <button
        type="button"
        aria-label={i18n?.t('common.controls.decreaseNumber') ?? '减少'}
        disabled={disabled || atMin}
        onClick={() => stepBy(-1)}
        className={cn(buttonClass, 'rounded-l-md')}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <input
        id={id}
        role="spinbutton"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit((event.target as HTMLInputElement).value);
            (event.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          'min-w-0 border-x border-input bg-transparent px-2 text-center text-sm',
          'focus-visible:outline-none',
          inputClassName ?? 'w-full',
        )}
      />
      <button
        type="button"
        aria-label={i18n?.t('common.controls.increaseNumber') ?? '增加'}
        disabled={disabled || atMax}
        onClick={() => stepBy(1)}
        className={cn(buttonClass, 'rounded-r-md')}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
