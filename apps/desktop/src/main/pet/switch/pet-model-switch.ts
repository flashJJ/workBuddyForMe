import { MODEL_CHANGE_TIMEOUT_MS } from '../pet-constants';
import type { PetManagerDeps, PetWindowLike } from '../pet-types';

interface PendingModel {
  modelId: string;
  timer: ReturnType<typeof setTimeout>;
  resolve(ok: boolean): void;
}

/**
 * 同窗口换模型协调器（v3.0 P4）：通知渲染层热替换并等待回执。
 * 超时/发送失败交给 fallback（重建窗口）；连续切换时旧请求作废，不触发旧回退。
 */
export class PetModelSwitcher {
  private pending: PendingModel | null = null;
  private seq = 0;

  constructor(private readonly deps: Pick<PetManagerDeps, 'setTimeout' | 'clearTimeout'>) {}

  /** true = 渲染层已回执；false = 已回退或已被更新的切换请求接管 */
  async request(
    win: PetWindowLike,
    modelId: string,
    send: (win: PetWindowLike, modelId: string) => void,
    fallback: (win: PetWindowLike, modelId: string) => boolean,
  ): Promise<boolean> {
    const seq = ++this.seq;
    if (await this.wait(win, modelId, send)) return true;
    if (seq !== this.seq) return false;
    return fallback(win, modelId);
  }

  /** 渲染层回执（IPC 已校验发送方）：命中当前等待才结束 */
  confirm(modelId: string): boolean {
    if (this.pending?.modelId !== modelId) return false;
    this.settle(true);
    return true;
  }

  /** 关窗/退出：取消等待，避免超时后重建已关闭的窗口 */
  cancel(): void {
    this.settle(false);
  }

  private wait(
    win: PetWindowLike,
    modelId: string,
    send: (win: PetWindowLike, modelId: string) => void,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.settle(false); // 连续切换：上一次等待直接作废
      const timer = (this.deps.setTimeout ?? setTimeout)(
        () => this.settle(false),
        MODEL_CHANGE_TIMEOUT_MS,
      );
      this.pending = { modelId, timer, resolve };
      try {
        send(win, modelId);
      } catch {
        this.settle(false);
      }
    });
  }

  private settle(ok: boolean): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    (this.deps.clearTimeout ?? clearTimeout)(pending.timer);
    pending.resolve(ok);
  }
}
