'use client';

import * as React from 'react';
import type { AppSettings, ProviderModel } from '@wbfm/shared/types';
import type { Language } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { apiGet } from '@/lib/api/client';
import { copyText } from '@/lib/utils/clipboard';
import { useAllModels, useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { useTheme, type ThemePreference } from '@/components/theme/theme-provider';
import { useI18n } from '@/lib/i18n/use-i18n';

function DataDirField() {
  const { t } = useI18n();
  const [dataDir, setDataDir] = React.useState<string>('');
  const toast = useToast();

  React.useEffect(() => {
    let alive = true;
    void apiGet<{ dataDir: string }>('/api/system/info')
      .then((info) => alive && setDataDir(info.dataDir))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const copy = async () => {
    if (!dataDir) return;
    await copyText(dataDir);
    toast.success(t('settings.defaults.dataDirCopied'));
  };

  return (
    <div className="space-y-1.5">
      <Label>{t('settings.defaults.dataDir')}</Label>
      <div className="flex gap-2">
        <input
          readOnly
          value={dataDir}
          aria-label={t('settings.defaults.dataDir')}
          className="h-9 flex-1 truncate rounded-md border bg-muted px-3 text-sm text-muted-foreground"
        />
        <Button type="button" variant="outline" size="sm" onClick={() => void copy()}>
          {t('common.actions.copy')}
        </Button>
      </div>
    </div>
  );
}

export function DefaultsPanel() {
  const { t, locale, setLocale } = useI18n();
  const { data: settings } = useSettings();
  const { data: models } = useAllModels();
  const updateSettings = useUpdateSettings();
  const toast = useToast();
  // 主题以 ThemeProvider 为唯一写路径（侧栏切换/设置下拉/系统三态共用，实时换肤并双写设置表）
  const { theme, setTheme } = useTheme();
  const [draft, setDraft] = React.useState<AppSettings | null>(null);

  React.useEffect(() => {
    if (settings) setDraft(settings);
  }, [settings]);

  if (!draft) return null;

  const chatModels = (models ?? []).filter((model) => model.capabilities.includes('chat'));
  const embeddingModels = (models ?? []).filter((model) =>
    model.capabilities.includes('embedding'),
  );

  const modelLabel = (model: ProviderModel): string =>
    t('settings.defaults.modelOptionLabel', { displayName: model.displayName, modelId: model.modelId });

  const save = async (patch: Partial<AppSettings>) => {
    try {
      const next = await updateSettings.mutateAsync(patch);
      setDraft(next);
      toast.success(t('settings.defaults.settingsSaved'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="defaults-panel">
      <h3 className="font-medium">{t('settings.defaults.title')}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="default-chat-model">{t('settings.defaults.chatModel')}</Label>
          <Select
            id="default-chat-model"
            value={draft.defaultChatModelId ?? ''}
            onChange={(e) => void save({ defaultChatModelId: e.target.value || null })}
          >
            <option value="">{t('settings.defaults.notSelected')}</option>
            {chatModels.map((model) => (
              <option key={model.id} value={model.id}>
                {modelLabel(model)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="default-embedding-model">{t('settings.defaults.embeddingModel')}</Label>
          <Select
            id="default-embedding-model"
            value={draft.defaultEmbeddingModelId ?? ''}
            onChange={(e) => void save({ defaultEmbeddingModelId: e.target.value || null })}
          >
            <option value="">{t('settings.defaults.notSelected')}</option>
            {embeddingModels.map((model) => (
              <option key={model.id} value={model.id}>
                {modelLabel(model)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="theme-preference">{t('settings.defaults.theme')}</Label>
          <Select
            id="theme-preference"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemePreference)}
          >
            <option value="light">{t('settings.defaults.themeLight')}</option>
            <option value="dark">{t('settings.defaults.themeDark')}</option>
            <option value="system">{t('settings.defaults.themeSystem')}</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="language-preference">{t('common.language.label')}</Label>
          <Select
            id="language-preference"
            value={locale}
            onChange={(e) => setLocale(e.target.value as Language)}
          >
            <option value="zh-CN">{t('common.language.zhCN')}</option>
            <option value="en-US">{t('common.language.enUS')}</option>
          </Select>
        </div>
      </div>
      <DataDirField />
      <p className="text-xs text-muted-foreground">{t('settings.defaults.hint')}</p>
    </section>
  );
}
