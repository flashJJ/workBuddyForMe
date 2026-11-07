'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
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
  /** 帧率看门狗是否自动降级（展示提示 + 一键恢复） */
  autoDegraded: boolean;
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

const BTN =
  'rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/85 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40';
const FIELD =
  'h-7 min-w-0 rounded-md border-white/10 bg-white/5 px-2 py-0 text-[11px] text-white [&>option]:text-black';

/** 舞台控制栏（空闲自动淡出由根控制 opacity/pointer-events） */
export function StageToolbar(props: Props) {
  const { t } = useI18n();
  const toast = useToast();
  const scenesQuery = useStageScenes();
  const mutations = useStageSceneMutations();
  const [name, setName] = React.useState('');
  const [loadedId, setLoadedId] = React.useState('');

  const titleKey =
    props.mode === 'mock'
      ? 'stage.modeTitle.mock'
      : props.mode === 'run'
        ? 'stage.modeTitle.run'
        : 'stage.modeTitle.meeting';

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
      className="pointer-events-auto absolute left-3 top-3 z-40 max-h-[calc(100vh-24px)] w-64 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/55 p-2.5 text-white shadow-2xl backdrop-blur-md"
      data-testid="stage-toolbar"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wide">{t(titleKey)}</p>
        <div className="flex gap-1">
          <button type="button" className={BTN} data-testid="stage-screenshot" onClick={props.onScreenshot}>
            {t('stage.ui.screenshot')}
          </button>
          <button type="button" className={BTN} onClick={props.onExit}>
            {t('stage.ui.exit')}
          </button>
        </div>
      </div>

      <section
        className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5"
        data-testid="stage-demo-section"
        hidden={props.mode !== 'mock'}
      >
        {props.mode === 'mock' && (
          <>
            <p className="mb-1 text-[10px] uppercase tracking-wider text-white/45">
              {t('stage.panel.demo')}
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" className={BTN} data-testid="stage-demo-next" onClick={props.onNextSpeaker}>
                {t('stage.demo.nextSpeaker')}
              </button>
              <button type="button" className={BTN} data-testid="stage-demo-say" onClick={props.onSayLine}>
                {t('stage.demo.sayLine')}
              </button>
              <button type="button" className={BTN} data-testid="stage-demo-expr" onClick={props.onCycleExpression}>
                {t('stage.demo.expression')}
              </button>
              <button type="button" className={BTN} data-testid="stage-demo-defocus" onClick={props.onDefocus}>
                {t('stage.demo.clearFocus')}
              </button>
            </div>
          </>
        )}
      </section>

      <section className="space-y-1 rounded-lg border border-white/10 bg-white/[0.03] p-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-white/45">
            {t('stage.panel.power')}
          </span>
          <SimpleSelect
            aria-label={t('stage.panel.power')}
            className={`${FIELD} w-44 whitespace-nowrap`}
            data-testid="stage-power-mode"
            value={props.powerMode}
            onValueChange={(v) => props.onPowerModeChange(v as StagePowerMode)}
          >
            <option value="live">{t('stage.power.live')}</option>
            <option value="portrait">{t('stage.power.portrait')}</option>
          </SimpleSelect>
        </div>
        {props.autoDegraded && (
          <div
            className="flex items-center justify-between gap-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-[11px] text-amber-100"
            data-testid="stage-auto-degraded"
          >
            <span>{t('stage.power.autoDegraded')}</span>
            <button
              type="button"
              className="shrink-0 rounded border border-amber-200/30 px-1.5 py-0.5 text-[10px] hover:bg-amber-200/10"
              data-testid="stage-restore-live"
              onClick={() => props.onPowerModeChange('live')}
            >
              {t('stage.power.restore')}
            </button>
          </div>
        )}
      </section>

      <details className="group rounded-lg border border-white/10 bg-white/[0.03]" data-testid="stage-advanced">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-1.5 py-1.5 text-[11px] text-white/65">
          <span>
            {t('stage.panel.scene')} · {t('stage.panel.background')}
          </span>
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-white/10 p-1.5">
          <StageBackgroundEditor payload={props.payload} onChange={props.onPayloadChange} />

          <section className="space-y-1" data-testid="stage-scene-section">
            <p className="text-[10px] uppercase tracking-wider text-white/45">{t('stage.panel.scene')}</p>
            <div className="flex gap-1">
              <input
                aria-label={t('stage.scene.saveAs')}
                className={`${FIELD} min-w-0 flex-1`}
                placeholder={t('stage.scene.saveAs')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="button" className={BTN} data-testid="stage-scene-save" onClick={() => void save()}>
                {t('stage.scene.saveButton')}
              </button>
            </div>
            <div className="flex gap-1">
              <SimpleSelect
                aria-label={t('stage.scene.load')}
                className={`${FIELD} min-w-0 flex-1`}
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
              <button type="button" className={BTN} disabled={!loadedId} onClick={() => void remove()}>
                {t('stage.scene.delete')}
              </button>
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}
