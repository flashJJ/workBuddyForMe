'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import type {
  MeetingActionItemCreateInput,
  MeetingActionItemUpdateInput,
} from '@wbfm/shared/schemas';
import type { MeetingActionItemRecord } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useToast } from '@/components/common/toast';
import { useFlows } from '@/lib/hooks/use-flows';
import { useI18n } from '@/lib/i18n/use-i18n';
import { errorText } from '@/lib/i18n/resolve-error';
import { MeetingActionItemRow } from './meeting-action-item-row';

interface Member {
  id: string;
  name: string;
  missing?: boolean;
}

interface Props {
  items: MeetingActionItemRecord[];
  members: Member[];
  onCreate: (input: MeetingActionItemCreateInput) => Promise<void>;
  onUpdate: (itemId: string, input: MeetingActionItemUpdateInput) => Promise<void>;
  onToReminder: (itemId: string, assistantId: string) => Promise<void>;
  onRunFlow: (itemId: string, workflowId: string) => Promise<void>;
}

export function MeetingActionItems({ items, members, onCreate, onUpdate, onToReminder, onRunFlow }: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const flows = useFlows();
  const [adding, setAdding] = React.useState(false);
  const [content, setContent] = React.useState('');
  const [owner, setOwner] = React.useState('');
  const [due, setDue] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [flowItemId, setFlowItemId] = React.useState<string | null>(null);
  const [flowId, setFlowId] = React.useState('');

  const published = React.useMemo(
    () => (flows.data ?? []).filter((flow) => flow.status === 'published'),
    [flows.data],
  );

  const submit = async () => {
    if (!content.trim()) return;
    const member = members.find((m) => m.id === owner && !m.missing);
    const ownerLabel =
      owner === '__user__'
        ? t('meeting.conclusion.you')
        : member?.name ?? '';
    setBusy(true);
    try {
      await onCreate({
        content: content.trim(),
        ownerLabel,
        ownerMemberId: member?.id ?? null,
        dueAt: due ? new Date(due).toISOString() : null,
      });
      setContent('');
      setOwner('');
      setDue('');
      setAdding(false);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'meeting.conclusion.addFailed' }));
    } finally {
      setBusy(false);
    }
  };

  const requestRunFlow = (itemId: string) => {
    setFlowItemId(itemId);
    setFlowId(published[0]?.id ?? '');
  };

  const runFlow = async () => {
    if (!flowItemId || !flowId) return;
    setBusy(true);
    try {
      await onRunFlow(flowItemId, flowId);
      toast.success(t('meeting.conclusion.flowLinked'));
      setFlowItemId(null);
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'meeting.conclusion.runFlowFailed' }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2" data-testid="meeting-action-items">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">
          {t('meeting.conclusion.actionItems')}
        </h4>
        <Button size="sm" variant="outline" onClick={() => setAdding((value) => !value)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t('meeting.conclusion.addItem')}
        </Button>
      </div>

      {adding && (
        <div className="space-y-2 rounded-md border bg-muted/30 p-2">
          <input
            className="w-full rounded border bg-background px-2 py-1 text-sm"
            placeholder={t('meeting.conclusion.itemPlaceholder')}
            aria-label={t('meeting.conclusion.itemPlaceholder')}
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2">
            <SimpleSelect
              value={owner}
              onValueChange={setOwner}
              aria-label={t('meeting.conclusion.owner')}
              className="w-36"
            >
              <option value="">{t('meeting.conclusion.ownerNone')}</option>
              <option value="__user__">{t('meeting.conclusion.you')}</option>
              {members.map((member) => (
                <option key={member.id} value={member.id} disabled={member.missing}>
                  {member.name}
                </option>
              ))}
            </SimpleSelect>
            <input
              type="datetime-local"
              className="rounded border bg-background px-2 py-1 text-xs"
              aria-label={t('meeting.conclusion.due')}
              value={due}
              onChange={(event) => setDue(event.target.value)}
            />
            <Button size="sm" disabled={busy || !content.trim()} onClick={() => void submit()}>
              {t('meeting.conclusion.add')}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('meeting.conclusion.noActionItems')}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <MeetingActionItemRow
              key={item.id}
              item={item}
              members={members}
              onUpdate={onUpdate}
              onToReminder={onToReminder}
              onRequestRunFlow={requestRunFlow}
            />
          ))}
        </div>
      )}

      <Dialog open={Boolean(flowItemId)} onOpenChange={(open) => !open && setFlowItemId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('meeting.conclusion.runFlowTitle')}</DialogTitle>
            <DialogDescription>{t('meeting.conclusion.runFlowHint')}</DialogDescription>
          </DialogHeader>
          {published.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('meeting.conclusion.runFlowNoFlows')}</p>
          ) : (
            <SimpleSelect value={flowId} onValueChange={setFlowId} aria-label={t('meeting.conclusion.runFlowTitle')}>
              {published.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </SimpleSelect>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFlowItemId(null)}>
              {t('meeting.conclusion.cancel')}
            </Button>
            <Button disabled={busy || !flowId} onClick={() => void runFlow()}>
              {t('meeting.conclusion.runFlow')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
