import * as React from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/** 页面统一头部：标题、说明与右侧操作区，置于 PageShell 顶部全宽展示 */
export function PageHeader({ title, description, actions, icon, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b bg-card px-6 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {icon}
          <span className="truncate">{title}</span>
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

interface PageShellProps extends React.ComponentPropsWithoutRef<'div'> {
  /** 固定在顶部的页面头部 */
  header?: React.ReactNode;
  /** 内容区内边距与布局类名，默认 p-6 */
  bodyClassName?: string;
}

/** 页面骨架：头部固定，内容区独立滚动 */
export function PageShell({ header, bodyClassName, className, children, ...rest }: PageShellProps) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)} {...rest}>
      {header}
      <PageBody className={bodyClassName}>{children}</PageBody>
    </div>
  );
}

/** 页面内容区：统一 24px 内边距与滚动容器 */
export function PageBody({
  className,
  children,
  ...rest
}: React.ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cn('flex-1 overflow-auto p-6', className)} {...rest}>
      {children}
    </div>
  );
}
