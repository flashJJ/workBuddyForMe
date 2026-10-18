'use client';

import * as React from 'react';
import type { Assistant } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { Spinner } from '@/components/common/state';
import { useConfirm } from '@/components/common/confirm-dialog';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useAssistants, useAssistantMutations } from '@/lib/hooks/use-assistants';
import { useAllModels, useSettings } from '@/lib/hooks/use-settings';
import { useI18n } from '@/lib/i18n/use-i18n';
import { NumberField } from '../assistants/number-field';
import { ScenarioModelMatrix } from './scenario-model-matrix';
import { GlobalAppendSection } from './global-append-section';

type AssistantPatch = Parameters<ReturnType<typeof useAssistantMutations>['update']['mutateAsync']>[0]['body'];

export function TuningPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: assistants, isLoading } = useAssistants();
  const { data: models } = useAllModels();
  const { data: settings } = useSettings();
  const mutations = useAssistantMutations();
  const [selectedId, setSelectedId] = React.useState('');
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  /**
   * 水合门控：查询态（loading / 数据是否到达）在 SSR 与客户端首帧可能不一致，
   * 若直接据此切换结构，会在水合窗口内发生结构交换（React #418/#422）。
   * 首帧恒与 SSR 一致（仅标题），挂载后再按数据展开。与 EmotionPanel 等面板同口径。
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!selectedId && assistants && assistants.length > 0) setSelectedId(assistants[0]!.id);
    if (selectedId && assistants && !assistants.some((a) => a.id === selectedId)) {
      setSelectedId(assistants[0]?.id ?? '');
    }
  }, [assistants, selectedId]);

  const assistant = assistants?.find((a) => a.id === selectedId) ?? null;
  const chatModels = (models ?? []).filter((m) => m.capabilities.includes('chat'));

  const patch = async (body: AssistantPatch, successKey?: 'restored') => {
    if (!assistant) return;
    try {
      await mutations.update.mutateAsync({ id: assistant.id, body });
      if (successKey) toast.success(t('tuning.advanced.restored'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'toast.saveFailed' }));
    }
  };

  const restoreDefaults = async () => {
    if (!assistant) return;
    const ok = await confirm({
      title: t('tuning.advanced.restore'),
      description: t('tuning.advanced.restoreConfirm'),
      danger: false,
    });
    if (!ok) return;
    await patch(
      {
        temperature: 1,
        topP: 1,
        maxTokens: null,
        plannerModelId: null,
        executorModelId: null,
        reviewerModelId: null,
      },
      'restored',
    );
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="tuning-panel">
      <div>
        <h3 className="font-medium">{t('tuning.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('tuning.description')}</p>
      </div>

      {mounted && isLoading && <Spinner />}
      {mounted && !isLoading && assistants && assistants.length === 0 && (
        <p className="text-xs text-muted-foreground">{t('tuning.assistantAllHint')}</p>
      )}

      {mounted && assistant && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="tuning-assistant">{t('tuning.assistantLabel')}</Label>
            <SimpleSelect
              id="tuning-assistant"
              aria-label={t('tuning.assistantLabel')}
              value={selectedId}
              onValueChange={setSelectedId}
            >
              {assistants!.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.emoji ? `${a.emoji} ` : ''}
                  {a.name}
                </option>
              ))}
            </SimpleSelect>
            <p className="text-[11px] text-muted-foreground">{t('tuning.assistantAllHint')}</p>
          </div>

          <ScenarioModelMatrix
            assistant={assistant}
            defaultChatModelId={settings?.defaultChatModelId ?? null}
            chatModels={chatModels}
            onPatch={(p) => void patch(p)}
          />

          {/* 常用区 */}
          <div className="space-y-3 rounded-md border p-3" data-testid="tuning-common">
            <h4 className="text-sm font-medium">{t('tuning.common.title')}</h4>
            <NumberField
              id="tuning-temperature"
              label={t('tuning.common.temperature')}
              value={String(assistant.temperature)}
              step="0.1"
              min="0"
              max="2"
              onChange={(value) => {
                const n = Number(value);
                if (value !== '' && !Number.isNaN(n)) void patch({ temperature: n });
              }}
            />
            <p className="-mt-2 text-[11px] text-muted-foreground">{t('tuning.common.temperatureHint')}</p>
          </div>

          {/* 高级区 */}
          <div className="rounded-md border">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-start"
              aria-expanded={showAdvanced}
              data-testid="tuning-advanced-toggle"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? t('tuning.advanced.hide') : t('tuning.advanced.show')}
            </Button>
            {showAdvanced && (
              <div className="space-y-3 p-3 pt-0" data-testid="tuning-advanced-body">
                <div className="grid grid-cols-2 gap-3">
                  <NumberField
                    id="tuning-topp"
                    label={t('tuning.advanced.topP')}
                    value={String(assistant.topP)}
                    step="0.05"
                    min="0"
                    max="1"
                    onChange={(value) => {
                      const n = Number(value);
                      if (value !== '' && !Number.isNaN(n)) void patch({ topP: n });
                    }}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="tuning-maxtokens">{t('tuning.advanced.maxTokens')}</Label>
                    <Input
                      id="tuning-maxtokens"
                      inputMode="numeric"
                      value={assistant.maxTokens ?? ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        void patch({ maxTokens: v ? Number(v) : null });
                      }}
                    />
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    data-testid="tuning-expression"
                    checked={assistant.expressionEnabled}
                    onChange={(e) => void patch({ expressionEnabled: e.target.checked })}
                  />
                  <span>
                    {t('tuning.advanced.expression')}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {t('tuning.advanced.expressionHint')}
                    </span>
                  </span>
                </label>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">{t('tuning.advanced.personalitySummary')}</p>
                  <p data-testid="tuning-personality-readonly">
                    {t('tuning.advanced.personalityReadonlyHint', {
                      values: [
                        assistant.personalityFrankness,
                        assistant.personalityTsundere,
                        assistant.personalityShy,
                        assistant.personalityTolerance,
                      ].join(' / '),
                    })}
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => void restoreDefaults()}>
                  {t('tuning.advanced.restore')}
                </Button>
              </div>
            )}
          </div>

          <GlobalAppendSection />
        </>
      )}
    </section>
  );
}
