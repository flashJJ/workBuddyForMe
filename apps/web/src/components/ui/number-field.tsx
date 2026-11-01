'use client';

import * as React from 'react';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';

interface Props {
  id: string;
  label: string;
  value: string;
  step: string;
  min: string;
  max?: string;
  onChange: (value: string) => void;
}

/** 助手表单中的数值采样参数字段 */
export function NumberField({ id, label, value, step, min, max, onChange }: Props) {
  const handleChange = React.useCallback(
    (next: number) => onChange(String(next)),
    [onChange],
  );
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NumberInput
        id={id}
        value={Number(value)}
        step={Number(step)}
        min={Number(min)}
        max={max !== undefined ? Number(max) : undefined}
        onValueChange={handleChange}
      />
    </div>
  );
}
