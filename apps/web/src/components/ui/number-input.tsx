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
  /** 千分位展示（仅展示层；输入仍只接受数字，回调为纯数字） */
  groupThousands?: boolean;
  id?: string;
  className?: string;
  disabled?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
}

const clamp = (value: number, min?: number, max?: number): number => {
  let next = value;
  if (min !== undefined) next = Math.max(min, next);
  if (max !== undefined) next = Math.min(max, next);
  return next;
};

/** 只保留数字、前导负号与最多一个小数点；groupThousands 时仅对整数部分插入千分位 */
function formatDraft(raw: string, groupThousands: boolean, allowDecimal: boolean): string {
  const negative = raw.trimStart().startsWith('-');
  let cleaned = raw.replace(/[^\d.]/g, '');
  if (!allowDecimal) {
    cleaned = cleaned.replace(/\./g, '');
  } else {
    const dot = cleaned.indexOf('.');
    if (dot >= 0) {
      cleaned = `${cleaned.slice(0, dot + 1)}${cleaned.slice(dot + 1).replace(/\./g, '')}`;
    }
  }
  const [integerPart = '', ...rest] = cleaned.split('.');
  const decimals = allowDecimal && cleaned.includes('.') ? `.${rest.join('')}` : '';
  if (integerPart === '' && decimals === '') return negative ? '-' : '';
  const body = groupThousands
    ? integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : integerPart;
  return `${negative ? '-' : ''}${body || '0'}${decimals}`;
}

/** 提交前去掉千分位，避免 Number('1,000') 得到 NaN */
function parseDraft(raw: string): number {
  return Number(raw.replace(/,/g, '').trim());
}

/** 光标前有几个有效字符（数字或前导负号），用于格式化后还原光标 */
function countValueChars(text: string, upTo: number): number {
  let count = 0;
  for (let i = 0; i < upTo && i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '-' ? i === 0 : /[\d.]/.test(ch)) count += 1;
  }
  return count;
}

/** 把光标放到第 count 个有效字符之后 */
function caretAfterValueChars(text: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === '-' ? i === 0 : /[\d.]/.test(ch)) {
      seen += 1;
      if (seen >= count) return i + 1;
    }
  }
  return text.length;
}

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
  groupThousands = false,
  id,
  className,
  disabled,
  'aria-label': ariaLabel,
  'data-testid': testId,
}: NumberInputProps) {
  const i18n = useI18nOptional();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pendingCaretRef = React.useRef<number | null>(null);
  const allowDecimal = !Number.isInteger(step);
  const stepPrecision = allowDecimal ? (String(step).split('.')[1] ?? '').length : 0;
  const formatValue = React.useCallback(
    (next: number | null): string => {
      if (next === null) return '';
      return groupThousands ? formatDraft(String(next), true, true) : String(next);
    },
    [groupThousands],
  );
  const [draft, setDraft] = React.useState<string>(formatValue(value));

  // 外部值变化（含钳制后的回写）同步到草稿
  React.useEffect(() => setDraft(formatValue(value)), [value, formatValue]);

  // 千分位格式化会改变字符位置，渲染后按数字个数还原光标
  React.useLayoutEffect(() => {
    const pending = pendingCaretRef.current;
    if (pending === null) return;
    pendingCaretRef.current = null;
    inputRef.current?.setSelectionRange(pending, pending);
  });

  const commit = (raw: string) => {
    if (raw.trim() === '') {
      if (allowEmpty) {
        setDraft('');
        onClear?.();
        return;
      }
      setDraft(formatValue(value)); // 不允许清空：回退当前值
      return;
    }
    const parsed = parseDraft(raw);
    if (Number.isNaN(parsed)) {
      setDraft(formatValue(value)); // 非法输入回退当前值，不上报 NaN
      return;
    }
    const next = clamp(parsed, min, max);
    setDraft(formatValue(next));
    if (next !== value) onValueChange(next);
  };

  const stepBy = (direction: 1 | -1) => {
    // 未设置时以最小值为起点（加号先落在下限，避免越过 min）
    const base = value ?? (min ?? 0) - step;
    const stepped = Number((base + direction * step).toFixed(stepPrecision));
    const next = clamp(stepped, min, max);
    if (next !== value) onValueChange(next);
    setDraft(formatValue(next));
  };

  const atMin = min !== undefined && value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;

  // 按钮定宽 + 输入框按内容自适应宽度：整体尺寸自持（w-fit），调用方无需再传宽度。
  // 早期版本把宽度交给调用方（如 w-20），两侧按钮吃掉全部空间后数字被裁成看不见，
  // 表现为「点加减没反应」——故此处把输入框宽度固定下来，保证数字始终可读。
  // 千分位与大数值（如 1,000,000）需要随内容增长，否则末位会被裁掉。
  const buttonClass =
    'flex w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div
      className={cn(
        'inline-flex h-9 w-fit items-stretch rounded-md border border-input bg-ui-control shadow-sm',
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
        ref={inputRef}
        id={id}
        role="spinbutton"
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        aria-label={ariaLabel}
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        value={draft}
        disabled={disabled}
        style={{ width: `${Math.max(2, draft.length) + 1}ch` }}
        onChange={(event) => {
          const raw = event.target.value;
          const caret = event.target.selectionStart ?? raw.length;
          const next = formatDraft(raw, groupThousands, allowDecimal);
          pendingCaretRef.current = caretAfterValueChars(
            next,
            countValueChars(raw, caret),
          );
          setDraft(next);
        }}
        onBlur={(event) => commit(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit((event.target as HTMLInputElement).value);
            (event.target as HTMLInputElement).blur();
          }
        }}
        className={cn(
          'min-w-14 shrink-0 border-x border-input bg-transparent px-1 text-center text-sm',
          'focus-visible:outline-none',
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
