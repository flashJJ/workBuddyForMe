'use client';

import * as React from 'react';
import {
  DEFAULT_BACKGROUND_SETTINGS,
  type BackgroundConfigUpdate,
  type BackgroundScope,
  type BackgroundSource,
  type BuiltinBackgroundId,
} from '@wbfm/shared/schemas';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings, useUpdateSettings } from '@/lib/hooks/provider';
import {
  BackgroundLayer,
  BUILTIN_GALLERY_ITEMS,
  BUILTIN_MAIN_VIDEO_ITEMS,
  BUILTIN_PET_ITEMS,
  mergeBackgroundConfig,
  resolveBackground,
  useBackgroundFiles,
  useWallpaperContent,
} from '@/features/background';

type Scope = BackgroundScope;
type ScopePatch = BackgroundConfigUpdate & { mode?: 'chat' | 'window' };

const SCOPES: Scope[] = ['main', 'stage', 'pet'];

const BUILTIN_OPTIONS = [
  { id: 'none', key: 'none' },
  { id: 'wallpaper.rainy-room', key: 'rainyRoom' },
  { id: 'wallpaper.dusk', key: 'dusk' },
  { id: 'wallpaper.morning', key: 'morning' },
] as const;

function sourceValue(source: BackgroundSource): string {
  return `${source.kind}:${source.id}`;
}

function parseSource(value: string): BackgroundSource {
  const index = value.indexOf(':');
  const kind = value.slice(0, index);
  const id = value.slice(index + 1);
  if (kind === 'builtin') return { kind: 'builtin', id: id as BuiltinBackgroundId };
  return { kind: kind === 'video' ? 'video' : 'image', id };
}

/** v4.4 M5：背景与壁纸设置面板（主窗口 / 舞台 / 桌宠三作用域） */
export function BackgroundSettingsPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const { files, reload } = useBackgroundFiles();
  const { wallpapers } = useWallpaperContent();
  const [scope, setScope] = React.useState<Scope>('main');
  const [draft, setDraft] = React.useState<Partial<Record<Scope, ScopePatch>>>({});
  const [picking, setPicking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bridge = typeof window === 'undefined' ? undefined : window.wbfm?.background;

  const stored = settings?.background?.[scope];
  const base = React.useMemo(() => mergeBackgroundConfig(scope, stored), [scope, stored]);
  const config = React.useMemo(
    () => ({ ...base, ...(draft[scope] ?? {}) }) as typeof base,
    [base, draft, scope],
  );
  const mode = scope === 'main' ? (draft.main?.mode ?? settings?.background?.main?.mode) : undefined;

  const resolved = React.useMemo(
    () => resolveBackground(config, { files, wallpapers, fallback: scope !== 'pet' }),
    [config, files, wallpapers, scope],
  );

  const patch = (next: ScopePatch) =>
    setDraft((prev) => ({ ...prev, [scope]: { ...prev[scope], ...next } }));

  /** 设置按顶层字段整体替换：每次保存提交三作用域完整配置，避免局部 patch 冲掉 source/fit/dim */
  const composeScope = (target: Scope): ScopePatch => {
    const merged = mergeBackgroundConfig(target, settings?.background?.[target]);
    if (target !== 'main') return merged;
    const modeValue = settings?.background?.main?.mode;
    return modeValue ? { ...merged, mode: modeValue } : merged;
  };

  const buildBackground = (patches: Partial<Record<Scope, ScopePatch>>) => ({
    main: { ...composeScope('main'), ...patches.main },
    stage: { ...composeScope('stage'), ...patches.stage },
    pet: { ...composeScope('pet'), ...patches.pet },
  });

  const save = () => {
    update.mutate({ background: buildBackground(draft) });
    setDraft({});
  };

  const reset = () => {
    const defaults = DEFAULT_BACKGROUND_SETTINGS[scope];
    update.mutate({
      background: buildBackground({
        [scope]: { source: defaults.source, fit: defaults.fit, dim: defaults.dim, blur: defaults.blur },
      }),
    });
    setDraft((prev) => ({ ...prev, [scope]: {} }));
  };

  const pickFile = async () => {
    if (!bridge || picking) return;
    setPicking(true);
    setError(null);
    try {
      const result = await bridge.pick();
      if (!result.canceled && result.reason) {
        const key = result.reason === 'too-large' ? 'tooLarge' : result.reason === 'unsupported' ? 'unsupported' : 'copyFailed';
        setError(t(`background.${key}` as never));
      }
      reload();
    } finally {
      setPicking(false);
    }
  };

  const removeSelected = async () => {
    if (!bridge || config.source.kind === 'builtin') return;
    const removed = await bridge.remove(config.source.id);
    if (removed) {
      patch({ source: { kind: 'builtin', id: 'none' } });
      reload();
    }
  };

  const localFile = config.source.kind === 'builtin' ? null : files.find((file) => file.id === config.source.id);

  return (
    <section className="space-y-4 rounded-lg border bg-card p-4" data-testid="background-settings-panel">
      <div>
        <h3 className="font-medium">{t('background.title')}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{t('background.description')}</p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('background.title')}>
        {SCOPES.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={scope === item}
            data-testid={`background-scope-${item}`}
            onClick={() => setScope(item)}
            className={`rounded-md border px-2.5 py-1 text-xs ${
              scope === item ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t(`background.scope.${item}` as never)}
          </button>
        ))}
      </div>

      {scope === 'main' && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('background.mode.label')}</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            data-testid="background-mode"
            value={mode ?? 'chat'}
            onChange={(event) => patch({ mode: event.target.value as 'chat' | 'window' })}
          >
            <option value="chat">{t('background.mode.chat')}</option>
            <option value="window">{t('background.mode.window')}</option>
          </select>
        </label>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground">{t('background.source.label')}</span>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          data-testid="background-source"
          value={sourceValue(config.source)}
          onChange={(event) => patch({ source: parseSource(event.target.value) })}
        >
          {BUILTIN_OPTIONS.map((item) => (
            <option key={item.id} value={`builtin:${item.id}`}>
              {t(`background.source.${item.key}`)}
            </option>
          ))}
          {BUILTIN_GALLERY_ITEMS.length > 0 && (
            <optgroup label={t('background.source.gallery')}>
              {BUILTIN_GALLERY_ITEMS.map((item) => (
                <option key={item.id} value={`builtin:${item.id}`}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          )}
          {BUILTIN_PET_ITEMS.length > 0 && (
            <optgroup label={t('background.source.pet')}>
              {BUILTIN_PET_ITEMS.map((item) => (
                <option key={item.id} value={`builtin:${item.id}`}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          )}
          {BUILTIN_MAIN_VIDEO_ITEMS.length > 0 && (
            <optgroup label={t('background.source.mainVideos')}>
              {BUILTIN_MAIN_VIDEO_ITEMS.map((item) => (
                <option key={item.id} value={`builtin:${item.id}`}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          )}
          {files.length > 0 && (
            <optgroup label={t('background.source.files')}>
              {files.map((file) => (
                <option key={file.id} value={`${file.kind}:${file.id}`}>
                  {file.name}
                </option>
              ))}
            </optgroup>
          )}
          {wallpapers.length > 0 && (
            <optgroup label={t('background.source.packs')}>
              {wallpapers.map((item) => (
                <option key={item.id} value={`${item.kind}:${item.id}`}>
                  {item.id}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      <div className="relative h-32 overflow-hidden rounded-md border">
        <BackgroundLayer
          view={{ resolved, fit: config.fit, dim: config.dim, blur: config.blur }}
          className="absolute inset-0"
          testId="background-preview"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('background.fit.label')}</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={config.fit}
            onChange={(event) => patch({ fit: event.target.value as 'cover' | 'contain' })}
          >
            <option value="cover">{t('background.fit.cover')}</option>
            <option value="contain">{t('background.fit.contain')}</option>
          </select>
        </label>
        <div className="space-y-2">
          <label className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('background.dim')}</span>
            <span>{Math.round(config.dim * 100)}%</span>
          </label>
          <input type="range" min={0} max={0.8} step={0.05} value={config.dim} className="w-full" data-testid="background-dim" onChange={(event) => patch({ dim: Number(event.target.value) })} />
          <label className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t('background.blur')}</span>
            <span>{config.blur}px</span>
          </label>
          <input type="range" min={0} max={20} step={1} value={config.blur} className="w-full" data-testid="background-blur" onChange={(event) => patch({ blur: Number(event.target.value) })} />
        </div>
      </div>

      {!bridge ? (
        <p className="text-xs text-muted-foreground">{t('background.desktopOnly')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={picking} onClick={() => void pickFile()}>
            {picking ? t('background.picking') : t('background.pick')}
          </Button>
          {localFile && (
            <Button type="button" size="sm" variant="outline" onClick={() => void removeSelected()}>
              {t('background.removeFile')}
            </Button>
          )}
          {files.length === 0 && <span className="text-xs text-muted-foreground">{t('background.emptyFiles')}</span>}
        </div>
      )}

      {scope === 'pet' && <p className="text-xs text-muted-foreground">{t('background.petHint')}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={update.isPending} onClick={save}>
          {update.isPending ? t('common.actions.saving') : t('common.actions.save')}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={reset}>
          {t('background.reset')}
        </Button>
      </div>
    </section>
  );
}
