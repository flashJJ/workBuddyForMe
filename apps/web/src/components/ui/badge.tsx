import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

// v1.2：全部走语义 CSS 变量（明暗两套在 globals.css 定义），不再手写 dark: 变体
const VARIANT_CLASS: Record<Variant, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success-background text-success',
  warning: 'bg-warning-background text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info-background text-info',
  outline: 'border text-muted-foreground',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        VARIANT_CLASS[variant],
        className,
      )}
      {...props}
    />
  );
}
