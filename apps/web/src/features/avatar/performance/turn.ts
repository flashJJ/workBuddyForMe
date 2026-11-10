/**
 * 背对/转身状态（纯状态机，便于单测）。
 *
 * 久无交互时把整个角色平滑转到背面（yaw → π），被点击/说话时再转回来。
 * 与手势不同，它驱动的是 scene.rotation.y，必须叠在基准朝向上。
 */

import { smoothDamp } from './gaze';

/** 转身速度（指数平滑 lambda）：约 1.2s 完成 95% */
export const TURN_LAMBDA = 2.6;
/** 判定「已经背对」的阈值（弧度） */
export const TURN_AWAY_THRESHOLD = 0.2;

export class TurnState {
  /** 当前转身角（0 = 面向镜头，π = 背对） */
  yaw = 0;
  private target = 0;

  setAway(away: boolean): void {
    this.target = away ? Math.PI : 0;
  }

  get away(): boolean {
    return this.yaw > TURN_AWAY_THRESHOLD;
  }

  get turning(): boolean {
    return Math.abs(this.yaw - this.target) > 0.01;
  }

  update(dt: number): number {
    this.yaw = smoothDamp(this.yaw, this.target, TURN_LAMBDA, dt);
    if (Math.abs(this.yaw - this.target) < 0.001) this.yaw = this.target;
    return this.yaw;
  }
}
