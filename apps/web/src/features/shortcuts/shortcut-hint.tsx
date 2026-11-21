'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/use-i18n';
import { openShortcutsOverlay } from './use-shortcuts-host';

const DISMISS_KEY = 'wbfm.shortcutHint.dismissed';

/** v4.18：常驻快捷键提示（侧栏底部，可永久关闭） */
export function ShortcutHint() {
  const { t } = useI18n();
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // 隐私模式/配额不足时仅本次生效
    }
  };

  if (dismissed) return null;

  return (
    <div
      className="mx-3 mb-3 flex items-center gap-2 rounded-md border bg-ui-card px-2 py-1.5 text-[11px] text-muted-foreground"
      data-testid="shortcut-hint"
    >
      <span className="min-w-0 flex-1 truncate">{t('shortcuts.hint.text')}</span>
      <button
        type="button"
        className="shrink-0 underline-offset-2 hover:text-foreground hover:underline"
        onClick={openShortcutsOverlay}
      >
        {t('shortcuts.hint.view')}
      </button>
      <button
        type="button"
        aria-label={t('shortcuts.hint.dismiss')}
        title={t('shortcuts.hint.dismiss')}
        onClick={dismiss}
        className="shrink-0 rounded p-0.5 hover:bg-muted hover:text-foreground"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
