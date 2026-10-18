'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useAssistants } from '@/lib/hooks/use-assistants';
import { useSettings, useUpdateSettings } from '@/lib/hooks/use-settings';
import { EmotionDetailView } from './emotion-detail-view';

/** 勿扰时段可选小时（0–23） */
const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * v1.6 情绪与互动设置面板：
 * 总开关（即时保存）+ 互动短句开关 + 助手选择；
 * 状态/近期互动/重置在 EmotionDetailView（拆分守行数门禁）。
 */
export function EmotionPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: assistants } = useAssistants();
  const [selectedId, setSelectedId] = React.useState<string>('');
  // 水合门控：assistants 到达时机早于整页水合完成时，select/兜底文案的结构交换
  // 会在未水合子树提交，触发 React #418/#422（整根降级客户端渲染，慢机下按钮死点击）。
  // 首帧恒与 SSR 一致渲染兜底文案，挂载后再按数据切换。
  const [hydrated, setHydrated] = React.useState(false);
  React.useEffect(() => setHydrated(true), []);

  // 默认选中第一个助手
  React.useEffect(() => {
    if (!selectedId && assistants && assistants.length > 0) {
      setSelectedId(assistants[0]!.id);
    }
    if (selectedId && assistants && !assistants.some((a) => a.id === selectedId)) {
      setSelectedId(assistants[0]?.id ?? '');
    }
  }, [assistants, selectedId]);

  // 乐观覆盖：点击立即反映，慢网络下避免受控 checkbox 被服务端旧值弹回；
  // 服务端值追上（effect）后收敛，请求失败回滚（全局 toast 同时报错）。
  const [emotionOverride, setEmotionOverride] = React.useState<boolean | null>(null);
  const [linesOverride, setLinesOverride] = React.useState<boolean | null>(null);
  React.useEffect(() => setEmotionOverride(null), [settings?.emotionEnabled]);
  React.useEffect(() => setLinesOverride(null), [settings?.interactionLinesEnabled]);

  const enabled = emotionOverride ?? settings?.emotionEnabled !== false;
  const linesEnabled = linesOverride ?? settings?.interactionLinesEnabled !== false;

  const toggle = async (next: boolean) => {
    setEmotionOverride(next);
    try {
      await updateSettings.mutateAsync({ emotionEnabled: next });
    } catch {
      setEmotionOverride(null);
    }
  };

  const toggleLines = async (next: boolean) => {
    setLinesOverride(next);
    try {
      await updateSettings.mutateAsync({ interactionLinesEnabled: next });
    } catch {
      setLinesOverride(null);
    }
  };

  // v2.2 勿扰时段：开关 + 起止小时（缺省 23:00–06:00），同样乐观覆盖即时保存
  const [dndOverride, setDndOverride] = React.useState<boolean | null>(null);
  const [dndStartOverride, setDndStartOverride] = React.useState<number | null>(null);
  const [dndEndOverride, setDndEndOverride] = React.useState<number | null>(null);
  React.useEffect(() => setDndOverride(null), [settings?.doNotDisturbEnabled]);
  React.useEffect(() => setDndStartOverride(null), [settings?.doNotDisturbStartHour]);
  React.useEffect(() => setDndEndOverride(null), [settings?.doNotDisturbEndHour]);

  const dndEnabled = dndOverride ?? settings?.doNotDisturbEnabled !== false;
  const dndStart = dndStartOverride ?? settings?.doNotDisturbStartHour ?? 23;
  const dndEnd = dndEndOverride ?? settings?.doNotDisturbEndHour ?? 6;

  const toggleDnd = async (next: boolean) => {
    setDndOverride(next);
    try {
      await updateSettings.mutateAsync({ doNotDisturbEnabled: next });
    } catch {
      setDndOverride(null);
    }
  };

  const changeDndHour = async (which: 'start' | 'end', value: number) => {
    const setOverride = which === 'start' ? setDndStartOverride : setDndEndOverride;
    setOverride(value);
    try {
      await updateSettings.mutateAsync(
        which === 'start' ? { doNotDisturbStartHour: value } : { doNotDisturbEndHour: value },
      );
    } catch {
      setOverride(null);
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="emotion-panel">
      <div>
        <h3 className="font-medium">{t('settings.emotion.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('settings.emotion.description')}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          data-testid="emotion-enabled-toggle"
          checked={enabled}
          onChange={(e) => void toggle(e.target.checked)}
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">{t('settings.emotion.enable')}</span>
          <span className="block text-xs text-muted-foreground">{t('settings.emotion.enableHint')}</span>
        </span>
      </label>

      {enabled && (
        <label className="flex cursor-pointer items-start gap-2.5 pl-[26px]">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-input"
            data-testid="emotion-lines-toggle"
            checked={linesEnabled}
            onChange={(e) => void toggleLines(e.target.checked)}
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">{t('settings.emotion.enableLines')}</span>
            <span className="block text-xs text-muted-foreground">{t('settings.emotion.enableLinesHint')}</span>
          </span>
        </label>
      )}

      {/* v2.2 勿扰时段：开关 + 起止小时（缺省 23:00–06:00） */}
      <label className="flex cursor-pointer items-start gap-2.5 border-t pt-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-input"
          data-testid="dnd-enabled-toggle"
          checked={dndEnabled}
          onChange={(e) => void toggleDnd(e.target.checked)}
        />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium">{t('settings.emotion.doNotDisturbTitle')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('settings.emotion.doNotDisturbEnable')}
          </span>
        </span>
      </label>

      {dndEnabled && (
        <div className="flex flex-wrap items-center gap-3 pl-[26px] text-xs text-muted-foreground">
          <label className="flex items-center gap-1.5">
            {t('settings.emotion.doNotDisturbStart')}
            <SimpleSelect
              className="h-8 rounded-md border bg-background text-sm"
              data-testid="dnd-start-hour"
              value={String(dndStart)}
              onValueChange={(v) => void changeDndHour('start', Number(v))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{`${h}:00`}</option>
              ))}
            </SimpleSelect>
          </label>
          <label className="flex items-center gap-1.5">
            {t('settings.emotion.doNotDisturbEnd')}
            <SimpleSelect
              className="h-8 rounded-md border bg-background text-sm"
              data-testid="dnd-end-hour"
              value={String(dndEnd)}
              onValueChange={(v) => void changeDndHour('end', Number(v))}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{`${h}:00`}</option>
              ))}
            </SimpleSelect>
          </label>
        </div>
      )}
      <p className="pl-[26px] text-xs text-muted-foreground">
        {t('settings.emotion.doNotDisturbHint')}
      </p>

      {enabled && (
        <div className="space-y-3 border-t pt-3">
          <div className="space-y-1.5">
            <Label htmlFor="emotion-assistant-select">{t('settings.emotion.assistant')}</Label>
            {hydrated && assistants && assistants.length > 0 ? (
              <SimpleSelect
                id="emotion-assistant-select"
                className="h-9 w-full rounded-md border bg-background text-sm"
                value={selectedId}
                onValueChange={(v) => setSelectedId(v)}
              >
                {assistants.map((assistant) => (
                  <option key={assistant.id} value={assistant.id}>
                    {assistant.emoji ? `${assistant.emoji} ` : ''}
                    {assistant.name}
                  </option>
                ))}
              </SimpleSelect>
            ) : (
              <p className="text-xs text-muted-foreground">{t('settings.emotion.noAssistant')}</p>
            )}
          </div>

          {selectedId && (
            <>
              <div className="text-xs font-medium text-muted-foreground">
                {t('settings.emotion.stateTitle')}
              </div>
              <EmotionDetailView key={selectedId} assistantId={selectedId} />
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('settings.emotion.hint')}</p>
    </section>
  );
}
