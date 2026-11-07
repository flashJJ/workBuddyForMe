'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { useAssistants, useAssistantMutations } from '@/lib/hooks/assistant';
import { useMcpTools } from '@/lib/hooks/capability';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 本次安装成功的服务器名 */
  serverNames: string[];
}

/** v2.24：安装完成后把新工具加入助手白名单（默认不勾，避免权限扩散） */
export function CatalogEnableDialog({ open, onOpenChange, serverNames }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const { data: assistants } = useAssistants();
  const { data: mcpTools } = useMcpTools();
  const mutations = useAssistantMutations();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const tools = (mcpTools ?? []).filter((tool) => serverNames.includes(tool.serverName));
  const toolNames = tools.map((tool) => tool.qualifiedName);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const save = async () => {
    if (selected.length === 0 || toolNames.length === 0) return;
    setSaving(true);
    try {
      for (const id of selected) {
        const assistant = (assistants ?? []).find((item) => item.id === id);
        if (!assistant) continue;
        const next = Array.from(new Set([...assistant.enabledTools, ...toolNames]));
        await mutations.update.mutateAsync({ id, body: { enabledTools: next } });
      }
      toast.success(t('settingsMcp.mcp.catalog.enabledToAssistants', { count: selected.length }));
      onOpenChange(false);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settingsMcp.mcp.catalog.enableTitle')}</DialogTitle>
          <DialogDescription>
            {t('settingsMcp.mcp.catalog.enableDescription', { count: toolNames.length })}
          </DialogDescription>
        </DialogHeader>

        {toolNames.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('settingsMcp.mcp.catalog.enableNoTools')}
          </p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {(assistants ?? []).map((assistant) => (
              <label
                key={assistant.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={selected.includes(assistant.id)}
                  onChange={() => toggle(assistant.id)}
                />
                <span className="min-w-0 flex-1 truncate">{assistant.name}</span>
                <span className="text-xs text-muted-foreground">
                  {t('settingsMcp.mcp.catalog.assistantToolCount', {
                    count: assistant.enabledTools.length,
                  })}
                </span>
              </label>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            type="button"
            disabled={saving || selected.length === 0 || toolNames.length === 0}
            onClick={() => void save()}
          >
            {saving ? t('settings.saving') : t('settingsMcp.mcp.catalog.enableConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
