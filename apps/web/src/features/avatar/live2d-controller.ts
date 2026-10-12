/**
 * Live2D 渲染控制器（M3）。
 *
 * 本文件静态 import pixi.js / pixi-live2d-display，只被 live2d-stage 动态 import()，
 * 因此 Cubism/PIXI 全部落在独立 chunk：未开启形象时不下载、不解析、不初始化。
 *
 * pld 0.4.0 自带的打包类型内嵌了一份 pixi 类型，与 pixi@7 类型身份不一致
 * （addChild 报 DisplayObject 不兼容），运行时完全兼容；边界处统一走 PldModel 结构化类型。
 */
import * as PIXI from 'pixi.js';
import { Live2DModel as PldLive2DModel } from 'pixi-live2d-display/cubism4';
import type { AvatarModelSpec } from './avatar-models';
import type { ExpressionTag } from './expression-parser';
import { DEFAULT_EXPRESSION } from './expression-parser';
import { Live2dMicrodynamics } from './live2d-microdynamics';
import {
  TOUCH_SQUASH_MS,
  TOUCH_SQUASH_SCALE_X,
  TOUCH_SQUASH_SCALE_Y,
} from '@wbfm/shared/constants';

if (typeof window !== 'undefined') {
  (window as unknown as { PIXI: unknown }).PIXI = PIXI;
}

/** pld 0.4.0 实际使用到的结构面（规避其内嵌 pixi 类型冲突） */
interface PldCoreModel {
  setParameterValueById(id: string, value: number): void;
}
interface PldModel {
  anchor: { set(x: number, y: number): void };
  /** PIXI ObservablePoint：set(x, y?) 第二参数省略时 y=x */
  scale: { set(x: number, y?: number): void };
  x: number;
  y: number;
  internalModel: {
    originalWidth: number;
    originalHeight: number;
    coreModel: PldCoreModel;
  };
  expression(name?: string): Promise<unknown>;
  motion(group: string): Promise<unknown>;
  destroy(): void;
}
interface PldModelConstructor {
  from(source: string, options?: { autoInteract?: boolean }): Promise<PldModel>;
}

export interface Live2dControllerOptions {
  model: AvatarModelSpec;
  onError?: (message: string) => void;
}

/** 说话时不再触发待机动作的静默窗口（ms） */
const IDLE_QUIET_MS = 2500;
/** 待机动作随机间隔区间（ms） */
const IDLE_INTERVAL_MIN = 7000;
const IDLE_INTERVAL_MAX = 14000;
/** 口型增益：RMS→张合度 */
const LIP_GAIN = 3.2;

export class Live2dController {
  private readonly app: PIXI.Application;
  private model: PldModel | null = null;
  private readonly micro = new Live2dMicrodynamics();
  private lipLevel = 0;
  private lastSpeechAt = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private readonly resizeObserver: ResizeObserver;
  /** layout 计算出的基础等比缩放（squash 动画围绕它做包络） */
  private baseScale = 1;
  /** 基础表情（React prop 驱动）；闪现表情期间暂存，结束后恢复 */
  private baseExpression: ExpressionTag = DEFAULT_EXPRESSION;
  private flashUntil = 0;
  private flashTag: ExpressionTag | null = null;
  /** squash 动画起始时刻；0=未在播放 */
  private squashStart = 0;

  private constructor(
    private readonly host: HTMLElement,
    private readonly spec: AvatarModelSpec,
    private readonly onError?: (message: string) => void,
  ) {
    this.app = new PIXI.Application({
      width: host.clientWidth || 320,
      height: host.clientHeight || 360,
      backgroundAlpha: 0,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      clearBeforeRender: true,
    });
    const view = this.app.view as HTMLCanvasElement;
    view.style.width = '100%';
    view.style.height = '100%';
    view.style.display = 'block';
    view.style.touchAction = 'none';
    host.appendChild(view);

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(host);
  }

  static async create(host: HTMLElement, options: Live2dControllerOptions): Promise<Live2dController> {
    const controller = new Live2dController(host, options.model, options.onError);
    try {
      const model = await (PldLive2DModel as unknown as PldModelConstructor).from(options.model.url, {
        // pld 0.4 的交互层按 pixi6 InteractionManager 注册，pixi7 下会刷 console error；
        // 点击动作由本控制器的 DOM 事件自管，关闭其内置交互
        autoInteract: false,
      });
      if (controller.disposed) {
        model.destroy();
        return controller;
      }
      controller.model = model;
      controller.app.stage.addChild(model as unknown as PIXI.DisplayObject);
      model.anchor.set(0.5, 1);
      controller.layout();
      controller.baseExpression = DEFAULT_EXPRESSION;
      await model.expression(options.model.expressions[DEFAULT_EXPRESSION] ?? '');
      controller.scheduleIdle();
      // 每帧：口型 → squash 缩放 → 微动作参数；在 pld 自身更新之后写，避免被曲线覆盖
      controller.app.ticker.add(() => controller.applyFrame());
    } catch (error) {
      // 只上报底层错误详情；「模型加载失败」前缀文案由调用方渲染时经 t() 组装
      options.onError?.((error as Error).message);
    }
    return controller;
  }

  /** 等比缩放到底区居中（anchor(0.5,1)：水平居中、脚底对齐） */
  private layout(): void {
    const model = this.model;
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!model || w === 0 || h === 0) return;
    this.app.renderer.resize(w, h);
    const fit = Math.min(
      w / model.internalModel.originalWidth,
      h / model.internalModel.originalHeight,
    );
    model.scale.set(fit * 0.92);
    this.baseScale = fit * 0.92;
    model.x = w / 2;
    model.y = h + 4;
  }

  /** 每帧综合：口型 + squash 包络 + 微动作 + 闪现表情到期回收 */
  private applyFrame(): void {
    const model = this.model;
    if (!model) return;
    this.applyLip();
    this.applySquash();
    if (this.flashTag && performance.now() > this.flashUntil) {
      this.flashTag = null;
      void this.applyExpressionNow(this.baseExpression);
    }
    const quiet =
      performance.now() - this.lastSpeechAt > IDLE_QUIET_MS && this.squashStart === 0;
    this.micro.update(model.internalModel.coreModel, quiet);
  }

  /** squash：sin 包络的缩头弹性（按下纵向压扁、横向微张，约 210ms） */
  private applySquash(): void {
    const model = this.model;
    if (!model || this.squashStart === 0) return;
    const t = (performance.now() - this.squashStart) / TOUCH_SQUASH_MS;
    if (t >= 1) {
      this.squashStart = 0;
      model.scale.set(this.baseScale);
      return;
    }
    // 0→峰值→0 的半正弦包络
    const envelope = Math.sin(t * Math.PI);
    model.scale.set(
      this.baseScale * (1 + (TOUCH_SQUASH_SCALE_X - 1) * envelope),
      this.baseScale * (1 - (1 - TOUCH_SQUASH_SCALE_Y) * envelope),
    );
  }

  private applyLip(): void {
    const model = this.model;
    if (!model) return;
    const value = this.lipLevel > 0.01 ? Math.min(1, this.lipLevel * LIP_GAIN) : 0;
    model.internalModel.coreModel.setParameterValueById(this.spec.lipParam, value);
  }

  /** 每帧喂入播放电平（0~1 RMS）；>0 抑制待机动作 */
  setLipLevel(level: number): void {
    if (level > 0.02) this.lastSpeechAt = performance.now();
    this.lipLevel = level;
  }

  /**
   * 设置基础表情（React prop 驱动）。闪现表情生效期间只更新基准、不立即切换，
   * 闪现到期后自动恢复为最新基准。
   */
  async setExpression(tag: ExpressionTag): Promise<void> {
    this.baseExpression = tag;
    if (this.flashTag) return;
    await this.applyExpressionNow(tag);
  }

  private async applyExpressionNow(tag: ExpressionTag): Promise<void> {
    const model = this.model;
    if (!model) return;
    const name = this.spec.expressions[tag] ?? this.spec.expressions[DEFAULT_EXPRESSION];
    if (name) await model.expression(name);
  }

  /**
   * 临时闪现表情（摸头害羞/连摸抗议），durationMs 后自动回基础表情。
   * 连续闪现会重置计时（以最新一次为准）。
   */
  flashExpression(tag: ExpressionTag, durationMs: number): void {
    if (!this.model) return;
    this.flashTag = tag;
    this.flashUntil = performance.now() + durationMs;
    void this.applyExpressionNow(tag);
  }

  /** 摸头：缩头弹性动画（由调用方配合 flashExpression 使用） */
  playSquash(): void {
    if (!this.model) return;
    this.squashStart = performance.now();
  }

  /** 归一化指针（-1..1，相对舞台中心）→ 微动作视线跟随 */
  setGaze(nx: number, ny: number): void {
    this.micro.setPointer(nx, ny);
  }

  /** 身体点击/触碰：播放 Tap 组随机动作（头部摸头不走这里） */
  tap(): void {
    if (!this.model) return;
    void this.model.motion(this.spec.tapGroup);
  }

  private scheduleIdle(): void {
    if (this.disposed) return;
    const delay = IDLE_INTERVAL_MIN + Math.random() * (IDLE_INTERVAL_MAX - IDLE_INTERVAL_MIN);
    this.idleTimer = setTimeout(() => {
      if (this.disposed || !this.model) return;
      const quiet = performance.now() - this.lastSpeechAt > IDLE_QUIET_MS;
      if (quiet) void this.model!.motion(this.spec.idleGroup).then(() => this.scheduleIdle());
      else this.scheduleIdle();
    }, delay);
  }

  dispose(): void {
    this.disposed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.resizeObserver.disconnect();
    try {
      this.model?.destroy();
    } catch {
      /* best-effort */
    }
    this.app.destroy(false, { children: true });
  }
}
