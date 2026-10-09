'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * promise 化确认对话框（替代 window.confirm）：
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: '删除供应商', description: '…' }))) return;
 *
 * - Esc/点遮罩/点取消 → resolve(false)；确认 → resolve(true)
 * - 危险操作（删除）传 danger，默认焦点落在「取消」，Enter 不会误删
 * - 任意时刻只有一个确认框；卸载 Provider 时未决 promise 一律按 false 收敛
 */

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** 危险动作（删除等）：确认钮用 destructive 样式 */
  danger?: boolean;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

interface PendingState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingState | null>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);

  const confirm = React.useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const settle = React.useCallback(
    (value: boolean) => {
      pending?.resolve(value);
      setPending(null);
    },
    [pending],
  );

  // 卸载时把未决 promise 收敛为 false，避免调用点永久挂起
  React.useEffect(() => {
    return () => pending?.resolve(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent
          className="max-w-md"
          // 危险动作默认焦点给取消钮，防止 Enter 误确认；普通动作跟随 Radix 默认
          onOpenAutoFocus={(e) => {
            if (pending?.danger) {
              e.preventDefault();
              cancelRef.current?.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{pending?.title ?? ''}</DialogTitle>
            {pending?.description ? (
              <DialogDescription className="whitespace-pre-line">
                {pending.description}
              </DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <Button
              ref={cancelRef}
              type="button"
              variant="outline"
              onClick={() => settle(false)}
            >
              {pending?.cancelText ?? '取消'}
            </Button>
            <Button
              type="button"
              variant={pending?.danger ? 'destructive' : 'default'}
              onClick={() => settle(true)}
              autoFocus={!pending?.danger}
            >
              {pending?.confirmText ?? '确认'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm 必须在 ConfirmProvider 内使用');
  return ctx;
}
