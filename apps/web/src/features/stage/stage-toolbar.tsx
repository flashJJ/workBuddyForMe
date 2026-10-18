'use client';

import * as React from 'react';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useStageScenes, useStageSceneMutations } from './use-stage-scenes';
import { StageBackgroundEditor } from './stage-background-editor';
import type { StageScenePayload } from '@wbfm/shared/schemas';
import type { StageMode } from './use-stage-controller';

export type StagePowerMode = 'live' | 'portrait';

interface Props {
  /** run 模式隐藏全部 mock 演示控件（舞台零执行面，控制只发生在任务中心） */
  mode: StageMode;
  powerMode: StagePowerMode;
  onPowerModeChange: (mode: StagePowerMode) => void;
  payload: StageScenePayload;
  onPayloadChange: (payload: StageScenePayload) => void;
  onNextSpeaker: () => void;
  onSayLine: () => void;
  onCycleExpression: () => void;
  onDefocus: () => void;
  onScreenshot: () => void;
  onExit: () => void;
}

/** 舞台控制栏（空闲自动淡出由根控制 opacity/pointer-events） */
export function StageToolbar(props: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const scenesQuery = useStageScenes();
  const mutations = useStageSceneMutations();
  const [name, setName] = React.useState('');
  const [loadedId, setLoadedId] = React.useState('');

  const save = async () => {
    if (!name.trim()) {
      toast.error(t('stage.scene.nameRequired'));
      return;
    }
    if (loadedId) {
      await mutations.update.mutateAsync({ id: loadedId, input: { name: name.trim(), payload: props.payload } });
    } else {
      const created = await mutations.create.mutateAsync({ name: name.trim(), payload: props.payload });
      setLoadedId(created.id);
    }
    toast.success(t('stage.scene.saved'));
  };

  const load = (id: string) => {
    setLoadedId(id);
    const scene = scenesQuery.data?.find((s) => s.id === id);
    if (scene) {
      setName(scene.name);
      props.onPayloadChange(scene.payload);
    }
  };

  const remove = async () => {
    if (!loadedId) return;
    await mutations.delete.mutateAsync(loadedId);
    setLoadedId('');
    toast.success(t('stage.scene.deleted'));
  };

  return (
    <div
      className="pointer-events-auto absolute left-3 top-3 z-40 max-h-[calc(100vh-24px)] w-72 space-y-3 overflow-y-auto rounded-lg border border-white/15 bg-black/60 p-3 text-white backdrop-blur"
      data-testid="stage-toolbar"
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{t('stage.title')}</p>
        <div className="flex gap-1">
          <button type="button" className="rounded border px-2 py-0.5 text-xs" data-testid="stage-screenshot" onClick={props.onScreenshot}>
            {t('stage.ui.screenshot')}
          </button>
          <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={props.onExit}>
            {t('stage.ui.exit')}
          </button>
        </div>
      </div>

      <section className="space-y-1 rounded border border-white/10 p-2" data-testid="stage-demo-section" hidden={props.mode !== 'mock'}>
        {props.mode === 'mock' && (
          <>
            <p className="text-xs font-medium text-white/70">{t('stage.panel.demo')}</p>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" className="rounded border px-1 py-0.5 text-xs" data-testid="stage-demo-next" onClick={props.onNextSpeaker}>
                {t('stage.demo.nextSpeaker')}
              </button>
              <button type="button" className="rounded border px-1 py-0.5 text-xs" data-testid="stage-demo-say" onClick={props.onSayLine}>
                {t('stage.demo.sayLine')}
              </button>
              <button type="button" className="rounded border px-1 py-0.5 text-xs" data-testid="stage-demo-expr" onClick={props.onCycleExpression}>
                {t('stage.demo.expression')}
              </button>
              <button type="button" className="rounded border px-1 py-0.5 text-xs" data-testid="stage-demo-defocus" onClick={props.onDefocus}>
                {t('stage.demo.clearFocus')}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-1 rounded border border-white/10 p-2">
        <p className="text-xs font-medium text-white/70">{t('stage.panel.power')}</p>
        <SimpleSelect
          aria-label={t('stage.panel.power')}
          className="w-full rounded border bg-transparent px-1 py-0.5 text-xs text-white [&>option]:text-black"
          data-testid="stage-power-mode"
          value={props.powerMode}
          onValueChange={(v) => props.onPowerModeChange(v as StagePowerMode)}
        >
          <option value="live">{t('stage.power.live')}</option>
          <option value="portrait">{t('stage.power.portrait')}</option>
        </SimpleSelect>
      </section>

      <section className="space-y-1 rounded border border-white/10 p-2">
        <p className="text-xs font-medium text-white/70">{t('stage.panel.background')}</p>
        <StageBackgroundEditor payload={props.payload} onChange={props.onPayloadChange} />
      </section>

      <section className="space-y-1 rounded border border-white/10 p-2" data-testid="stage-scene-section">
        <p className="text-xs font-medium text-white/70">{t('stage.panel.scene')}</p>
        <div className="flex gap-1">
          <input
            aria-label={t('stage.scene.saveAs')}
            className="min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-xs"
            placeholder={t('stage.scene.saveAs')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button type="button" className="rounded border px-2 py-0.5 text-xs" data-testid="stage-scene-save" onClick={() => void save()}>
            {t('stage.scene.saveButton')}
          </button>
        </div>
        <div className="flex gap-1">
          <SimpleSelect
            aria-label={t('stage.scene.load')}
            className="min-w-0 flex-1 rounded border bg-transparent px-1 py-0.5 text-xs text-white [&>option]:text-black"
            value={loadedId}
            onValueChange={(v) => load(v)}
          >
            <option value="">{t('stage.scene.empty')}</option>
            {scenesQuery.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SimpleSelect>
          <button type="button" className="rounded border px-2 py-0.5 text-xs" disabled={!loadedId} onClick={() => void remove()}>
            {t('stage.scene.delete')}
          </button>
        </div>
      </section>
    </div>
  );
}
