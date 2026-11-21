'use client';

import * as React from 'react';
import type { Conversation } from '@wbfm/shared/types';
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
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';

interface FallbackOption {
  id: string;
  label: string;
}

interface Props {
  conversation: Conversation | null;
  onOpenChange: (open: boolean) => void;
  /** 返回 false 表示保存失败；弹窗保持打开 */
  onSubmit: (
    id: string,
    tokenBudget: number | null,
    fallbackModelId: string | null,
  ) => Promise<boolean>;
  /** v4.19：会话级备用模型候选 */
  fallbackOptions: FallbackOption[];
  /** 助手已配置的备用模型数量（用于来源提示） */
  assistantFallbackCount: number;
}

const MIN_BUDGET = 1_000;
const MAX_BUDGET = 100_000_000;

/** v4.18：会话 token 预算设置（留空=不限制）；v4.19：会话级备用模型覆盖 */
export function ConversationBudgetDialog({
  conversation,
  onOpenChange,
  onSubmit,
  fallbackOptions,
  assistantFallbackCount,
}: Props) {
  const { t } = useI18n();
  const [value, setValue] = React.useState('');
  const [fallbackModelId, setFallbackModelId] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [failed, setFailed] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (conversation) {
      setValue(conversation.tokenBudget ? String(conversation.tokenBudget) : '');
      setFallbackModelId(conversation.fallbackModelId ?? '');
      setFailed(null);
    }
  }, [conversation]);

  const trimmed = value.trim();
  const parsed = trimmed ? Number(trimmed) : null;
  const valid =
    parsed === null ||
    (Number.isInteger(parsed) && parsed >= MIN_BUDGET && parsed <= MAX_BUDGET);
  const nextFallback = fallbackModelId || null;
  const unchanged =
    (conversation?.tokenBudget ?? null) === parsed &&
    (conversation?.fallbackModelId ?? null) === nextFallback;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!conversation || !valid || unchanged || submitting) return;
    setSubmitting(true);
    setFailed(null);
    try {
      const ok = await onSubmit(conversation.id, parsed, nextFallback);
      if (ok) onOpenChange(false);
      else setFailed(t('chat.budget.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(conversation)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('chat.budget.title')}</DialogTitle>
          <DialogDescription>{t('chat.budget.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conversation-token-budget">{t('chat.budget.label')}</Label>
            <Input
              id="conversation-token-budget"
              type="number"
              min={MIN_BUDGET}
              max={MAX_BUDGET}
              step={1_000}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={t('chat.budget.placeholder')}
            />
            {!valid && <p className="text-xs text-destructive">{t('chat.budget.invalid')}</p>}
            {failed && <p className="text-xs text-destructive">{failed}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conversation-fallback-model">
              {t('chat.budget.fallbackLabel')}
            </Label>
            <SimpleSelect
              id="conversation-fallback-model"
              value={fallbackModelId}
              onValueChange={setFallbackModelId}
            >
              <option value="">{t('chat.budget.fallbackFollow')}</option>
              {fallbackOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </SimpleSelect>
            <p className="text-[11px] text-muted-foreground">
              {nextFallback
                ? t('chat.budget.fallbackSourceOverride')
                : assistantFallbackCount > 0
                  ? t('chat.budget.fallbackSourceAssistant', { count: assistantFallbackCount })
                  : t('chat.budget.fallbackSourceNone')}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button type="submit" disabled={submitting || !valid || unchanged}>
              {submitting ? t('common.actions.saving') : t('common.actions.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
