'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared/types';
import type { ProviderProtocol } from '@wbfm/shared/constants';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useProviderMutations, type ProviderCreateBody } from '@/lib/hooks/use-providers';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入则为编辑模式 */
  provider?: Provider | null;
}

interface FormState {
  name: string;
  protocol: ProviderProtocol;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

const EMPTY: FormState = {
  name: '',
  protocol: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  enabled: true,
};

const OLLAMA_DEFAULT_URL = 'http://127.0.0.1:11434';

export function ProviderFormDialog({ open, onOpenChange, provider }: Props) {
  const { t } = useI18n();
  const isEdit = Boolean(provider);
  const mutations = useProviderMutations();
  const toast = useToast();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(
      provider
        ? {
            name: provider.name,
            protocol: provider.protocol,
            baseUrl: provider.baseUrl,
            apiKey: '',
            enabled: provider.enabled,
          }
        : EMPTY,
    );
  }, [open, provider]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const changeProtocol = (protocol: ProviderProtocol) => {
    setForm((prev) => {
      if (protocol === prev.protocol) return prev;
      // 切到 Ollama：地址为空或仍是 OpenAI 占位时自动填本地默认地址
      const baseUrl =
        protocol === 'ollama' && (!prev.baseUrl || prev.baseUrl.includes('api.example.com'))
          ? OLLAMA_DEFAULT_URL
          : prev.baseUrl;
      return { ...prev, protocol, baseUrl, apiKey: protocol === 'ollama' ? '' : prev.apiKey };
    });
  };

  const isOllama = form.protocol === 'ollama';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.baseUrl.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit && provider) {
        await mutations.update.mutateAsync({
          id: provider.id,
          body: {
            name: form.name.trim(),
            baseUrl: form.baseUrl.trim(),
            enabled: form.enabled,
            ...(form.apiKey ? { apiKey: form.apiKey } : {}),
          },
        });
        toast.success(t('settingsProviders.form.providerUpdated'));
      } else {
        const body: ProviderCreateBody = {
          name: form.name.trim(),
          protocol: form.protocol,
          baseUrl: form.baseUrl.trim(),
          enabled: form.enabled,
          ...(isOllama || !form.apiKey ? {} : { apiKey: form.apiKey }),
        };
        await mutations.create.mutateAsync(body);
        toast.success(t('settingsProviders.form.providerCreated'));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : t('toast.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('settingsProviders.form.editTitle') : t('settings.addProvider')}
          </DialogTitle>
          <DialogDescription>{t('settingsProviders.form.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="provider-name">{t('common.words.name')}</Label>
            <Input
              id="provider-name"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder={
                isOllama
                  ? t('settingsProviders.form.namePlaceholderOllama')
                  : t('settingsProviders.form.namePlaceholderCloud')
              }
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-protocol">{t('settingsProviders.form.protocol')}</Label>
            <Select
              id="provider-protocol"
              value={form.protocol}
              disabled={isEdit}
              onChange={(e) => changeProtocol(e.target.value as ProviderProtocol)}
            >
              <option value="openai-compatible">
                {t('settingsProviders.form.protocolOpenai')}
              </option>
              <option value="ollama">{t('settingsProviders.form.protocolOllama')}</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-baseurl">Base URL</Label>
            <Input
              id="provider-baseurl"
              value={form.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder={isOllama ? OLLAMA_DEFAULT_URL : 'https://api.example.com/v1'}
              required
            />
          </div>
          {!isOllama && (
            <div className="space-y-1.5">
              <Label htmlFor="provider-key">API Key</Label>
              <Input
                id="provider-key"
                type="password"
                autoComplete="new-password"
                value={form.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder={
                  isEdit && provider?.apiKeyMasked
                    ? t('settingsProviders.form.apiKeyPlaceholderEdit', {
                        masked: provider.apiKeyMasked,
                      })
                    : 'sk-...'
                }
              />
            </div>
          )}
          {isOllama && (
            <p className="rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">
              {t('settingsProviders.form.ollamaHintLead')}
              <a
                href="https://ollama.com/download"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                ollama.com/download
              </a>
              {t('settingsProviders.form.ollamaHintMid')}
              <code>{t('settingsProviders.form.ollamaHintCommand')}</code>
              {t('settingsProviders.form.ollamaHintTail')}
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            {t('settingsProviders.form.enableProvider')}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('settings.saving') : t('common.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
