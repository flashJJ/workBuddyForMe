'use client';

import * as React from 'react';

const AREA =
  'min-h-20 w-full rounded-md border bg-ui-control p-2 font-mono text-xs placeholder:text-muted-foreground/70';

function lines(values: string[]): string {
  return values.join('\n');
}

function fromLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 策略列表编辑框（逐行一条；从 agent-governance-section 外迁守行数门禁） */
export function ListField(props: {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  /** 示例占位：告诉用户每行该写什么，避免空白框无从下手 */
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {props.label}
      <textarea
        className={AREA}
        placeholder={props.placeholder}
        value={lines(props.value)}
        onChange={(event) => props.onChange(fromLines(event.target.value))}
      />
    </label>
  );
}
