'use client';

import * as React from 'react';
import type { Provider } from '@wbfm/shared';
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
import { useToast } from '@/components/common/toast';
import { ApiClientError } from '@/lib/api/client';
import { useProviderMutations, type ProviderCreateBody } from '@/lib/hooks/use-providers';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 传入则为编辑模式 */
  provider?: Provider | null;
}

interface FormState {
  name: string;
  baseUrl: string;
  apiKey: string;
  enabled: boolean;
}

const EMPTY: FormState = { name: '', baseUrl: '', apiKey: '', enabled: true };

export function ProviderFormDialog({ open, onOpenChange, provider }: Props) {
  const isEdit = Boolean(provider);
  const mutations = useProviderMutations();
  const toast = useToast();
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(
      provider
        ? { name: provider.name, baseUrl: provider.baseUrl, apiKey: '', enabled: provider.enabled }
        : EMPTY,
    );
  }, [open, provider]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

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
        toast.success('供应商已更新');
      } else {
        const body: ProviderCreateBody = {
          name: form.name.trim(),
          protocol: 'openai-compatible',
          baseUrl: form.baseUrl.trim(),
          enabled: form.enabled,
          ...(form.apiKey ? { apiKey: form.apiKey } : {}),
        };
        await mutations.create.mutateAsync(body);
        toast.success('供应商已创建');
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof ApiClientError ? error.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑供应商' : '新增供应商'}</DialogTitle>
          <DialogDescription>兼容 OpenAI 协议的服务，填写地址与 API Key 即可。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="provider-name">名称</Label>
            <Input
              id="provider-name"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder="例如：DeepSeek"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-baseurl">Base URL</Label>
            <Input
              id="provider-baseurl"
              value={form.baseUrl}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="provider-key">API Key</Label>
            <Input
              id="provider-key"
              type="password"
              autoComplete="new-password"
              value={form.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder={isEdit && provider?.apiKeyMasked ? `当前：${provider.apiKeyMasked}（留空不修改）` : 'sk-...'}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            启用该供应商
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
