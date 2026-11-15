import type { StageSlot } from '@wbfm/shared/schemas';
import { DEFAULT_SLOT_PLACEMENTS } from '../stage-layout';
import type { TheaterBackdropVariant } from './theater-script';

interface Props {
  /** 当前聚焦槽位；null 时聚光灯回到舞台中央 */
  focus: StageSlot | null;
  /** 场景站位覆盖：拖拽角色后聚光灯仍然跟随 */
  slots?: Partial<Record<StageSlot, { x: number }>>;
  variant?: TheaterBackdropVariant;
}

const DEFAULT_SPOT_X = 50;
const SPOT_TRANSITION = 'left 700ms cubic-bezier(0.4, 0.1, 0.2, 1)';

function spotX(focus: StageSlot | null, slots?: Props['slots']): number {
  if (!focus) return DEFAULT_SPOT_X;
  const x = slots?.[focus]?.x ?? DEFAULT_SLOT_PLACEMENTS[focus].x;
  return Math.round(x * 100);
}

/** 幕布褶皱：重复渐变画竖向褶皱，内侧再压一道阴影 */
function Curtain({ side }: { side: 'left' | 'right' }) {
  return (
    <div
      className="absolute inset-y-0 w-[7%]"
      data-testid={`theater-curtain-${side}`}
      style={{
        left: side === 'left' ? 0 : undefined,
        right: side === 'right' ? 0 : undefined,
        background:
          'repeating-linear-gradient(90deg, #4d1421 0 9px, #2b0912 9px 20px, #5a1a29 20px 28px)',
        boxShadow:
          side === 'left' ? '10px 0 28px rgba(0, 0, 0, 0.6)' : '-10px 0 28px rgba(0, 0, 0, 0.6)',
        borderRadius: side === 'left' ? '0 10px 10px 0' : '10px 0 0 10px',
      }}
    />
  );
}

/**
 * S3 剧场背景：纯 CSS 绘制后墙暖光、聚光灯、地面光池、木地板、侧幕/檐幕与暗角。
 * 不引入图片素材；人物层在 z-10，本层固定在 z-2，不遮挡角色与名字牌。
 */
export function TheaterBackdrop({ focus, slots, variant = 'curtain' }: Props) {
  if (variant === 'none') return null;
  const x = spotX(focus, slots);
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
      data-testid="theater-backdrop"
      data-variant={variant}
    >
      {/* 后墙暖光：把默认冷色渐变拉回剧场氛围 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 66% 58% at 50% 28%, rgba(104, 54, 66, 0.55), rgba(30, 16, 24, 0.2) 62%, transparent 80%)',
        }}
      />
      {/* 聚光灯：从顶部打到当前发言者，换句时平移过渡 */}
      <div
        className="absolute top-0 h-[86%] w-[44%] -translate-x-1/2"
        data-testid="theater-spotlight"
        data-spot-x={x}
        style={{
          left: `${x}%`,
          transition: SPOT_TRANSITION,
          background:
            'radial-gradient(ellipse 48% 52% at 50% 10%, rgba(255, 238, 202, 0.3), rgba(255, 238, 202, 0.09) 52%, transparent 74%)',
        }}
      />
      {/* 地面光池 */}
      <div
        className="absolute bottom-[9%] h-[8%] w-[30%] -translate-x-1/2 rounded-[50%]"
        data-testid="theater-floor-pool"
        data-spot-x={x}
        style={{
          left: `${x}%`,
          transition: SPOT_TRANSITION,
          background:
            'radial-gradient(ellipse at center, rgba(255, 232, 190, 0.26), rgba(255, 232, 190, 0.06) 58%, transparent 72%)',
        }}
      />
      {/* 木地板与舞台边沿 */}
      <div
        className="absolute inset-x-0 bottom-0 h-[17%]"
        data-testid="theater-floor"
        style={{
          background:
            'linear-gradient(to bottom, rgba(30, 16, 22, 0) 0%, rgba(60, 32, 38, 0.4) 18%, rgba(18, 10, 14, 0.94) 100%), repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.045) 0 1px, transparent 1px 9%)',
        }}
      />
      {variant === 'curtain' && (
        <>
          <div
            className="absolute inset-x-0 top-0 h-[6.5%]"
            data-testid="theater-valance"
            style={{
              background: 'linear-gradient(to bottom, #3b101b, #1e0710)',
              borderBottom: '2px solid rgba(201, 163, 91, 0.4)',
              boxShadow: '0 8px 22px rgba(0, 0, 0, 0.55)',
            }}
          />
          <Curtain side="left" />
          <Curtain side="right" />
        </>
      )}
      {/* 背景暗角：只压背景，不压角色与字幕 */}
      <div
        className="absolute inset-0"
        data-testid="theater-vignette"
        style={{
          background:
            'radial-gradient(ellipse 80% 74% at 50% 44%, transparent 54%, rgba(0, 0, 0, 0.5) 100%)',
        }}
      />
    </div>
  );
}
