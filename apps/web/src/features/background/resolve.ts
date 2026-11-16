import type { WbfmBackgroundFile } from '@wbfm/shared/background';
import {
  DEFAULT_BACKGROUND_SETTINGS,
  type BackgroundConfig,
  type BackgroundSettingsUpdate,
  type BackgroundSource,
  type BackgroundScope,
} from '@wbfm/shared/schemas';
import { BUILTIN_BACKGROUNDS, BUILTIN_FALLBACK, NONE_BACKGROUND } from './builtin';

/** v4.4 M4：背景设置归一化与资源解析（纯函数，便于测试） */

export interface BackgroundResolveContext {
  files: readonly WbfmBackgroundFile[];
  wallpapers: readonly { id: string; kind: 'image' | 'video'; url: string }[];
  /** 资源缺失时的回退；默认雨夜内置视频 */
  fallback?: boolean;
}

export type ResolvedBackground =
  | { kind: 'none' }
  | { kind: 'gradient'; gradient: string }
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string };

export function mergeBackgroundConfig(
  scope: BackgroundScope,
  update?: BackgroundSettingsUpdate[keyof BackgroundSettingsUpdate],
): BackgroundConfig {
  const base = DEFAULT_BACKGROUND_SETTINGS[scope];
  if (!update) return base;
  return {
    source: update.source ?? base.source,
    fit: update.fit ?? base.fit,
    dim: update.dim ?? base.dim,
    blur: update.blur ?? base.blur,
  };
}

export function resolveBackground(
  config: BackgroundConfig,
  context: BackgroundResolveContext,
): ResolvedBackground {
  const source: BackgroundSource = config.source;
  if (source.kind === 'builtin') {
    return BUILTIN_BACKGROUNDS[source.id] ?? NONE_BACKGROUND;
  }

  const file = context.files.find((item) => item.id === source.id);
  if (file) {
    return file.kind === 'video'
      ? { kind: 'video', url: `/api/backgrounds/${file.id}` }
      : { kind: 'image', url: `/api/backgrounds/${file.id}` };
  }

  const pack = context.wallpapers.find((item) => item.id === source.id);
  if (pack) {
    return pack.kind === 'video'
      ? { kind: 'video', url: pack.url }
      : { kind: 'image', url: pack.url };
  }

  return context.fallback === false ? NONE_BACKGROUND : BUILTIN_FALLBACK;
}
