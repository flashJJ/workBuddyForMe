/**
 * v1.6 M3 A 档自主微动作（无模型请求、纯参数驱动）。
 *
 * 每个 PIXI ticker 帧由 Live2dController 调用 update()：
 * - 呼吸（ParamBreath）：连续轻微正弦；
 * - 视线（ParamEyeBallX/Y）：跟随最近的归一化指针，超时无移动回正（偶尔漂向一侧偷看）；
 * - 头部微摆（ParamAngleX/Y）：仅在安静（未说话/未放动作）时按区间随机触发，缓出回正。
 *
 * 参数 id 使用 Cubism 通用名；个别样本模型缺该参数时核心静默忽略（pld 不抛错）。
 */

interface CoreParamWriter {
  setParameterValueById(id: string, value: number): void;
}

/** Cubism 通用参数键 */
const PARAM_BREATH = 'ParamBreath';
const PARAM_EYE_X = 'ParamEyeBallX';
const PARAM_EYE_Y = 'ParamEyeBallY';
const PARAM_ANGLE_X = 'ParamAngleX';
const PARAM_ANGLE_Y = 'ParamAngleY';

/** 呼吸周期（ms）与幅度 */
const BREATH_PERIOD_MS = 3800;
const BREATH_AMPLITUDE = 0.35;
/** 头部微摆区间与幅度 */
const SWAY_INTERVAL_MIN = 9000;
const SWAY_INTERVAL_MAX = 17000;
const SWAY_ANGLE_DEG = 7;
const SWAY_HOLD_MS = 1400;
/** 视线：指针→眼球增益、超时回正、偷看概率 */
const GAZE_EYE_GAIN = 0.9;
const GAZE_ANGLE_GAIN = 0.18;
const GAZE_TIMEOUT_MS = 2400;
/** 每帧发起偷看的概率（约 60fps 下 ≈ 每分钟 0.29 次的低概率生命感） */
const PEEK_PER_FRAME_PROBABILITY = 0.0008;

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

export class Live2dMicrodynamics {
  /** 归一化指针 -1..1（0 表示居中）；null 表示本帧无有效输入 */
  private gazeX = 0;
  private gazeY = 0;
  private lastPointerAt = 0;
  private peekX = 0;
  private peekUntil = 0;
  private nextSwayAt: number;
  private swayStartAt = 0;
  private swayTargetX = 0;
  private swayTargetY = 0;
  private swaying = false;

  constructor(private readonly now: () => number = () => performance.now()) {
    this.nextSwayAt = now() + SWAY_INTERVAL_MIN;
  }

  /** 舞台层把命中盒内指针归一化后喂入（-1..1） */
  setPointer(nx: number, ny: number): void {
    this.gazeX = Math.max(-1, Math.min(1, nx));
    this.gazeY = Math.max(-1, Math.min(1, ny));
    this.lastPointerAt = this.now();
    this.peekX = 0;
  }

  /**
   * 每帧写入参数。
   * @param core pld 核心模型
   * @param quiet 当前是否允许头部微摆（说话/动作期间为 false；呼吸与视线不受限）
   */
  update(core: CoreParamWriter, quiet: boolean): void {
    const now = this.now();

    // 呼吸：恒定轻微
    const phase = (now % BREATH_PERIOD_MS) / BREATH_PERIOD_MS;
    core.setParameterValueById(PARAM_BREATH, Math.sin(phase * Math.PI * 2) * BREATH_AMPLITUDE);

    // 视线：近期有指针跟随，否则回正；安静时偶发偷看
    const pointerFresh = now - this.lastPointerAt < GAZE_TIMEOUT_MS;
    let eyeX = 0;
    let angleX = 0;
    if (pointerFresh) {
      eyeX = this.gazeX * GAZE_EYE_GAIN;
      angleX = this.gazeX * SWAY_ANGLE_DEG * GAZE_ANGLE_GAIN;
    } else if (quiet && Math.random() < PEEK_PER_FRAME_PROBABILITY && this.peekX === 0) {
      // 低概率发起一次约 1.4s 的偷看（方向随机），由计时线性回零
      this.peekX = (Math.random() < 0.5 ? -1 : 1) * 0.8;
      this.peekUntil = now + SWAY_HOLD_MS;
    }
    if (this.peekX !== 0) {
      const remain = Math.max(0, this.peekUntil - now) / SWAY_HOLD_MS;
      eyeX = this.peekX * remain;
      angleX = this.peekX * SWAY_ANGLE_DEG * 0.6 * remain;
      if (remain === 0) this.peekX = 0;
    }
    core.setParameterValueById(PARAM_EYE_X, eyeX);
    core.setParameterValueById(PARAM_EYE_Y, pointerFresh ? this.gazeY * GAZE_EYE_GAIN : 0);
    core.setParameterValueById(PARAM_ANGLE_X, angleX);

    // 头部微摆：安静时按随机区间发起，缓出到目标再回正
    if (!quiet) {
      this.swaying = false;
      return;
    }
    if (!this.swaying && now >= this.nextSwayAt) {
      this.swaying = true;
      this.swayStartAt = now;
      this.swayTargetX = (Math.random() * 2 - 1) * SWAY_ANGLE_DEG;
      this.swayTargetY = (Math.random() * 2 - 1) * 2;
    }
    if (this.swaying) {
      const t = (now - this.swayStartAt) / SWAY_HOLD_MS;
      if (t >= 1) {
        this.swaying = false;
        this.nextSwayAt =
          now + SWAY_INTERVAL_MIN + Math.random() * (SWAY_INTERVAL_MAX - SWAY_INTERVAL_MIN);
        core.setParameterValueById(PARAM_ANGLE_X, 0);
        core.setParameterValueById(PARAM_ANGLE_Y, 0);
      } else {
        // 与视线角度叠加后写回（取微摆主导）
        const envelope = t < 0.5 ? easeInOutSine(t * 2) : easeInOutSine((1 - t) * 2);
        core.setParameterValueById(PARAM_ANGLE_X, this.swayTargetX * envelope + angleX);
        core.setParameterValueById(PARAM_ANGLE_Y, this.swayTargetY * envelope);
      }
    }
  }
}
