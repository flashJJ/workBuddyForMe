'use client';

import * as React from 'react';
import type { StageBackground, StageScenePayload } from '@wbfm/shared/schemas';
import { NumberInput } from '@/components/ui/number-input';
import { SimpleSelect } from '@/components/ui/simple-select';
import { useI18n } from '@/lib/i18n/use-i18n';
import { BUILTIN_BACKGROUNDS, getBuiltinBackground } from './builtin-backgrounds';
import { useStageSceneMutations } from './use-stage-scenes';

interface Props {
  payload: StageScenePayload;
  onChange: (payload: StageScenePayload) => void;
}

function RangeRow(props: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-10 shrink-0">{props.label}</span>
      <input
        type="range"
        className="flex-1"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        aria-label={props.label}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="w-9 text-right tabular-nums">{props.value.toFixed(2)}</span>
    </label>
  );
}

/** 背景/灯光编辑区（场景草稿直接改 payload；保存按钮统一落库） */
export function StageBackgroundEditor({ payload, onChange }: Props) {
  const { t } = useI18n();
  const upload = useStageSceneMutations().uploadBackground;
  const bg = payload.background;
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const patch = (next: Partial<StageBackground>) =>
    onChange({ ...payload, background: { ...bg, ...next } });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    const { fileRef } = await upload.mutateAsync(file);
    patch({ type: 'image', fileRef });
  };

  return (
    <div className="space-y-2" data-testid="stage-bg-editor">
      <label className="flex items-center gap-2 text-xs">
        <span className="w-10 shrink-0">{t('stage.bg.type')}</span>
        <SimpleSelect
          className="flex-1 rounded border bg-background px-1 py-0.5 text-xs"
          aria-label={t('stage.bg.type')}
          value={bg.type}
          onValueChange={(v) => {
            const type = v as StageBackground['type'];
            if (type === 'builtin') {
              const preset = getBuiltinBackground(bg.builtinId);
              patch({ type, builtinId: preset.id });
            } else if (type === 'gradient') {
              patch({ type, from: '#1b2748', to: '#0a0d16', angle: 180 });
            } else if (type === 'solid') {
              patch({ type, color: '#0a0d16' });
            } else {
              patch({ type });
            }
          }}
        >
          <option value="solid">{t('stage.bg.solid')}</option>
          <option value="gradient">{t('stage.bg.gradient')}</option>
          <option value="builtin">{t('stage.bg.builtinLabel')}</option>
          <option value="image">{t('stage.bg.image')}</option>
        </SimpleSelect>
      </label>

      {bg.type === 'solid' && (
        <input
          type="color"
          aria-label={t('stage.bg.color')}
          className="h-7 w-full"
          value={bg.color ?? '#0a0d16'}
          onChange={(e) => patch({ color: e.target.value })}
        />
      )}

      {bg.type === 'gradient' && (
        <div className="grid grid-cols-3 items-center gap-2 text-xs">
          <input type="color" aria-label={t('stage.bg.from')} className="h-7" value={bg.from ?? '#1b2748'} onChange={(e) => patch({ from: e.target.value })} />
          <input type="color" aria-label={t('stage.bg.to')} className="h-7" value={bg.to ?? '#0a0d16'} onChange={(e) => patch({ to: e.target.value })} />
          <NumberInput min={0} max={360} value={bg.angle ?? 180} onValueChange={(v) => patch({ angle: v })} />
        </div>
      )}

      {bg.type === 'builtin' && (
        <SimpleSelect
          aria-label={t('stage.bg.preset')}
          className="w-full rounded border bg-background px-1 py-0.5 text-xs"
          value={bg.builtinId ?? BUILTIN_BACKGROUNDS[0]!.id}
          onValueChange={(v) => patch({ builtinId: v })}
        >
          {BUILTIN_BACKGROUNDS.map((b) => (
            <option key={b.id} value={b.id}>
              {t(`stage.bg.builtin.${b.nameKey}` as never)}
            </option>
          ))}
        </SimpleSelect>
      )}

      {bg.type === 'image' && (
        <div className="space-y-1">
          <button
            type="button"
            className="w-full rounded border px-2 py-1 text-xs"
            data-testid="stage-bg-upload"
            onClick={() => fileInputRef.current?.click()}
          >
            {t('stage.bg.upload')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
        </div>
      )}

      <RangeRow label={t('stage.bg.brightness')} min={0.6} max={1.4} step={0.02} value={bg.brightness} onChange={(v) => patch({ brightness: v })} />
      <RangeRow label={t('stage.bg.blur')} min={0} max={20} step={0.5} value={bg.blur} onChange={(v) => patch({ blur: v })} />
      <RangeRow
        label={t('stage.bg.warm')}
        min={0}
        max={0.6}
        step={0.02}
        value={payload.warmFilter.opacity}
        onChange={(v) => onChange({ ...payload, warmFilter: { ...payload.warmFilter, opacity: v } })}
      />

      <div className="flex gap-3 text-xs">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={payload.showDialog} onChange={(e) => onChange({ ...payload, showDialog: e.target.checked })} />
          {t('stage.ui.dialog')}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={payload.showNameplates} onChange={(e) => onChange({ ...payload, showNameplates: e.target.checked })} />
          {t('stage.ui.nameplates')}
        </label>
      </div>
    </div>
  );
}
