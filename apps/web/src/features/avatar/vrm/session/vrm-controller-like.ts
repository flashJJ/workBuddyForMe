import type { ExpressionTag } from '../../expression/expression-parser';
import type { TouchControllerLike } from '../../ui/use-head-touch';

/** VRM 控制器对外最小接口（与 Live2dController 对齐，供 React 层复用） */
export interface VrmControllerLike extends TouchControllerLike {
  playSquash(): void;
  flashExpression(tag: ExpressionTag, durationMs: number, intensity?: 1 | 2 | 3): void;
  setGaze(nx: number, ny: number): void;
  tap(): void;
  setLipLevel(level: number): void;
  setExpression(tag: ExpressionTag, intensity?: 1 | 2 | 3): void;
  playBehavior?(id: string): boolean;
  stopBehavior?(): boolean;
  /** M0d T2.2：语义表情通道预览；null 释放 */
  setMorphChannels?(channels: Record<string, number> | null): void;
  dispose(): void;
}
