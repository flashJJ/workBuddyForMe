'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/common/toast';
import { errorText } from '@/lib/i18n/resolve-error';
import { useSettings, useUpdateSettings, useAllModels } from '@/lib/hooks/use-settings';
import { useI18n } from '@/lib/i18n/use-i18n';

/**
 * v1.3 M1：知识检索设置（混合检索开关 / 相似度阈值 / 片段上限）。
 * v1.3 M4：追加编译调度（自动编译开关 / LLM 增强开关 / 增强模型）。
 * 缺省值与 core 检索/队列层一致；只写用户显式修改的字段。
 */
export function KnowledgeRetrievalPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const toast = useToast();
  const { data: models } = useAllModels();

  const [hybrid, setHybrid] = React.useState(true);
  const [minSim, setMinSim] = React.useState('0.55');
  const [maxChunks, setMaxChunks] = React.useState('8');
  const [autoCompile, setAutoCompile] = React.useState(true);
  const [compileLlm, setCompileLlm] = React.useState(false);
  const [compileModelId, setCompileModelId] = React.useState('');

  React.useEffect(() => {
    if (!settings) return;
    setHybrid(settings.hybridRetrievalEnabled !== false);
    setMinSim(String(settings.retrievalMinSimilarity ?? 0.55));
    setMaxChunks(String(settings.retrievalMaxChunks ?? 8));
    setAutoCompile(settings.autoCompile !== false);
    setCompileLlm(settings.compileWithLlm === true);
    setCompileModelId(settings.compileModelId ?? '');
  }, [settings]);

  const chatModels = React.useMemo(
    () => (models ?? []).filter((model) => model.capabilities.includes('chat')),
    [models],
  );

  const save = async () => {
    const sim = Number(minSim);
    const chunks = Number(maxChunks);
    if (!Number.isFinite(sim) || sim < 0 || sim > 1) {
      toast.error(t('settings.retrieval.invalidThreshold'));
      return;
    }
    if (!Number.isInteger(chunks) || chunks < 1 || chunks > 20) {
      toast.error(t('settings.retrieval.invalidMaxChunks'));
      return;
    }
    try {
      await updateSettings.mutateAsync({
        hybridRetrievalEnabled: hybrid,
        retrievalMinSimilarity: sim,
        retrievalMaxChunks: chunks,
        autoCompile,
        compileWithLlm: compileLlm,
        compileModelId: compileModelId === '' ? null : compileModelId,
      });
      toast.success(t('settings.defaults.settingsSaved'));
    } catch (error) {
      toast.error(errorText(error, t, { fallback: 'settings.loadError' }));
    }
  };

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="retrieval-panel">
      <div className="space-y-1">
        <h3 className="font-medium">{t('settings.retrieval.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('settings.retrieval.description')}</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={hybrid}
          onChange={(e) => setHybrid(e.target.checked)}
          data-testid="retrieval-hybrid-toggle"
          className="h-4 w-4 rounded border-input"
        />
        {t('settings.retrieval.hybridEnabled')}
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="retrieval-min-sim">{t('settings.retrieval.minSimilarity')}</Label>
          <input
            id="retrieval-min-sim"
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={minSim}
            onChange={(e) => setMinSim(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="retrieval-max-chunks">{t('settings.retrieval.maxChunks')}</Label>
          <input
            id="retrieval-max-chunks"
            type="number"
            min={1}
            max={20}
            step={1}
            value={maxChunks}
            onChange={(e) => setMaxChunks(e.target.value)}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
          />
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoCompile}
            onChange={(e) => setAutoCompile(e.target.checked)}
            data-testid="retrieval-auto-compile"
            className="h-4 w-4 rounded border-input"
          />
          {t('settings.retrieval.autoCompile')}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={compileLlm}
            onChange={(e) => setCompileLlm(e.target.checked)}
            data-testid="retrieval-compile-llm"
            className="h-4 w-4 rounded border-input"
          />
          {t('settings.retrieval.compileWithLlm')}
        </label>
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="retrieval-compile-model">{t('settings.retrieval.compileModel')}</Label>
          <select
            id="retrieval-compile-model"
            value={compileModelId}
            disabled={!compileLlm}
            onChange={(e) => setCompileModelId(e.target.value)}
            data-testid="retrieval-compile-model"
            className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50"
          >
            <option value="">{t('settings.retrieval.compileModelDefault')}</option>
            {chatModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.displayName || model.modelId}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Button type="button" size="sm" onClick={() => void save()} data-testid="retrieval-save">
          {t('common.actions.save')}
        </Button>
      </div>
    </section>
  );
}
