import {
  PET_WINDOW_HEIGHT,
  PET_WINDOW_WIDTH,
  type CursorPoint,
} from '../pet-window';
import { PetDragController, type PetDragWindow } from '../pet-drag-controller';
import { PetThrowController } from '../pet-throw-controller';
import { PetSitController, type PetSitWindow } from '../../pet-sit/pet-sit-controller';
import { readDisplayBounds, readWorkArea } from '../../pet-sit/display-info';
import type { PetManagerDeps } from '../pet-types';

export interface PetMotionOptions {
  deps: PetManagerDeps;
  getCursor(): CursorPoint;
  /** 拖拽/滑行/坐立稳定后回写位置（与具体控制器窗口类型无关，只依赖 getBounds） */
  persist(win: PetDragWindow | PetSitWindow): void;
  forceInteractive(): void;
}

export interface PetMotionControllers {
  drag: PetDragController;
  thrower: PetThrowController;
  sit: PetSitController;
}

/** 拖拽 / 抛掷 / 坐立装配：PetManager 只保留窗口生命周期与编排 */
export function createPetMotionControllers(opts: PetMotionOptions): PetMotionControllers {
  const { deps } = opts;
  // 桌宠窗固定尺寸（不可缩放）：拖拽/滑行一律回写规范尺寸，避免棘轮式变大
  const fixedSize = () => ({ width: PET_WINDOW_WIDTH, height: PET_WINDOW_HEIGHT });

  const thrower = new PetThrowController({
    setInterval: deps.setInterval, clearInterval: deps.clearInterval,
    getWorkArea: (bounds) => readWorkArea(deps, bounds),
    getFixedSize: fixedSize,
    onSettle: opts.persist,
    // 真机排查用（滑行/贴边的调用与坐标轨迹）
    log: (message) => process.stdout.write(`[pet-throw] ${message}\n`),
  });
  const sit = new PetSitController({
    getFixedSize: fixedSize,
    getWorkArea: (bounds) => readWorkArea(deps, bounds),
    getDisplayBounds: (bounds) => readDisplayBounds(deps, bounds),
    listWindows: deps.listWindows,
    setInterval: deps.setInterval, clearInterval: deps.clearInterval,
    onSettle: opts.persist,
    log: (message) => process.stdout.write(`[pet-sit] ${message}\n`),
  });
  const drag = new PetDragController({
    getCursor: opts.getCursor,
    getFixedSize: fixedSize,
    onDragStart: () => {
      thrower.stop();
      sit.beginDrag();
      process.stdout.write('[pet-drag] begin\n');
      opts.forceInteractive();
    },
    // 松手优先尝试坐窗口/任务栏；未命中才抛掷（位移过小视为误触）
    onDragEnd: (win, velocity, distance) => {
      const sitting = sit.trySit(win);
      process.stdout.write(
        `[pet-drag] end dist=${Math.round(distance)} v=${Math.round(velocity.x)},${Math.round(velocity.y)} sit=${sitting}\n`,
      );
      if (!sitting) thrower.start(win, velocity, distance);
    },
  });
  return { drag, thrower, sit };
}
