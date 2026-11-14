'use client';

import * as React from 'react';
import { Pin } from 'lucide-react';
import type { MessageKey } from '@wbfm/shared/i18n';
import { useI18n } from '@/lib/i18n/use-i18n';
import { SETTINGS_PANELS } from '@/lib/settings/catalog';
import {
  EMPTY_SHORTCUT_STATE,
  readShortcutState,
  rememberPanel,
  shortcutIds,
  togglePinned,
  writeShortcutState,
  type SettingsShortcutState,
} from '@/lib/settings/shortcuts';
import { cn } from '@/lib/utils';

const PANEL_LABELS = new Map<string, MessageKey>(
  SETTINGS_PANELS.map((panel) => [panel.id, panel.labelKey]),
);

/** P9/P1：收藏与最近访问（localStorage，水合后读取避免 SSR 不一致） */
export function useSettingsShortcuts() {
  const [state, setState] = React.useState<SettingsShortcutState>(EMPTY_SHORTCUT_STATE);
  React.useEffect(() => {
    setState(readShortcutState(window.localStorage));
  }, []);

  const update = React.useCallback(
    (transform: (current: SettingsShortcutState) => SettingsShortcutState) => {
      setState((current) => {
        const next = transform(current);
        writeShortcutState(window.localStorage, next);
        return next;
      });
    },
    [],
  );

  return {
    ids: shortcutIds(state),
    isPinned: React.useCallback((id: string) => state.pinned.includes(id), [state.pinned]),
    remember: React.useCallback((id: string) => update((current) => rememberPanel(current, id)), [update]),
    togglePin: React.useCallback((id: string) => update((current) => togglePinned(current, id)), [update]),
  };
}

export function SettingsShortcuts({
  ids,
  onOpen,
}: {
  ids: readonly string[];
  onOpen: (id: string) => void;
}) {
  const { t } = useI18n();
  if (ids.length === 0) return null;
  return (
    <section aria-label={t('settings.registry.shortcuts.title')} data-testid="settings-shortcuts">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {t('settings.registry.shortcuts.title')}
      </p>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const labelKey = PANEL_LABELS.get(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onOpen(id)}
              data-testid={`settings-shortcut-${id}`}
              className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted"
            >
              {labelKey ? t(labelKey) : id}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function SettingsPinButton({
  id,
  pinned,
  onToggle,
}: {
  id: string;
  pinned: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const label = pinned
    ? t('settings.registry.shortcuts.unpin')
    : t('settings.registry.shortcuts.pin');
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      aria-label={label}
      title={label}
      data-testid={`settings-pin-${id}`}
      className={cn(
        'absolute right-2 top-2 z-10 rounded p-1 text-muted-foreground transition-opacity hover:bg-muted/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        pinned ? 'text-primary opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
    >
      <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
    </button>
  );
}
