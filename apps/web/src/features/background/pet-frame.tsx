'use client';

import { useBackground } from './hooks/use-background';

/** 画框宽度（与背景内缩保持一致） */
export const PET_FRAME_PADDING = 7;

/**
 * v4.4 M6：桌宠窗木相框特效。
 * 仅在配置了背景时出现；纯 CSS 渐变木纹，不引入图片资源。
 * z-[15]：盖住角色画布与命中盒，但低于字幕（z-20）与菜单（z-50）。
 */
export function PetFrameOverlay() {
  const view = useBackground('pet');
  if (view.resolved.kind === 'none') return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[15]"
      data-testid="pet-frame"
      aria-hidden="true"
    >
      <div
        className="absolute inset-0 rounded-[22px]"
        style={{ boxShadow: '0 10px 28px rgba(0, 0, 0, 0.35)' }}
      />
      <div
        className="absolute inset-0 rounded-[22px]"
        style={{
          padding: PET_FRAME_PADDING,
          background:
            'linear-gradient(135deg, #a97649 0%, #6b4527 28%, #8f5f38 52%, #4e3018 78%, #9c6a3f 100%)',
          WebkitMask:
            'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
        }}
      />
      <div className="absolute inset-0 rounded-[22px] ring-1 ring-white/10" />
      <div className="absolute inset-[7px] rounded-[15px] ring-1 ring-black/40" />
    </div>
  );
}
