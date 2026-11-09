import * as PIXI from 'pixi.js';
import {
  DEFAULT_EXPRESSION,
  getAvatarModel,
  Live2dMicrodynamics,
  loadCubismCore,
  type ExpressionTag,
} from '@/features/avatar';
import type { StageSlot } from '@wbfm/shared/schemas';
import { desiredAutoUpdate, syncAutoUpdate } from './auto-update';
import type { StageLive2dActor, StageLive2dOptions } from './types';

/**
 * 舞台专用 Live2D 共享渲染器。
 *
 * 为什么不能每个角色一个 PIXI.Application：Cubism 的裁剪管理器在模块级共享
 * viewport/FBO，多个 WebGL 上下文会互相绑定对方的纹理与缓冲，结果只有第一个
 * canvas 能正常出画（控制台报 object does not belong to this context）。
 * 因此舞台把 2–4 个 Live2D 模型放进同一个应用/同一个上下文，按槽位布局。
 */

if (typeof window !== 'undefined') {
  (window as unknown as { PIXI: unknown }).PIXI = PIXI;
}

interface PldCoreModel {
  setParameterValueById(id: string, value: number): void;
}
interface PldModel {
  anchor: { set(x: number, y: number): void };
  scale: { set(x: number, y?: number): void };
  x: number;
  y: number;
  zIndex: number;
  autoUpdate: boolean;
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

const LIP_GAIN = 3.2;
const IDLE_QUIET_MS = 2500;
const IDLE_INTERVAL_MIN = 7000;
const IDLE_INTERVAL_MAX = 14000;

interface Entry {
  slot: StageSlot;
  modelId: string;
  spec: ReturnType<typeof getAvatarModel>;
  model: PldModel | null;
  micro: Live2dMicrodynamics;
  idleTimer: ReturnType<typeof setTimeout> | null;
  /** 模型加载中：update 高频调用（拖拽）时避免并发重复加载同一角色 */
  loading: boolean;
  /** 加载代次：每次加载/销毁自增，旧加载回来时据此丢弃 */
  token: number;
  actor: StageLive2dActor | null;
  lastSpeechAt: number;
  lastExpression: ExpressionTag | null;
  /** 已写入 pld 的 autoUpdate；null=新模型/已销毁，首次写入才触达 setter */
  appliedAutoUpdate: boolean | null;
}

export interface StageLive2dController {
  update(actors: StageLive2dActor[], options: StageLive2dOptions): void;
  tap(slot: StageSlot): void;
  dispose(): void;
}

export async function createStageLive2dController(
  host: HTMLElement,
): Promise<StageLive2dController> {
  // pld 的 cubism4 入口在模块求值时就读取全局 Live2DCubismCore，必须先注入再动态加载
  await loadCubismCore();
  const { Live2DModel } = await import('pixi-live2d-display/cubism4');
  const ModelCtor = Live2DModel as unknown as PldModelConstructor;

  const app = new PIXI.Application({
    width: host.clientWidth || 1280,
    height: host.clientHeight || 800,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    clearBeforeRender: true,
  });
  const view = app.view as HTMLCanvasElement;
  view.style.width = '100%';
  view.style.height = '100%';
  view.style.display = 'block';
  view.style.touchAction = 'none';
  host.appendChild(view);
  app.stage.sortableChildren = true;

  const entries = new Map<StageSlot, Entry>();
  let disposed = false;
  let options: StageLive2dOptions = { powerMode: 'live', focus: null };

  function destroyEntry(entry: Entry): void {
    entry.token += 1;
    entry.loading = false;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    entry.idleTimer = null;
    try {
      entry.model?.destroy();
    } catch {
      /* best-effort */
    }
    entry.model = null;
    entry.appliedAutoUpdate = null;
  }

  function applyLayout(entry: Entry): void {
    const model = entry.model;
    const actor = entry.actor;
    if (!model || !actor) return;
    const stageW = host.clientWidth || app.renderer.width;
    const stageH = host.clientHeight || app.renderer.height;
    if (!stageW || !stageH) return;
    const boxH = (actor.layout.heightVh / 100) * stageH;
    const boxW = (actor.layout.widthVh / 100) * stageH;
    const fit = Math.min(
      boxW / model.internalModel.originalWidth,
      boxH / model.internalModel.originalHeight,
    );
    model.scale.set(fit * 0.92);
    model.x = (actor.layout.leftPct / 100) * stageW;
    model.y = (actor.layout.topPct / 100) * stageH + boxH / 2 + 4;
    model.zIndex = actor.layout.zIndex;
    // 只能差量写入：pld 的 setter 每次赋 true 都会再注册一次 ticker（拖动即失速）
    entry.appliedAutoUpdate = syncAutoUpdate(
      model,
      entry.appliedAutoUpdate,
      desiredAutoUpdate(options.powerMode, options.focus, entry.slot),
    );
  }

  function applyExpression(entry: Entry): void {
    const model = entry.model;
    const actor = entry.actor;
    if (!model || !actor || entry.lastExpression === actor.expression) return;
    entry.lastExpression = actor.expression;
    const name =
      entry.spec.expressions[actor.expression] ?? entry.spec.expressions[DEFAULT_EXPRESSION];
    if (name) void model.expression(name);
  }

  function scheduleIdle(entry: Entry): void {
    if (disposed) return;
    // 单链守卫：已有待机定时器时不再叠加，否则动作回调会指数级堆积（表现为动画失速）
    if (entry.idleTimer) return;
    const delay = IDLE_INTERVAL_MIN + Math.random() * (IDLE_INTERVAL_MAX - IDLE_INTERVAL_MIN);
    entry.idleTimer = setTimeout(() => {
      entry.idleTimer = null;
      const model = entry.model;
      if (!model || disposed) return;
      const quiet = performance.now() - entry.lastSpeechAt > IDLE_QUIET_MS;
      if (model.autoUpdate && quiet) {
        void model.motion(entry.spec.idleGroup).then(() => scheduleIdle(entry));
      } else {
        scheduleIdle(entry);
      }
    }, delay);
  }

  async function load(entry: Entry): Promise<void> {
    // 每次加载占用新的代次并置加载标记：拖拽期间 update 高频触发也只会有一次在途加载
    const token = ++entry.token;
    entry.loading = true;
    try {
      const model = await ModelCtor.from(entry.spec.url, { autoInteract: false });
      if (disposed || entry.token !== token) {
        model.destroy();
        return;
      }
      entry.model?.destroy();
      entry.model = model;
      entry.appliedAutoUpdate = null;
      model.anchor.set(0.5, 1);
      app.stage.addChild(model as unknown as PIXI.DisplayObject);
      const name = entry.spec.expressions[DEFAULT_EXPRESSION];
      if (name) await model.expression(name);
      entry.lastExpression = DEFAULT_EXPRESSION;
      applyLayout(entry);
      applyExpression(entry);
      scheduleIdle(entry);
    } catch {
      /* 单个模型加载失败不拖垮其他角色；错误由控制台诊断 */
    } finally {
      if (entry.token === token) entry.loading = false;
    }
  }

  function ensureEntry(actor: StageLive2dActor): Entry {
    let entry = entries.get(actor.slot);
    if (!entry) {
      entry = {
        slot: actor.slot,
        modelId: actor.modelId,
        spec: getAvatarModel(actor.modelId),
        model: null,
        micro: new Live2dMicrodynamics(),
        idleTimer: null,
        loading: false,
        token: 0,
        actor,
        lastSpeechAt: 0,
        lastExpression: null,
        appliedAutoUpdate: null,
      };
      entries.set(actor.slot, entry);
    }
    if (entry.modelId !== actor.modelId) {
      destroyEntry(entry);
      entry.modelId = actor.modelId;
      entry.spec = getAvatarModel(actor.modelId);
      entry.lastExpression = null;
    }
    entry.actor = actor;
    if (!entry.model && !entry.loading) void load(entry);
    applyLayout(entry);
    applyExpression(entry);
    return entry;
  }

  app.ticker.add(() => {
    for (const entry of entries.values()) {
      const model = entry.model;
      const actor = entry.actor;
      if (!model || !actor || !model.autoUpdate) continue;
      const level = actor.getLevel();
      const value = level > 0.01 ? Math.min(1, level * LIP_GAIN) : 0;
      model.internalModel.coreModel.setParameterValueById(entry.spec.lipParam, value);
      if (level > 0.02) entry.lastSpeechAt = performance.now();
      entry.micro.update(
        model.internalModel.coreModel,
        performance.now() - entry.lastSpeechAt > IDLE_QUIET_MS,
      );
    }
  });

  const onPointerMove = (event: PointerEvent) => {
    const rect = host.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const ny = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    for (const entry of entries.values()) entry.micro.setPointer(nx, ny);
  };
  window.addEventListener('pointermove', onPointerMove);

  const resizeObserver = new ResizeObserver(() => {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width && height) app.renderer.resize(width, height);
    for (const entry of entries.values()) applyLayout(entry);
  });
  resizeObserver.observe(host);

  return {
    update(actors, next) {
      options = next;
      const keep = new Set(actors.map((actor) => actor.slot));
      for (const [slot, entry] of entries) {
        if (keep.has(slot)) continue;
        destroyEntry(entry);
        entries.delete(slot);
      }
      for (const actor of actors) ensureEntry(actor);
    },

    tap(slot) {
      const entry = entries.get(slot);
      if (entry?.model) void entry.model.motion(entry.spec.tapGroup);
    },

    dispose() {
      disposed = true;
      window.removeEventListener('pointermove', onPointerMove);
      resizeObserver.disconnect();
      for (const entry of entries.values()) destroyEntry(entry);
      entries.clear();
      app.destroy(false, { children: true });
    },
  };
}
