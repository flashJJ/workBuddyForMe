'use client';

import * as React from 'react';
import { Copy, FolderOpen, Plus, Webhook } from 'lucide-react';
import type { FlowTriggerView } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { ApiClientError } from '@/lib/api/client';
import { useFlowTriggerMutations, useFlowTriggers } from '@/lib/hooks/flows';
import { TriggerList } from './trigger-list';
import { buildWebhookUrl, parseExtensions } from './trigger-dialog-helpers';

export interface TriggerDialogProps {
  open: boolean;
  workflowId: string;
  published: boolean;
  onClose: () => void;
}

/** v4.25 事件触发：Webhook 与文件监听配置 */
export function TriggerDialog({ open, workflowId, published, onClose }: TriggerDialogProps) {
  const { t } = useI18n();
  const toast = useToast();
  const detail = useFlowTriggers(open ? workflowId : null);
  const mutations = useFlowTriggerMutations(workflowId);
  const triggers = detail.data?.triggers ?? [];

  const [kind, setKind] = React.useState<'webhook' | 'file'>('webhook');
  const [name, setName] = React.useState('');
  const [path, setPath] = React.useState('');
  const [extensions, setExtensions] = React.useState('md,txt');
  const [recursive, setRecursive] = React.useState(true);
  const [secretInfo, setSecretInfo] = React.useState<{ url: string; secret: string } | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [rotateConfirmId, setRotateConfirmId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSecretInfo(null);
      setConfirmId(null);
      setRotateConfirmId(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (detail.error) toast.error(t('flowEditor.trigger.loadFailed'));
  }, [detail.error, t, toast]);

  const create = async () => {
    try {
      if (kind === 'webhook') {
        const result = await mutations.create.mutateAsync({
          kind: 'webhook',
          ...(name.trim() ? { name: name.trim() } : {}),
        });
        if (result.secret && result.trigger.webhookPath) {
          setSecretInfo({
            url: buildWebhookUrl(result.trigger.webhookPath, window.location.origin),
            secret: result.secret,
          });
        }
      } else {
        const extList = parseExtensions(extensions);
        if (!path.trim() || extList.length === 0) {
          toast.error(t('flowEditor.trigger.createFailed'));
          return;
        }
        await mutations.create.mutateAsync({
          kind: 'file',
          ...(name.trim() ? { name: name.trim() } : {}),
          config: { path: path.trim(), extensions: extList, recursive },
        });
      }
      toast.success(t('flowEditor.trigger.created'));
      setName('');
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('flowEditor.trigger.createFailed'),
      );
    }
  };

  const toggle = async (trigger: FlowTriggerView) => {
    try {
      await mutations.update.mutateAsync({
        triggerId: trigger.id,
        patch: { enabled: !trigger.enabled },
      });
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('flowEditor.trigger.toggleFailed'),
      );
    }
  };

  const remove = async (trigger: FlowTriggerView) => {
    if (confirmId !== trigger.id) {
      setConfirmId(trigger.id);
      return;
    }
    try {
      await mutations.remove.mutateAsync(trigger.id);
      toast.success(t('flowEditor.trigger.removed'));
      setConfirmId(null);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('flowEditor.trigger.deleteFailed'),
      );
    }
  };

  const rotate = async (trigger: FlowTriggerView) => {
    if (rotateConfirmId !== trigger.id) {
      setRotateConfirmId(trigger.id);
      return;
    }
    try {
      const result = await mutations.rotate.mutateAsync(trigger.id);
      if (result.secret && trigger.webhookPath) {
        setSecretInfo({
          url: buildWebhookUrl(trigger.webhookPath, window.location.origin),
          secret: result.secret,
        });
      }
      toast.success(t('flowEditor.trigger.rotated'));
      setRotateConfirmId(null);
    } catch (error) {
      toast.error(
        error instanceof ApiClientError ? error.message : t('flowEditor.trigger.rotateFailed'),
      );
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('flowEditor.trigger.copied'));
    } catch {
      toast.error(t('flowEditor.trigger.copy'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('flowEditor.trigger.title')}</DialogTitle>
          <DialogDescription>{t('flowEditor.trigger.description')}</DialogDescription>
        </DialogHeader>

        {!published && (
          <p className="rounded bg-warning/10 px-3 py-2 text-xs text-warning">
            {t('flowEditor.trigger.unpublished')}
          </p>
        )}

        {secretInfo && (
          <div className="space-y-2 rounded border border-warning/40 bg-warning/5 p-3 text-xs">
            <p className="font-medium">{t('flowEditor.trigger.secretTitle')}</p>
            <p className="text-muted-foreground">{t('flowEditor.trigger.secretHint')}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1">
                {secretInfo.secret}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(secretInfo.secret)}>
                <Copy className="h-3.5 w-3.5" />
                {t('flowEditor.trigger.copy')}
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('flowEditor.trigger.urlLabel')}</span>
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1">
                {secretInfo.url}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(secretInfo.url)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        <TriggerList
          triggers={triggers}
          confirmRemoveId={confirmId}
          rotateConfirmId={rotateConfirmId}
          rotating={mutations.rotate.isPending}
          onToggle={(trigger) => void toggle(trigger)}
          onRemove={(trigger) => void remove(trigger)}
          onRotate={(trigger) => void rotate(trigger)}
        />

        <div className="space-y-2 rounded border p-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={kind === 'webhook' ? 'default' : 'outline'}
              onClick={() => setKind('webhook')}
            >
              <Webhook className="h-3.5 w-3.5" />
              {t('flowEditor.trigger.kindWebhook')}
            </Button>
            <Button
              size="sm"
              variant={kind === 'file' ? 'default' : 'outline'}
              onClick={() => setKind('file')}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('flowEditor.trigger.kindFile')}
            </Button>
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium">{t('flowEditor.trigger.nameLabel')}</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('flowEditor.trigger.namePlaceholder')}
              disabled={!published}
            />
          </label>

          {kind === 'file' ? (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-medium">{t('flowEditor.trigger.pathLabel')}</span>
                <Input
                  value={path}
                  onChange={(event) => setPath(event.target.value)}
                  placeholder={t('flowEditor.trigger.pathPlaceholder')}
                  disabled={!published}
                  spellCheck={false}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">{t('flowEditor.trigger.extensionsLabel')}</span>
                <Input
                  value={extensions}
                  onChange={(event) => setExtensions(event.target.value)}
                  placeholder="md,txt"
                  disabled={!published}
                  spellCheck={false}
                />
                <span className="block text-[11px] text-muted-foreground">
                  {t('flowEditor.trigger.extensionsHint')}
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={recursive}
                  disabled={!published}
                  onChange={(event) => setRecursive(event.target.checked)}
                />
                {t('flowEditor.trigger.recursive')}
              </label>
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t('flowEditor.trigger.webhookHint')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button size="sm" onClick={() => void create()} disabled={!published || mutations.create.isPending}>
            <Plus className="h-3.5 w-3.5" />
            {t('flowEditor.trigger.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
