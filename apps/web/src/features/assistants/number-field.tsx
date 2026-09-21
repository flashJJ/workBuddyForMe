'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
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
    (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
    [onChange],
  );
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        min={min}
        max={max}
        onChange={handleChange}
      />
    </div>
  );
}
