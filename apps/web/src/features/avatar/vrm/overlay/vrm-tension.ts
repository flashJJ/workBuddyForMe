import { DEFAULT_LIVELINESS, dampTension, tensionTarget, type LivelinessState } from '../../animation/liveliness';

/**
 * 自然度张力的状态持有者：把交互状态平滑成 tension，控制器每帧只提供状态。
 * 单独成类是为了不让 VrmController 再持有「上一帧张力」这类可变状态。
 */
export class VrmTension {
  private value = DEFAULT_LIVELINESS.tension;

  tick(dt: number, state: LivelinessState): number {
    this.value = dampTension(this.value, tensionTarget(state), dt);
    return this.value;
  }
}
