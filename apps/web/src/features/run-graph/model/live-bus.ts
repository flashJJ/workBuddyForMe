/**
 * v2.20 M3：过程图实时帧总线（渲染进程模块单例）。
 *
 * 聊天 / 协作 / 会议已有自己的 SSE 消费方；这里只做「事件旁路」，
 * 由既有 hook 在收到帧后 publish，图面板 subscribe。不新开第二条 SSE。
 */
import type { RunGraphRootKind, RunGraphScope } from '@wbfm/shared/types';

export interface RunGraphLiveFrameInput {
  rootKind: RunGraphRootKind;
  rootId: string;
  scope: RunGraphScope;
  scopeId: string;
  type: string;
  payload: unknown;
  /** 事件业务时间；缺省取 publish 时刻 */
  at?: string;
}

export type RunGraphLiveFrame = Omit<RunGraphLiveFrameInput, 'at'> & {
  at: string;
  /** 客户端全局单调序号；只用于实时节点排序/错误节点身份，不与服务端 seq 比较 */
  seq: number;
  /** 收到时刻；图面板以快照 generatedAt 为历史基线过滤 */
  receivedAt: string;
};

type Listener = (frame: RunGraphLiveFrame) => void;

export class RunGraphLiveBus {
  private seq = 0;
  private readonly listeners = new Set<Listener>();

  publish(input: RunGraphLiveFrameInput): RunGraphLiveFrame {
    const now = new Date().toISOString();
    const frame: RunGraphLiveFrame = {
      ...input,
      at: input.at ?? now,
      receivedAt: now,
      seq: (this.seq += 1),
    };
    for (const listener of this.listeners) {
      try {
        listener(frame);
      } catch {
        /* 单个订阅异常不影响其他面板 */
      }
    }
    return frame;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** 测试用：清空订阅与序号 */
  reset(): void {
    this.listeners.clear();
    this.seq = 0;
  }
}

export const runGraphLiveBus = new RunGraphLiveBus();
