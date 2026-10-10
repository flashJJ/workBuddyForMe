'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { FlowCanvasNode } from '../graph-utils';
import { buildRefOptions } from './ref-options';

/** 配置表单统一入参 */
export interface NodeConfigFormProps {
  nodeId: string;
  config: Record<string, unknown>;
  nodes: FlowCanvasNode[];
  onChange: (next: Record<string, unknown>) => void;
  patch: (partial: Record<string, unknown>) => void;
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-[11px] leading-tight text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

export function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 带「插入变量」的多行模板输入 */
export function RefTextarea({
  value,
  nodes,
  currentNodeId,
  onChange,
  rows = 4,
  placeholder,
}: {
  value: string;
  nodes: FlowCanvasNode[];
  currentNodeId: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const { t } = useI18n();
  const options = React.useMemo(
    () => buildRefOptions(nodes, currentNodeId, t),
    [nodes, currentNodeId, t],
  );
  const groups = React.useMemo(() => {
    const map = new Map<string, typeof options>();
    for (const opt of options) {
      const list = map.get(opt.group) ?? [];
      list.push(opt);
      map.set(opt.group, list);
    }
    return [...map.entries()];
  }, [options]);

  const insert = (token: string) => {
    const el = ref.current;
    if (!el) {
      onChange(value ? `${value} ${token}` : token);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + token.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-xs leading-relaxed"
      />
      <Select value="" onChange={(e) => insert(e.target.value)} disabled={options.length === 0}>
        <option value="">
          {options.length === 0 ? t('flowEditor.ref.noVariables') : t('flowEditor.ref.insertVariable')}
        </option>
        {groups.map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map((opt) => (
              <option key={opt.token} value={opt.token}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    </div>
  );
}

/**
 * JSON 对象编辑器：本地维护文本，合法时上抛解析值。
 * 用于工具节点 args（引擎会递归解析字符串内的引用 token）。
 */
export function JsonObjectEditor({
  value,
  onChange,
}: {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = React.useState(() => JSON.stringify(value ?? {}, null, 2));
  const [error, setError] = React.useState<string | null>(null);

  // 外部值变更（切换节点）时同步
  React.useEffect(() => {
    setText(JSON.stringify(value ?? {}, null, 2));
    setError(null);
  }, [value]);

  const handle = (next: string) => {
    setText(next);
    try {
      const parsed = JSON.parse(next || '{}') as unknown;
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setError(t('flowEditor.ref.jsonNotObject'));
        return;
      }
      setError(null);
      onChange(parsed as Record<string, unknown>);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('flowEditor.ref.jsonInvalid'));
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        value={text}
        rows={6}
        onChange={(e) => handle(e.target.value)}
        className="font-mono text-xs"
        spellCheck={false}
      />
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

export { Input, Select };
