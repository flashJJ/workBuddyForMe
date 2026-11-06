import * as React from 'react';
import { cn } from '@/lib/utils';

type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
type Size = 'sm' | 'md' | 'lg';

// v1.2：全部走语义 CSS 变量（明暗两套在 globals.css 定义），不再手写 dark: 变体
const VARIANT_CLASS: Record<Variant, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success-background text-success',
  warning: 'bg-warning-background text-warning',
  danger: 'bg-destructive/10 text-destructive',
  info: 'bg-info-background text-info',
  outline: 'border text-muted-foreground',
};

// v2.23 三档尺寸：默认 md 与旧样式一致，长列表/密集表格用 sm
const SIZE_CLASS: Record<Size, string> = {
  sm: 'px-1.5 py-0 text-[10px] leading-4',
  md: 'px-2 py-0.5 text-xs',
  lg: 'px-2.5 py-1 text-sm',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  size?: Size;
}

export function Badge({ className, variant = 'default', size = 'md', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    />
  );
}
