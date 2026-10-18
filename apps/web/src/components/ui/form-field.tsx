'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface FormFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  labelClassName?: string;
  children: React.ReactNode;
}

/**
 * v2.3 统一表单字段：label + 控件 + 提示/错误 的一致间距。
 *
 * 背景：各面板手写 label 与控件的包裹，间距不一，窄窗时 label 常紧贴控件
 * （用户反馈「文字挤压变形」）。本组件把「label 在上、间距 1.5、错误优先于提示」固化为规范。
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  className,
  labelClassName,
  children,
}: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label !== undefined && (
        <label
          htmlFor={htmlFor}
          className={cn('text-xs font-medium text-muted-foreground', labelClassName)}
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
