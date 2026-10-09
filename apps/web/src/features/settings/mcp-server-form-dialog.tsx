'use client';

import * as React from 'react';
import type { McpServerInfo } from '@wbfm/shared/types';
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useMcpMutations } from '@/lib/hooks/use-mcp';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: McpServerInfo | null;
}

interface FormState {
  name: string;
  command: string;
  argsText: string;
  envText: string;
  enabled: boolean;
}

function toForm(server: McpServerInfo | null | undefined): FormState {
  if (!server) return { name: '', command: '', argsText: '', envText: '', enabled: true };
  return {
    name: server.name,
    command: server.command ?? '',
    argsText: (server.args ?? []).join('\n'),
    envText: Object.entries(server.env ?? {})
      .map(([key, value]) => `${key}=${value}`)
      .join('\n'),
    enabled: server.enabled,
  };
}

/** 每行一个参数；空行忽略 */
function parseArgs(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 每行 KEY=VALUE；无等号的行忽略 */
function parseEnv(text: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key) env[key] = value;
  }
  return env;
}

/** MCP stdio 服务器新增/编辑弹窗（http 传输为 M2 预留，本期不提供入口） */
export function McpServerFormDialog({ open, onOpenChange, server }: Props) {
  const { t } = useI18n();
  const isEdit = Boolean(server);
  const mutations = useMcpMutations();
  const toast = useToast();
  const [form, setForm] = React.useState<FormState>(() => toForm(server));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(toForm(server));
  }, [open, server]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.command.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit && server) {
        await mutations.update.mutateAsync({
          id: server.id,
          body: {
            transport: 'stdio',
            name: form.name.trim(),
            command: form.command.trim(),
            args: parseArgs(form.argsText),
            env: parseEnv(form.envText),
            enabled: form.enabled,
          },
        });
        toast.success(t('settingsMcp.mcp.form.updatedReconnecting'));
      } else {
        await mutations.create.mutateAsync({
          transport: 'stdio',
          name: form.name.trim(),
          command: form.command.trim(),
          args: parseArgs(form.argsText),
          env: parseEnv(form.envText),
          enabled: form.enabled,
        });
        toast.success(t('settingsMcp.mcp.form.addedConnecting'));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? t('settingsMcp.mcp.form.editTitle')
              : t('settingsMcp.mcp.form.addTitle')}
          </DialogTitle>
          <DialogDescription>{t('settingsMcp.mcp.form.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mcp-name">{t('settingsMcp.mcp.form.nameLabel')}</Label>
            <Input
              id="mcp-name"
              value={form.name}
              onChange={(e) => update({ name: e.target.value })}
              placeholder={t('settingsMcp.mcp.form.namePlaceholder')}
              required
              maxLength={40}
              pattern="[a-zA-Z0-9][a-zA-Z0-9_-]*"
              title={t('settingsMcp.mcp.form.namePatternTitle')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-command">{t('settingsMcp.mcp.form.commandLabel')}</Label>
            <Input
              id="mcp-command"
              value={form.command}
              onChange={(e) => update({ command: e.target.value })}
              placeholder={t('settingsMcp.mcp.form.commandPlaceholder')}
              required
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-args">{t('settingsMcp.mcp.form.argsLabel')}</Label>
            <Textarea
              id="mcp-args"
              value={form.argsText}
              onChange={(e) => update({ argsText: e.target.value })}
              rows={3}
              placeholder={'-y\n@modelcontextprotocol/server-filesystem\nD:/docs'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mcp-env">{t('settingsMcp.mcp.form.envLabel')}</Label>
            <Textarea
              id="mcp-env"
              value={form.envText}
              onChange={(e) => update({ envText: e.target.value })}
              rows={2}
              placeholder="API_KEY=xxx"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={form.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            <span>{t('settingsMcp.mcp.form.enableAutoConnect')}</span>
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
