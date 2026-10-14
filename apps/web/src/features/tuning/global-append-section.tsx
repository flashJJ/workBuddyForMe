'use client';

import * as React from 'react';
import { GLOBAL_APPEND_PROMPT_MAX, CONTEXT_MESSAGES_MAX, CONTEXT_MESSAGES_MIN } from '@wbfm/shared/constants';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { useI18n } from '@/lib/i18n/use-i18n';

/** v1.8 G4/G5：全局追加提示词开关+文本，以及上下文条数 2–50（均为全局设置） */
export function GlobalAppendSection() {
  const { t } = useI18n();
  const toast = useToast();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const [text, setText] = React.useState('');
  const [count, setCount] = React.useState(20);
  // 乐观开关：受控勾选框直绑服务端数据时，PUT→失效→重拉窗口内点击会被 React
  // 回弹为原态（Playwright check 报「点击未改变状态」），故本地先翻值，失败回落
  const [enabledOverride, setEnabledOverride] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setText(settings?.globalAppendPrompt ?? '');
    setCount(settings?.contextMessageCount ?? 20);
  }, [settings?.globalAppendPrompt, settings?.contextMessageCount]);

  // 服务端真值到达后清除本地覆盖（成功回灌同值；失败时由回滚逻辑即时复位）
  React.useEffect(() => {
    setEnabledOverride(null);
  }, [settings?.globalAppendPromptEnabled]);

  const enabled = enabledOverride ?? settings?.globalAppendPromptEnabled === true;

  const save = async (patch: Parameters<typeof updateSettings.mutateAsync>[0]) => {
    try {
      await updateSettings.mutateAsync(patch);
      return true;
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
      return false;
    }
  };

  const commitCount = (next: number) => {
    const clamped = Math.min(CONTEXT_MESSAGES_MAX, Math.max(CONTEXT_MESSAGES_MIN, Math.round(next) || 20));
    setCount(clamped);
    if (clamped !== settings?.contextMessageCount) void save({ contextMessageCount: clamped });
  };

  return (
    <div className="space-y-4" data-testid="tuning-global-append">
      <div className="space-y-1.5">
        <Label htmlFor="tuning-context-count">{t('tuning.common.contextCount')}</Label>
        <div className="flex items-center gap-3">
          <input
            id="tuning-context-count"
            type="range"
            min={CONTEXT_MESSAGES_MIN}
            max={CONTEXT_MESSAGES_MAX}
            step={1}
            className="flex-1"
            aria-label={t('tuning.common.contextCount')}
            aria-valuetext={t('tuning.common.contextCountValue', { count })}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            onBlur={(e) => commitCount(Number(e.target.value))}
            data-testid="tuning-context-range"
          />
          <span className="w-16 text-right text-sm tabular-nums" data-testid="tuning-context-value">
            {t('tuning.common.contextCountValue', { count })}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">{t('tuning.common.contextCountHint')}</p>
      </div>

      <div className="space-y-1.5">
        <h4 className="text-sm font-medium">{t('tuning.append.title')}</h4>
        <p className="text-xs text-muted-foreground">{t('tuning.append.description')}</p>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            data-testid="tuning-append-enabled"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabledOverride(next);
              void save({ globalAppendPromptEnabled: next }).then((ok) => {
                if (!ok) setEnabledOverride(null);
              });
            }}
          />
          {t('tuning.append.enabled')}
        </label>
        <Textarea
          id="tuning-global-append"
          aria-label={t('tuning.append.title')}
          className="min-h-[96px]"
          maxLength={GLOBAL_APPEND_PROMPT_MAX}
          disabled={!enabled}
          placeholder={t('tuning.append.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            if (text !== (settings?.globalAppendPrompt ?? '')) void save({ globalAppendPrompt: text });
          }}
          data-testid="tuning-append-text"
        />
        <p className="text-right text-[11px] text-muted-foreground">
          {t('tuning.append.charCount', { count: text.length })}
        </p>
      </div>
    </div>
  );
}
