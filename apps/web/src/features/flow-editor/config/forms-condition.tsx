'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import type { MessageKey } from '@wbfm/shared/i18n';
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

const OPS: Array<{ value: ConditionOp; label: MessageKey; noRight?: boolean }> = [
  { value: '==', label: 'flowEditor.form.condition.op.eq' },
  { value: '!=', label: 'flowEditor.form.condition.op.neq' },
  { value: 'contains', label: 'flowEditor.form.condition.op.contains' },
  { value: 'notContains', label: 'flowEditor.form.condition.op.notContains' },
  { value: 'startsWith', label: 'flowEditor.form.condition.op.startsWith' },
  { value: 'endsWith', label: 'flowEditor.form.condition.op.endsWith' },
  { value: '>', label: 'flowEditor.form.condition.op.gt' },
  { value: '<', label: 'flowEditor.form.condition.op.lt' },
  { value: 'isEmpty', label: 'flowEditor.form.condition.op.isEmpty', noRight: true },
];

export function ConditionForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
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
  const refs = buildRefOptions(nodes, nodeId, t);

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
        <label className="text-xs font-medium text-muted-foreground">{t('flowEditor.form.condition.matchLabel')}</label>
        <Select value={match} onChange={(e) => patch({ match: e.target.value as ConditionMatch })}>
          <option value="all">{t('flowEditor.form.condition.matchAll')}</option>
          <option value="any">{t('flowEditor.form.condition.matchAny')}</option>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        {rules.map((rule, i) => {
          const noRight = OPS.find((o) => o.value === rule.op)?.noRight;
          return (
            <div key={i} className="rounded-md border p-2">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">
                  {t('flowEditor.form.condition.ruleIndex', { index: i + 1 })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Input
                value={rule.left}
                onChange={(e) => update(i, { left: e.target.value })}
                placeholder={t('flowEditor.form.condition.leftPlaceholder')}
                className="mt-1.5 h-8 font-mono text-xs"
              />
              {refs.length > 0 && (
                <Select value="" onChange={(e) => update(i, { left: `${rule.left}${e.target.value}` })}>
                  <option value="">{t('flowEditor.ref.insertVariable')}</option>
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
                    {t(o.label)}
                  </option>
                ))}
              </Select>
              {!noRight && (
                <Input
                  value={str(rule.right)}
                  onChange={(e) => update(i, { right: e.target.value })}
                  placeholder={t('flowEditor.form.condition.rightPlaceholder')}
                  className="mt-2 h-8 font-mono text-xs"
                />
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
          <Plus className="h-3.5 w-3.5" />
          {t('flowEditor.form.condition.addRule')}
        </Button>
      </div>
    </div>
  );
}
