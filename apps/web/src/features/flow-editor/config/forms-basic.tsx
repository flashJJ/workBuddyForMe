'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { FlowInputField, FlowInputValueType } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { Field, Input, RefTextarea, Select, str, type NodeConfigFormProps } from './form-primitives';

const INPUT_TYPES: FlowInputValueType[] = ['string', 'number', 'boolean'];

/** start：流程入参声明（发布为 flow 工具时生成 JSON Schema） */
export function StartForm({ config, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
  const inputs = React.useMemo<FlowInputField[]>(
    () => (Array.isArray(config.inputs) ? (config.inputs as FlowInputField[]) : []),
    [config.inputs],
  );

  const update = (index: number, partial: Partial<FlowInputField>) => {
    const next = inputs.map((item, i) => (i === index ? { ...item, ...partial } : item));
    patch({ inputs: next });
  };
  const add = () =>
    patch({
      inputs: [
        ...inputs,
        { name: `arg${inputs.length + 1}`, type: 'string' as const, required: true },
      ],
    });
  const remove = (index: number) =>
    patch({ inputs: inputs.filter((_, i) => i !== index) });

  return (
    <div className="flex flex-col gap-3">
      <Field label={t('flowEditor.form.start.inputsLabel')} hint={t('flowEditor.form.start.inputsHint')}>
        <div className="flex flex-col gap-2">
          {inputs.map((field, i) => (
            <div key={i} className="rounded-md border p-2">
              <div className="flex items-center gap-2">
                <Input
                  value={field.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder={t('flowEditor.form.start.namePlaceholder')}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => remove(i)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Select
                  value={field.type}
                  onChange={(e) => update(i, { type: e.target.value as FlowInputValueType })}
                  className="h-8 text-xs"
                >
                  {INPUT_TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {ty}
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={field.required !== false}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                  {t('flowEditor.form.start.required')}
                </label>
              </div>
              <Input
                value={field.description ?? ''}
                onChange={(e) => update(i, { description: e.target.value })}
                placeholder={t('flowEditor.form.start.descPlaceholder')}
                className="mt-2 h-8 text-xs"
              />
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={add} className="w-full">
            <Plus className="h-3.5 w-3.5" />
            {t('flowEditor.form.start.addInput')}
          </Button>
        </div>
      </Field>
    </div>
  );
}

/** human：审核说明（支持插值，输出 { approved, values }） */
export function HumanForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
  return (
    <Field
      label={t('flowEditor.form.human.promptLabel')}
      hint={t('flowEditor.form.human.promptHint')}
    >
      <RefTextarea
        value={str(config.prompt)}
        nodes={nodes}
        currentNodeId={nodeId}
        onChange={(prompt) => patch({ prompt })}
        rows={5}
        placeholder={t('flowEditor.form.human.promptPlaceholder')}
      />
    </Field>
  );
}

/** end：最终输出映射（整串单个引用会保留原始类型） */
export function EndForm({ nodeId, config, nodes, patch }: NodeConfigFormProps) {
  const { t } = useI18n();
  return (
    <Field
      label={t('flowEditor.form.end.outputLabel')}
      hint={t('flowEditor.form.end.outputHint')}
    >
      <RefTextarea
        value={str(config.output)}
        nodes={nodes}
        currentNodeId={nodeId}
        onChange={(output) => patch({ output })}
        rows={4}
        placeholder={t('flowEditor.form.end.outputPlaceholder')}
      />
    </Field>
  );
}
