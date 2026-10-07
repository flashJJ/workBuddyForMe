/**
 * 桌宠鼠标穿透滞回控制器（v1.0 M0 Spike B）。
 *
 * 背景：透明桌宠窗用 setIgnoreMouseEvents(true, {forward:true}) 透传点击，
 * 渲染层靠 mousemove 命中测试决定能否交互。若「进/出模型区域」即时切换，
 * 指针在边缘抖动会导致穿透状态高频翻转（既往 Electron 项目踩过）。
 *
 * 策略（滞回）：
 * - 指针进入模型命中区：立即关闭穿透（可点击/拖拽），并取消待执行的穿透计时；
 * - 指针离开命中区：不立即穿透，启动 leaveDelayMs 延时；期间回到命中区则取消；
 * - 延时到期仍在外围：开启穿透。
 *
 * 纯逻辑 + 注入定时器，不直接依赖 Electron，便于单测；Electron 侧只消费动作。
 */

export interface PenetrationState {
  /** 当前是否穿透（true=点击落到下层窗口） */
  penetrating: boolean;
  /** 待执行的「进入穿透」计时 id；null 表示无计时 */
  leaveTimer: ReturnType<typeof setTimeout> | null;
}

export interface PenetrationControllers {
  setPenetrating: (value: boolean) => void;
  setTimer?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (id: ReturnType<typeof setTimeout>) => void;
  /** 离开命中区后多久转入穿透（毫秒） */
  leaveDelayMs?: number;
}

export const DEFAULT_PET_LEAVE_DELAY_MS = 180;

export class PetClickThroughController {
  private state: PenetrationState = { penetrating: true, leaveTimer: null };
  private readonly setPenetrating: (value: boolean) => void;
  private readonly setTimer: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimer: (id: ReturnType<typeof setTimeout>) => void;
  private readonly leaveDelayMs: number;

  constructor(controllers: PenetrationControllers) {
    this.setPenetrating = controllers.setPenetrating;
    this.setTimer =
      controllers.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer =
      controllers.clearTimer ??
      ((id) => {
        clearTimeout(id);
      });
    this.leaveDelayMs = controllers.leaveDelayMs ?? DEFAULT_PET_LEAVE_DELAY_MS;
  }

  /** 初始化：桌宠窗默认穿透（只有模型本体可交互） */
  start(): void {
    this.applyPenetrating(true);
  }

  /**
   * 渲染层命中测试结果回调（建议动画帧节流后调用）。
   * @param hovering 指针当前是否在模型可交互区域内
   */
  update(hovering: boolean): void {
    if (hovering) {
      this.cancelPendingLeave();
      if (this.state.penetrating) this.applyPenetrating(false);
      return;
    }
    // 已在穿透态且无计时，无需重复安排
    if (this.state.penetrating && this.state.leaveTimer === null) return;
    // 交互态离开：安排延迟穿透（同一时刻只允许一个计时器）
    if (!this.state.penetrating && this.state.leaveTimer === null) {
      this.state.leaveTimer = this.setTimer(() => {
        this.state.leaveTimer = null;
        this.applyPenetrating(true);
      }, this.leaveDelayMs);
    }
  }

  /** 立即强制进入某个状态（如用户在右键菜单手动切换穿透） */
  force(penetrating: boolean): void {
    this.cancelPendingLeave();
    this.applyPenetrating(penetrating);
  }

  isPenetrating(): boolean {
    return this.state.penetrating;
  }

  dispose(): void {
    this.cancelPendingLeave();
  }

  private cancelPendingLeave(): void {
    if (this.state.leaveTimer !== null) {
      this.clearTimer(this.state.leaveTimer);
      this.state.leaveTimer = null;
    }
  }

  private applyPenetrating(value: boolean): void {
    this.state.penetrating = value;
    this.setPenetrating(value);
  }
}
