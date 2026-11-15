import type { VRM } from '@pixiv/three-vrm';
import { DEFAULT_EXPRESSION, type ExpressionTag } from '../expression/expression-parser';
import { KkFaceDriver, resolveKkExpression, stripMouthMorphs, type KkIntensity } from './kk';

/** three-vrm expressionManager preset 名；null = 不叠加任何预设（自然睁眼） */
const VRM_EXPRESSION_MAP: Record<ExpressionTag, string | null> = {
  joy: 'happy',
  sadness: 'sad',
  anger: 'angry',
  // neutral 不能映射到 relaxed：多数模型 relaxed 会半闭眼，待机会显得一直眯眼
  neutral: null,
  surprise: 'surprised',
  disgust: 'angry',
  fear: 'sad',
  smirk: 'surprised',
};

/** 会被本层整体清 0 的 preset 名（避免残留表情叠加） */
const PRESET_NAMES = ['happy', 'sad', 'angry', 'relaxed', 'surprised'] as const;

/**
 * 表情 / 口型 / 眨眼协作者（由 VrmController 外迁）。
 *
 * 分工：baseExpression 是常驻表情，flashTag 是限时的临时表情（摸头/点击反馈），
 * 到期或交互收尾时回落到 baseExpression。口型与眨眼是每帧写 morph 的独立通道。
 */
export class VrmFaceLayer {
  private readonly vrm: VRM;
  /** KK 模型可用时走 118 morph 组合，否则退回 VRM 标准表情 */
  private readonly kk: KkFaceDriver;
  private kkKey = '';
  private kkWeights: ReadonlyMap<string, number> = new Map();
  /** 说话态只保留眼/眉，避免表情嘴型与口型叠加 */
  private kkSpeakingKey = '';
  private kkSpeakingWeights: ReadonlyMap<string, number> = new Map();
  private baseExpression: ExpressionTag = DEFAULT_EXPRESSION;
  private baseIntensity: KkIntensity = 2;
  private flashTag: ExpressionTag | null = null;
  private flashUntil = 0;
  private flashIntensity: KkIntensity = 2;

  private blinkProgress = 0;    // 当前眨眼进度 0..1，0=未在播
  private blinkDuration = 0.35; // 秒
  private blinkNextDelay = 0;   // 距下次眨眼剩余秒

  private lipLevel = 0;
  /** v3.0 P1：睡眠时强制闭眼、表情回到放松 */
  private sleeping = false;

  constructor(vrm: VRM) {
    this.vrm = vrm;
    this.kk = new KkFaceDriver(vrm);
  }

  /** 是否启用 KK 表情组合（118 morph）；false = 走 VRM 标准表情 */
  get usesKkExpressions(): boolean {
    return this.kk.available;
  }

  /** 设置常驻表情（有临时表情在闪时不打断它）；intensity 1 轻 / 2 中 / 3 强 */
  setExpression(tag: ExpressionTag, intensity: KkIntensity = 2): void {
    this.baseExpression = tag;
    this.baseIntensity = intensity;
    if (!this.flashTag) this.applyNow(tag, intensity);
  }

  /** 触发限时临时表情（到 durationMs 后自动回到常驻表情） */
  flashExpression(tag: ExpressionTag, durationMs: number, intensity: KkIntensity = 2): void {
    this.flashTag = tag;
    this.flashUntil = performance.now() + durationMs;
    this.flashIntensity = intensity;
    this.applyNow(tag, intensity);
  }

  /** 三段式收尾时强制取消临时表情，让角色回 idle */
  clearFlash(): void {
    this.flashTag = null;
    this.flashUntil = 0;
    this.applyNow(this.baseExpression, this.baseIntensity);
  }

  setLipLevel(level: number): void {
    this.lipLevel = level;
  }

  /** v3.0 P1：睡眠（闭眼 + 放松表情）；唤醒后恢复常驻表情与随机眨眼 */
  setSleeping(sleeping: boolean): void {
    this.sleeping = sleeping;
    if (!sleeping) {
      this.scheduleNextBlink();
      this.applyNow(
        this.flashTag ?? this.baseExpression,
        this.flashTag ? this.flashIntensity : this.baseIntensity,
      );
    }
  }

  /** 临时表情到期检查（每帧 Step 3） */
  checkFlashExpiry(): void {
    if (!this.flashTag) return;
    if (performance.now() > this.flashUntil) this.clearFlash();
  }

  /** morph 表情层（每帧 Step 7）：睡眠优先放松，其次临时表情，最后常驻表情 */
  applyExpressionLayer(speaking = false): void {
    const tag = this.sleeping ? 'neutral' : this.flashTag ?? this.baseExpression;
    const intensity = this.flashTag && !this.sleeping ? this.flashIntensity : this.baseIntensity;
    this.applyNow(tag, intensity, speaking);
  }

  /** 口型 aa（每帧 Step 8） */
  applyLipSync(speaking: boolean, getLevel: () => number): void {
    const em = this.vrm.expressionManager;
    if (!em) return;
    // 以真实播放电平为主：部分场景 speaking 状态会滞后/提前复位，只看它会导致嘴不动。
    // 电平缺失但仍标记说话时，用低频开合兜底，保证「说话时嘴一定在动」。
    const level = Math.min(1, getLevel() * 3.2);
    const fallback = speaking ? 0.18 + 0.12 * Math.sin(performance.now() / 90) : 0;
    const value = Math.min(1, Math.max(level, fallback));
    try { em.setValue('aa', value); } catch { /* aa morph 可能不存在 */ }
  }

  /** 程序化眨眼（每帧 Step 9） */
  applyBlink(dt: number): void {
    const em = this.vrm.expressionManager;
    if (!em) return;
    if (this.sleeping) {
      try {
        em.setValue('blink', 1);
        em.setValue('winkLeft', 0);
        em.setValue('winkRight', 0);
      } catch { /* morph 可能不存在 */ }
      return;
    }

    if (this.blinkProgress > 0) {
      // 眨眼进行中：0 → 峰值 → 0（sin 半波）
      this.blinkProgress -= dt / this.blinkDuration;
      if (this.blinkProgress <= 0) {
        this.blinkProgress = 0;
        this.blinkNextDelay = 2 + Math.random() * 4;
      }
      const envelope = Math.sin((1 - this.blinkProgress) * Math.PI);
      try {
        em.setValue('blink', envelope);
        em.setValue('winkLeft', envelope * 0.8);
        em.setValue('winkRight', envelope * 0.8);
      } catch { /* morph 可能不存在 */ }
    } else {
      this.blinkNextDelay -= dt;
      if (this.blinkNextDelay <= 0) this.triggerBlink();
    }
  }

  triggerBlink(): void {
    this.blinkProgress = 1;
  }

  /** 重置随机眨眼计时（唤醒后重新开始 2–6s 周期） */
  private scheduleNextBlink(): void {
    this.blinkProgress = 0;
    this.blinkNextDelay = 2 + Math.random() * 4;
  }

  /** 写表情：KK 模型走 118 morph 组合，其余模型退回 VRM 标准预设 */
  private applyNow(tag: ExpressionTag, intensity: KkIntensity, speaking = false): void {
    if (this.kk.available) {
      const key = `${tag}:${intensity}`;
      if (key !== this.kkKey) {
        this.kkKey = key;
        this.kkWeights = resolveKkExpression(tag, intensity);
        this.kkSpeakingKey = '';
      }
      if (speaking) {
        if (this.kkSpeakingKey !== this.kkKey) {
          this.kkSpeakingKey = this.kkKey;
          this.kkSpeakingWeights = stripMouthMorphs(this.kkWeights);
        }
        this.kk.apply(this.kkSpeakingWeights);
        return;
      }
      this.kk.apply(this.kkWeights);
      return;
    }
    const em = this.vrm.expressionManager;
    if (!em) return;
    const preset = VRM_EXPRESSION_MAP[tag] ?? null;
    // 关键：先把所有 preset 清 0 再设目标——避免残留表情叠加（surprised + relaxed 同时 = 混乱）
    for (const name of PRESET_NAMES) {
      try { em.setValue(name, name === preset ? 1 : 0); } catch { /* preset 可能不存在 */ }
    }
  }
}
