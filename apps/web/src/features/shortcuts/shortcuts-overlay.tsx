'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { KEYBOARD_SHORTCUTS } from '@wbfm/shared/constants';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * 快捷键浮层（v1.2 M5，Ctrl+/）：
 * 数据全部来自 KEYBOARD_SHORTCUTS 共享常量（与实际注册绑定一致，快照测试防漂移）。
 */
export function ShortcutsOverlay({ open, onOpenChange }: Props) {
  const { t } = useI18n();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="shortcuts-overlay">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {KEYBOARD_SHORTCUTS.map((group) => (
            <section key={group.titleKey} className="space-y-1.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(group.titleKey)}
              </h4>
              <dl className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.labelKey}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <dt>{t(item.labelKey)}</dt>
                    <dd className="flex shrink-0 items-center gap-1">
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                        {item.keys}
                      </kbd>
                      {item.keysAlt && (
                        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">
                          {item.keysAlt}
                        </kbd>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
