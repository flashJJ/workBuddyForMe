'use client';

import * as React from 'react';
import type { ThemeId } from '@wbfm/shared/constants';
import { useTheme, type ThemePreference } from '@/components/theme/theme-provider';
import { THEME_REGISTRY, type ThemeDefinition } from '@/components/theme/theme-registry';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/use-i18n';

/** 卡片迷你预览：用注册表冻结的 HSL 值画出底色/卡片/主色/强调与 Aa 字样 */
function ThemeSwatch({ def }: { def: ThemeDefinition }) {
  const { preview } = def;
  return (
    <div
      className="relative h-14 overflow-hidden rounded-md border"
      style={{ backgroundColor: preview.background }}
      aria-hidden="true"
    >
      <div
        className="absolute inset-x-2 top-2 h-8 rounded border"
        style={{ backgroundColor: preview.card }}
      >
        <div
          className="absolute left-1.5 top-1.5 h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: preview.foreground }}
        />
        <div
          className="absolute bottom-1.5 left-1.5 h-2 w-8 rounded-sm"
          style={{ backgroundColor: preview.primary }}
        />
        <div
          className="absolute right-1.5 top-1.5 h-3 w-3 rounded-sm"
          style={{ backgroundColor: preview.accent }}
        />
      </div>
    </div>
  );
}

function ThemeCard({
  def,
  active,
  name,
  description,
  modeLabel,
  activeLabel,
  onSelect,
}: {
  def: ThemeDefinition;
  active: boolean;
  name: string;
  description: string;
  modeLabel: string;
  activeLabel: string;
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={name}
      data-testid={`appearance-card-${def.id}`}
      onClick={() => onSelect(def.id)}
      className={cn(
        'space-y-2 rounded-lg border p-3 text-left transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-primary bg-primary/5 ring-1 ring-primary'
          : 'border-border hover:bg-accent',
      )}
    >
      <ThemeSwatch def={def} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{name}</span>
        <span className="text-[11px] text-muted-foreground">
          {active ? (
            <span className="rounded bg-primary px-1.5 py-0.5 text-primary-foreground">
              {activeLabel}
            </span>
          ) : (
            modeLabel
          )}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

const THEME_NAME_KEYS: Record<ThemeId, `settings.appearance.${string}`> = {
  stellar: 'settings.appearance.stellar',
  'nocturne-gold': 'settings.appearance.nocturneGold',
  moonwhite: 'settings.appearance.moonwhite',
  sakura: 'settings.appearance.sakura',
};

const THEME_DESC_KEYS: Record<ThemeId, `settings.appearance.${string}`> = {
  stellar: 'settings.appearance.stellarDesc',
  'nocturne-gold': 'settings.appearance.nocturneGoldDesc',
  moonwhite: 'settings.appearance.moonwhiteDesc',
  sakura: 'settings.appearance.sakuraDesc',
};

const MODES: Array<{ id: ThemePreference; key: 'themeLight' | 'themeDark' | 'themeSystem'; testid: string }> = [
  { id: 'light', key: 'themeLight', testid: 'appearance-mode-light' },
  { id: 'dark', key: 'themeDark', testid: 'appearance-mode-dark' },
  { id: 'system', key: 'themeSystem', testid: 'appearance-mode-system' },
];

/**
 * v1.8 设置-外观：4 个命名主题卡片 + 星际蓝的亮/暗/系统三态。
 * 全部走 ThemeProvider 唯一写路径（即时换肤 + localStorage + 设置表持久化）。
 */
export function AppearancePanel() {
  const { t } = useI18n();
  const { theme, themeId, setTheme, setThemeId } = useTheme();

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="appearance-panel">
      <div>
        <h3 className="font-medium">{t('settings.appearance.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.appearance.description')}</p>
      </div>

      <div
        role="radiogroup"
        aria-label={t('settings.appearance.groupLabel')}
        className="grid gap-3 sm:grid-cols-2"
      >
        {THEME_REGISTRY.map((def) => (
          <ThemeCard
            key={def.id}
            def={def}
            active={themeId === def.id}
            name={t(THEME_NAME_KEYS[def.id] as never)}
            description={t(THEME_DESC_KEYS[def.id] as never)}
            modeLabel={def.mode === 'dark' ? t('settings.appearance.fixedDark') : t('settings.appearance.fixedLight')}
            activeLabel={t('settings.appearance.active')}
            onSelect={setThemeId}
          />
        ))}
      </div>

      {themeId === 'stellar' && (
        <div className="space-y-1.5">
          <div
            role="radiogroup"
            aria-label={t('settings.defaults.theme')}
            className="flex gap-1.5"
            data-testid="appearance-stellar-modes"
          >
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                role="radio"
                aria-checked={theme === mode.id}
                data-testid={mode.testid}
                onClick={() => setTheme(mode.id)}
                className={cn(
                  'flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  theme === mode.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent',
                )}
              >
                {t(`settings.defaults.${mode.key}` as never)}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('settings.appearance.modeHint')}</p>
    </section>
  );
}
