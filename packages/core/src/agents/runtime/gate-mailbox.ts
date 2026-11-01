import type { PermissionLevel } from '@wbfm/shared/types';

/**
 * v1.4 M4：Executor（task-loop）内 HITL 门控帧的跨 async 边界邮箱。
 * runner 在 await executor.run() 期间无法直接 yield，适配器把门控帧 post
 * 进邮箱，runner 用 takeOrDone 与执行 Promise 竞速，取到帧则 yield 给 SSE
 * 消费者，保证「帧先下发、用户再决策」的时序；执行结束/abort 返回 MAILBOX_DONE。
 */

export interface ExecutorGateFrame {
  callId: string;
  tool: string;
  permission: PermissionLevel;
  argsSummary: string;
  /** task-loop 内 task run id（remember=task 的授权作用域，客户端原样回传） */
  taskScope: string;
}

export const MAILBOX_DONE: unique symbol = Symbol('agent-gate-mailbox-done');
export type GateOrDone = ExecutorGateFrame | typeof MAILBOX_DONE;

export class GateMailbox {
  private queued: ExecutorGateFrame[] = [];
  private waiters: Array<(frame: ExecutorGateFrame | null) => void> = [];

  post(frame: ExecutorGateFrame): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter(frame);
    } else {
      this.queued.push(frame);
    }
  }

  /** 等待信号：abort 解析 null（不消费队列帧） */
  private async waitNext(signal?: AbortSignal): Promise<ExecutorGateFrame | null> {
    if (signal?.aborted) return null;
    return await new Promise<ExecutorGateFrame | null>((resolve) => {
      const receiver = (frame: ExecutorGateFrame | null) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(frame);
      };
      const onAbort = () => {
        this.waiters = this.waiters.filter((w) => w !== receiver);
        receiver(null);
      };
      this.waiters.push(receiver);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  /** 取一帧；无帧时等待。done 先定型（成功/失败均算）或 signal abort 时返回 MAILBOX_DONE */
  takeOrDone(done: Promise<unknown>, signal?: AbortSignal): Promise<GateOrDone> {
    const queued = this.queued.shift();
    if (queued) return Promise.resolve(queued);
    const fromDone: Promise<GateOrDone> = done.then(() => MAILBOX_DONE);
    const fromGate: Promise<GateOrDone> = this.waitNext(signal).then(
      (frame) => frame ?? MAILBOX_DONE,
    );
    return Promise.race([fromDone, fromGate]);
  }
}
