'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select, str, type NodeConfigFormProps } from './form-primitives';
import { buildRefOptions } from './ref-options';

type ConditionOp =
  | '=='
  | '!='
  | 'contains'
  | 'notContains'
  | 'startsWith'
  | 'endsWith'
  | '>'
  | '<'
  | 'isEmpty';
type ConditionMatch = 'all' | 'any';

interface ConditionRuleDraft {
  left: string;
  op: ConditionOp;
  right?: unknown;
}

const OPS: Array<{ value: ConditionOp; label: string; noRight?: boolean }> = [
  { value: '==', label: '等于 ==' },
  { value: '!=', label: '不等于 !=' },
  { value: 'contains', label: '包含' },
  { value: 'notContains', label: '不包含' },
  { value: 'startsWith', label: '开头是' },
  { value: 'endsWith', label: '结尾是' },
  { value: '>', label: '大于 >' },
  { value: '<', label: '小于 <' },
  { value: 'isEmpty', label: '为空', noRight: true },
];

export function ConditionForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const rules = React.useMemo<ConditionRuleDraft[]>(
    () =>
      Array.isArray(config.rules)
        ? (config.rules as ConditionRuleDraft[]).map((r) => ({
            left: str(r?.left),
            op: (r?.op as ConditionOp) ?? '==',
            ...(r?.right !== undefined ? { right: r.right } : {}),
          }))
        : [],
    [config.rules],
  );
  const match = (config.match as ConditionMatch) ?? 'all';
  const refs = buildRefOptions(nodes, nodeId);

  const update = (index: number, partial: Partial<ConditionRuleDraft>) => {
    const next = rules.map((r, i) => {
      if (i !== index) return r;
      const merged = { ...r, ...partial };
      if (OPS.find((o) => o.value === merged.op)?.noRight) delete merged.right;
      return merged;
    });
    patch({ rules: next });
  };
  const add = () =>
    patch({ rules: [...rules, { left: '', op: '==', right: '' }] });
  const remove = (index: number) => patch({ rules: rules.filter((_, i) => i !== index) });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">满足方式</label>
        <Select value={match} onChange={(e) => patch({ match: e.target.value as ConditionMatch })}>
          <option value="all">全部规则满足（AND）</option>
          <option value="any">任一规则满足（OR）</option>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        {rules.map((rule, i) => {
          const noRight = OPS.find((o) => o.value === rule.op)?.noRight;
          return (
            <div key={i} className="rounded-md border p-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">规则 {i + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7 text-muted-foreground hover:text-red-500"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                value={rule.left}
                onChange={(e) => update(i, { left: e.target.value })}
                placeholder="左值（可粘贴 {{$nodes.…}}）"
                className="mt-1.5 h-8 font-mono text-xs"
              />
              {refs.length > 0 && (
                <Select value="" onChange={(e) => update(i, { left: `${rule.left}${e.target.value}` })}>
                  <option value="">+ 插入变量</option>
                  {refs.map((opt) => (
                    <option key={opt.token} value={opt.token}>
                      {opt.group} · {opt.label}
                    </option>
                  ))}
                </Select>
              )}
              <Select
                value={rule.op}
                onChange={(e) => update(i, { op: e.target.value as ConditionOp })}
                className="mt-2 h-8 text-xs"
              >
                {OPS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
              {!noRight && (
                <Input
                  value={str(rule.right)}
                  onChange={(e) => update(i, { right: e.target.value })}
                  placeholder="右值"
                  className="mt-2 h-8 font-mono text-xs"
                />
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
          <Plus className="h-3.5 w-3.5" />
          添加规则
        </Button>
      </div>
    </div>
  );
}
