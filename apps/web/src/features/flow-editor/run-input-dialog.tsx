'use client';

import * as React from 'react';
import { Play } from 'lucide-react';
import type { FlowInputField } from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface RunInputDialogProps {
  open: boolean;
  fields: FlowInputField[];
  /** 重跑时预填上次输入 */
  initial?: Record<string, unknown>;
  onSubmit: (values: Record<string, unknown>) => void;
  onClose: () => void;
}

export function RunInputDialog({ open, fields, initial, onSubmit, onClose }: RunInputDialogProps) {
  const [values, setValues] = React.useState<Record<string, string | boolean>>({});

  React.useEffect(() => {
    if (!open) return;
    const seed: Record<string, string | boolean> = {};
    for (const f of fields) {
      const prev = initial?.[f.name];
      seed[f.name] =
        f.type === 'boolean' ? prev === true : prev === undefined || prev === null ? '' : String(prev);
    }
    setValues(seed);
  }, [open, fields, initial]);

  const submit = () => {
    const result: Record<string, unknown> = {};
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === 'boolean') {
        result[f.name] = v === true;
      } else if (f.type === 'number') {
        if (v !== '' && v !== undefined) result[f.name] = Number(v);
        else if (f.default !== undefined) result[f.name] = f.default;
      } else if (v !== '' && v !== undefined) {
        result[f.name] = v;
      } else if (f.default !== undefined) {
        result[f.name] = f.default;
      }
    }
    onSubmit(result);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>试运行</DialogTitle>
          <DialogDescription>填写开始节点声明的入参，流程将从开始节点执行。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">该流程没有声明入参，可直接运行。</p>
          )}
          {fields.map((f) => (
            <div key={f.name} className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">
                {f.name}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  {f.type}
                  {f.required !== false && ' · 必填'}
                </span>
              </label>
              {f.type === 'boolean' ? (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={values[f.name] === true}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.checked }))}
                  />
                  true
                </label>
              ) : (
                <Input
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={String(values[f.name] ?? '')}
                  placeholder={f.description ?? f.name}
                  onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                  className="h-9 text-sm"
                />
              )}
              {f.description && <p className="text-[11px] text-muted-foreground">{f.description}</p>}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={submit}>
            <Play className="h-4 w-4" />
            开始运行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
