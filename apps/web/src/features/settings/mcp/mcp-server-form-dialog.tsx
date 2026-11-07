'use client';

import * as React from 'react';
import type { McpServerInfo } from '@wbfm/shared/types';
import type { McpCatalogEntry } from '@wbfm/shared/constants';
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
import { FormField } from '@/components/ui/form-field';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useMcpMutations } from '@/lib/hooks/capability';
import { useI18n } from '@/lib/i18n/use-i18n';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  server?: McpServerInfo | null;
  /** v2.24：从能力目录打开时预填（仅新增） */
  preset?: McpCatalogEntry | null;
}

interface FormState {
  transport: 'stdio' | 'http';
  name: string;
  command: string;
  argsText: string;
  envText: string;
  url: string;
  headersText: string;
  enabled: boolean;
}

function pairsToText(values: Record<string, string> | undefined): string {
  return Object.entries(values ?? {})
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function toForm(
  server: McpServerInfo | null | undefined,
  preset?: McpCatalogEntry | null,
): FormState {
  if (server) {
    return {
      transport: server.transport,
      name: server.name,
      command: server.command ?? '',
      argsText: (server.args ?? []).join('\n'),
      envText: pairsToText(server.env),
      url: server.url ?? '',
      headersText: pairsToText(server.headers),
      enabled: server.enabled,
    };
  }
  if (preset) {
    return {
      transport: preset.transport,
      name: preset.name,
      command: preset.command ?? '',
      argsText: (preset.args ?? []).join('\n'),
      envText: pairsToText(preset.env),
      url: preset.url ?? '',
      headersText: pairsToText(preset.headers),
      enabled: true,
    };
  }
  return {
    transport: 'stdio',
    name: '',
    command: '',
    argsText: '',
    envText: '',
    url: '',
    headersText: '',
    enabled: true,
  };
}

/** 每行一个参数；空行忽略 */
function parseArgs(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** 每行 KEY=VALUE；无等号的行忽略（env 与 headers 共用） */
function parsePairs(text: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key) pairs[key] = value;
  }
  return pairs;
}

/** MCP 服务器新增/编辑弹窗（stdio / Streamable HTTP） */
export function McpServerFormDialog({ open, onOpenChange, server, preset }: Props) {
  const { t } = useI18n();
  const isEdit = Boolean(server);
  const mutations = useMcpMutations();
  const toast = useToast();
  const [form, setForm] = React.useState<FormState>(() => toForm(server, preset));
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setForm(toForm(server, preset));
  }, [open, server, preset]);

  const update = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    if (form.transport === 'stdio' && !form.command.trim()) return;
    if (form.transport === 'http' && !form.url.trim()) return;
    setSubmitting(true);
    try {
      if (isEdit && server) {
        const body =
          form.transport === 'stdio'
            ? {
                transport: 'stdio' as const,
                name: form.name.trim(),
                command: form.command.trim(),
                args: parseArgs(form.argsText),
                env: parsePairs(form.envText),
                enabled: form.enabled,
              }
            : {
                transport: 'http' as const,
                name: form.name.trim(),
                url: form.url.trim(),
                headers: parsePairs(form.headersText),
                enabled: form.enabled,
              };
        await mutations.update.mutateAsync({ id: server.id, body });
        toast.success(t('settingsMcp.mcp.form.updatedReconnecting'));
      } else {
        const body =
          form.transport === 'stdio'
            ? {
                transport: 'stdio' as const,
                name: form.name.trim(),
                command: form.command.trim(),
                args: parseArgs(form.argsText),
                env: parsePairs(form.envText),
                enabled: form.enabled,
              }
            : {
                transport: 'http' as const,
                name: form.name.trim(),
                url: form.url.trim(),
                headers: parsePairs(form.headersText),
                enabled: form.enabled,
              };
        await mutations.create.mutateAsync(body);
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
            {isEdit ? t('settingsMcp.mcp.form.editTitle') : t('settingsMcp.mcp.form.addTitle')}
          </DialogTitle>
          <DialogDescription>{t('settingsMcp.mcp.form.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label={t('settingsMcp.mcp.form.nameLabel')} htmlFor="mcp-name">
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
          </FormField>

          <div className="flex gap-2" data-testid="mcp-transport-switch">
            {(['stdio', 'http'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={form.transport === item}
                onClick={() => update({ transport: item })}
                className={`rounded-md border px-2.5 py-1 text-xs ${
                  form.transport === item
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {item === 'stdio'
                  ? t('settingsMcp.mcp.form.transportStdio')
                  : t('settingsMcp.mcp.form.transportHttp')}
              </button>
            ))}
          </div>

          {form.transport === 'stdio' ? (
            <>
              <FormField label={t('settingsMcp.mcp.form.commandLabel')} htmlFor="mcp-command">
                <Input
                  id="mcp-command"
                  value={form.command}
                  onChange={(e) => update({ command: e.target.value })}
                  placeholder={t('settingsMcp.mcp.form.commandPlaceholder')}
                  required
                  maxLength={500}
                />
              </FormField>
              <FormField label={t('settingsMcp.mcp.form.argsLabel')} htmlFor="mcp-args">
                <Textarea
                  id="mcp-args"
                  value={form.argsText}
                  onChange={(e) => update({ argsText: e.target.value })}
                  rows={3}
                  placeholder={'-y\n@modelcontextprotocol/server-filesystem\nD:/docs'}
                />
              </FormField>
              <FormField label={t('settingsMcp.mcp.form.envLabel')} htmlFor="mcp-env">
                <Textarea
                  id="mcp-env"
                  value={form.envText}
                  onChange={(e) => update({ envText: e.target.value })}
                  rows={2}
                  placeholder="API_KEY=xxx"
                />
              </FormField>
            </>
          ) : (
            <>
              <FormField label={t('settingsMcp.mcp.form.urlLabel')} htmlFor="mcp-url">
                <Input
                  id="mcp-url"
                  value={form.url}
                  onChange={(e) => update({ url: e.target.value })}
                  placeholder="https://example.com/mcp"
                  required
                />
              </FormField>
              <FormField label={t('settingsMcp.mcp.form.headersLabel')} htmlFor="mcp-headers">
                <Textarea
                  id="mcp-headers"
                  value={form.headersText}
                  onChange={(e) => update({ headersText: e.target.value })}
                  rows={2}
                  placeholder="Authorization=Bearer xxx"
                />
              </FormField>
            </>
          )}

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
