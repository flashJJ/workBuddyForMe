'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared/types';
import { DEMO_PROVIDER_ID } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { PageHeader, PageShell } from '@/components/layout/page-header';
import { EmptyState, ErrorState, Spinner } from '@/components/common/state';
import { useProviders, useSettings } from '@/lib/hooks/provider';
import { PanelVisibilityGate } from '@/lib/ui/panel-visibility';
import { useI18n } from '@/lib/i18n/use-i18n';
import { cn } from '@/lib/utils';
import { ProviderCard } from '../providers/provider-card';
import { ProviderFormDialog } from '../providers/provider-form-dialog';
import {
  SETTINGS_SECTIONS,
  matchesSettingsQuery,
  settingsPanelAnchor,
  settingsPanelHaystack,
  settingsSectionAnchor,
  type SettingsSectionId,
} from '@/lib/settings/catalog';
import { createSettingsPanelEntries } from './settings-registry';
import {
  SettingsPinButton,
  SettingsShortcuts,
  useSettingsShortcuts,
} from './settings-shortcuts';

const SECTION_LABELS = new Map(SETTINGS_SECTIONS.map((section) => [section.id, section.labelKey]));

/**
 * 设置中心：面板元数据来自 settings-index / settings-registry。
 * 顶部搜索按标题、描述与中英别名过滤面板；`#panel-*` 深链直达面板，`#setting-*` 直达分组。
 */
export function SettingsPage({ autoCreateCard = false }: { autoCreateCard?: boolean }) {
  const { t } = useI18n();
  const { data: providers, isLoading, isError, refetch } = useProviders();
  const { data: settings } = useSettings();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Provider | null>(null);
  const [query, setQuery] = React.useState('');
  const [highlight, setHighlight] = React.useState<string | null>(null);
  const shortcuts = useSettingsShortcuts();
  // 水合门控：供应商查询态在 SSR 与客户端首帧不一致，直接据此切结构会水合失配（React #418/#422）。
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // v2.4 M1：内置 demo 供应商由「演示模式」开关管理，不在通用供应商列表中出现
  const visibleProviders = providers?.filter((provider) => provider.id !== DEMO_PROVIDER_ID);
  const demoEnabled = settings?.demoModeEnabled === true;

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (provider: Provider) => {
    setEditing(provider);
    setDialogOpen(true);
  };

  const searching = query.trim().length > 0;

  const providerListNode = (
    <>
      {mounted && isLoading && <Spinner />}
      {mounted && isError && (
        <ErrorState message={t('settings.loadError')} onRetry={() => void refetch()} />
      )}
      {mounted && !isLoading && !isError && visibleProviders && (
        <div className="space-y-4" data-testid="provider-list">
          {visibleProviders.length === 0 && !demoEnabled && (
            <EmptyState
              title={t('settings.empty.title')}
              description={t('settings.empty.description')}
              action={
                <Button type="button" onClick={openCreate}>
                  {t('settings.empty.action')}
                </Button>
              }
            />
          )}
          {visibleProviders.map((provider) => (
            <ProviderCard key={provider.id} provider={provider} onEdit={openEdit} />
          ))}
        </div>
      )}
    </>
  );

  const entries = createSettingsPanelEntries({ autoCreateCard, providers: providerListNode });

  const matched = new Set<string>();
  if (searching) {
    for (const entry of entries) {
      const haystack = settingsPanelHaystack(entry.meta, {
        label: t(entry.meta.labelKey),
        description: t(entry.meta.descriptionKey),
        sectionLabel: t(SECTION_LABELS.get(entry.meta.section) ?? entry.meta.labelKey),
      });
      if (matchesSettingsQuery(haystack, query)) matched.add(entry.meta.id);
    }
  }

  // 深链：首帧与 hashchange 都滚动定位，并短暂高亮目标面板
  React.useEffect(() => {
    let highlightTimer: ReturnType<typeof setTimeout> | undefined;
    let scrollTimer: ReturnType<typeof setTimeout> | undefined;
    const focusHash = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (!hash) return;
      // 搜索过滤可能隐藏目标面板，先清空再滚动
      setQuery('');
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const target = document.getElementById(hash);
        if (!target) return;
        if (hash.startsWith('panel-')) shortcuts.remember(hash.slice('panel-'.length));
        target.scrollIntoView({ block: 'start', behavior: 'smooth' });
        setHighlight(hash);
        if (highlightTimer) clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => setHighlight(null), 2400);
      }, 0);
    };
    const raf = requestAnimationFrame(focusHash);
    window.addEventListener('hashchange', focusHash);
    return () => {
      cancelAnimationFrame(raf);
      if (highlightTimer) clearTimeout(highlightTimer);
      if (scrollTimer) clearTimeout(scrollTimer);
      window.removeEventListener('hashchange', focusHash);
    };
  }, [shortcuts.remember]);

  const jumpToSection = (id: SettingsSectionId) => {
    setQuery('');
    requestAnimationFrame(() => {
      document.getElementById(settingsSectionAnchor(id))?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  };

  const openPanel = (id: string) => {
    setQuery('');
    const anchor = settingsPanelAnchor(id);
    if (window.location.hash === `#${anchor}`) {
      window.dispatchEvent(new Event('hashchange'));
    } else {
      window.location.hash = `#${anchor}`;
    }
  };

  return (
    <PageShell
      header={
        <PageHeader
          title={t('settings.title')}
          description={t('settings.description')}
          actions={
            <Button type="button" onClick={openCreate}>
              {t('settings.addProvider')}
            </Button>
          }
        />
      }
    >
      <div className="mx-auto flex w-full max-w-6xl gap-8">
        {/* 左侧：设置主内容 */}
        <div className="min-w-0 flex-1 space-y-8">
          {/* 页内搜索：按标题 / 描述 / 中英别名过滤面板 */}
          <div className="sticky top-0 z-10 space-y-2 bg-background/95 py-2 backdrop-blur">
            <div className="flex items-center gap-2">
              <input
                id="settings-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('settings.registry.search.placeholder')}
                aria-label={t('settings.registry.search.label')}
                data-testid="settings-search"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground"
              />
              {searching && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="shrink-0 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                >
                  {t('settings.registry.search.clear')}
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {searching
                ? t('settings.registry.search.count', { count: matched.size })
                : t('settings.registry.search.hint')}
            </p>
          </div>

          {!searching && shortcuts.ids.length > 0 && (
            <SettingsShortcuts ids={shortcuts.ids} onOpen={openPanel} />
          )}

          {SETTINGS_SECTIONS.map((section) => {
            const sectionEntries = entries.filter(
              (entry) => entry.meta.section === section.id && (!searching || matched.has(entry.meta.id)),
            );
            if (sectionEntries.length === 0) return null;
            return (
              <div key={section.id} data-testid={`settings-section-${section.id}`}>
                <div
                  id={settingsSectionAnchor(section.id)}
                  className="scroll-mt-24 border-b pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {t(section.labelKey)}
                </div>
                <PanelVisibilityGate className="space-y-4 pt-4">
                  {sectionEntries.map((entry) => {
                    const anchor = settingsPanelAnchor(entry.meta.id);
                    return (
                      <div
                        key={entry.meta.id}
                        id={anchor}
                        data-testid={`settings-panel-${entry.meta.id}`}
                        className={cn(
                          'group relative scroll-mt-24 rounded-lg transition-shadow',
                          highlight === anchor && 'ring-2 ring-primary/60',
                        )}
                      >
                        <SettingsPinButton
                          id={entry.meta.id}
                          pinned={shortcuts.isPinned(entry.meta.id)}
                          onToggle={() => shortcuts.togglePin(entry.meta.id)}
                        />
                        {entry.node}
                      </div>
                    );
                  })}
                </PanelVisibilityGate>
              </div>
            );
          })}

          {searching && matched.size === 0 && (
            <EmptyState
              title={t('settings.registry.search.empty')}
              description={t('settings.registry.search.hint')}
              action={
                <Button type="button" onClick={() => setQuery('')}>
                  {t('settings.registry.search.clear')}
                </Button>
              }
            />
          )}

          <ProviderFormDialog open={dialogOpen} onOpenChange={setDialogOpen} provider={editing} />
        </div>

        {/* 右侧：sticky 分组导航（lg+ 可见） */}
        <nav aria-label={t('settings.title')} className="sticky top-0 hidden h-fit w-48 shrink-0 space-y-1 lg:block">
          {SETTINGS_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => jumpToSection(section.id)}
              className="block w-full rounded px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {t(section.labelKey)}
            </button>
          ))}
        </nav>
      </div>
    </PageShell>
  );
}
