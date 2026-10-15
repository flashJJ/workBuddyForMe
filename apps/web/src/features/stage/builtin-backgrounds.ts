import type { StageBackground } from '@wbfm/shared/schemas';

/**
 * v1.9 内置舞台背景：M1 只给纯 CSS 渐变预设（不随包分发任何图片资产，
 * 规避授权与体积问题）；自定义照片走「本地图片复制进数据目录」通道。
 */
export interface BuiltinBackground {
  id: string;
  /** i18n 键后缀（stage.bg.builtin.<id>） */
  nameKey: string;
  /** 渐变角（deg）与起止色 */
  angle: number;
  from: string;
  to: string;
}

export const BUILTIN_BACKGROUNDS: BuiltinBackground[] = [
  { id: 'theater', nameKey: 'theater', angle: 180, from: '#1b2748', to: '#0a0d16' },
  { id: 'dusk', nameKey: 'dusk', angle: 165, from: '#3a2a52', to: '#7a4a34' },
  { id: 'morning', nameKey: 'morning', angle: 170, from: '#9fc3e8', to: '#e8e2d2' },
  { id: 'ink', nameKey: 'ink', angle: 180, from: '#23262b', to: '#0c0d10' },
];

export function getBuiltinBackground(id: string | undefined): BuiltinBackground {
  return BUILTIN_BACKGROUNDS.find((b) => b.id === id) ?? BUILTIN_BACKGROUNDS[0]!;
}

export const SOLID_FALLBACK = '#0a0d16';

/** 生成背景 CSS（图片背景由组件层叠加 <img>，这里只算兜底色/渐变） */
export function backgroundCss(bg: StageBackground): string {
  switch (bg.type) {
    case 'solid':
      return bg.color ?? SOLID_FALLBACK;
    case 'gradient': {
      const from = bg.from ?? '#1b2748';
      const to = bg.to ?? '#0a0d16';
      return `linear-gradient(${bg.angle ?? 180}deg, ${from}, ${to})`;
    }
    case 'builtin': {
      const preset = getBuiltinBackground(bg.builtinId);
      return `linear-gradient(${bg.angle ?? preset.angle}deg, ${bg.from ?? preset.from}, ${bg.to ?? preset.to})`;
    }
    case 'image':
      return bg.color ?? SOLID_FALLBACK;
  }
}
