'use client';

import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useCharacterCards } from '@/lib/hooks/use-character-cards';

/**
 * v1.8 助手选卡：默认卡（原文模式）/ 内置卡 / 自建卡。
 * 从卡模式切回原文模式需二次确认（后端会按原文生成一张新的 identity 卡）。
 */
export function AssistantCardField(props: {
  value: string;
  onChange: (cardId: string) => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const { data: cards } = useCharacterCards();
  const { value, onChange } = props;

  const builtins = (cards ?? []).filter((card) => card.source === 'builtin');
  const customs = (cards ?? []).filter((card) => card.source === 'custom');
  const cardExists = (cards ?? []).some((card) => card.id === value);
  const cardMode = Boolean(value);

  const handleChange = async (next: string) => {
    if (next === '' && value) {
      const ok = await confirm({
        title: t('assistants.form.cardLabel'),
        description: t('assistants.form.switchToRawConfirm'),
        confirmText: t('common.actions.confirm'),
      });
      if (!ok) return;
    }
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor="assistant-card">{t('assistants.form.cardLabel')}</Label>
      <Select
        id="assistant-card"
        data-testid="assistant-card-select"
        aria-label={t('assistants.form.cardLabel')}
        value={value}
        onChange={(e) => void handleChange(e.target.value)}
      >
        <option value="">{t('assistants.form.cardDefault')}</option>
        {builtins.length > 0 && (
          <optgroup label={t('characterCards.builtinBadge')}>
            {builtins.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </optgroup>
        )}
        {customs.length > 0 && (
          <optgroup label={t('characterCards.customBadge')}>
            {customs.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </optgroup>
        )}
      </Select>
      {cardMode && !cardExists && (
        <p className="text-[11px] text-destructive" data-testid="assistant-card-missing">
          {t('assistants.form.cardMissing')}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {cardMode ? t('assistants.form.cardModeHint') : t('assistants.form.rawModeHint')}
      </p>
    </div>
  );
}
