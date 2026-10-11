import type { SseEvent } from '@wbfm/shared/api';
import type { TaskRunView } from '@wbfm/shared/schemas';
import type { OrchestratorEvent } from '../chat/types';
import type { ServiceDeps } from '../services/deps';
import type { ToolRuntime } from '../tools/tool-runtime';
import type { ToolContext } from '../tools/types';
import type { TaskPlanner } from './types';

/** 循环对外事件：task 时间线事件（wire 真源派生）+ 门控/工具事件（透传 SSE） */
export type TaskLoopEvent = SseEvent<'task'> | OrchestratorEvent;

export type TaskControlState = 'running' | 'paused' | 'stopped';

/**
 * 任务运行控制句柄：暂停/继续/终止。
 * 纯内存实现（单实例本地应用）；web 层按 runId 登记，急停热键经控制通道触发 stop。
 */
export interface TaskLoopControl {
  readonly state: TaskControlState;
  pause(): void;
  resume(): void;
  stop(): void;
  /** paused 时挂起直至 resume/stop；其余状态立即返回 */
  waitIfPaused(): Promise<void>;
}

export function createTaskLoopControl(): TaskLoopControl {
  let state: TaskControlState = 'running';
  let waiters: Array<() => void> = [];
  const release = () => {
    const pending = waiters;
    waiters = [];
    for (const wake of pending) wake();
  };
  return {
    get state() {
      return state;
    },
    pause() {
      if (state === 'running') state = 'paused';
    },
    resume() {
      if (state === 'paused') {
        state = 'running';
        release();
      }
    },
    stop() {
      state = 'stopped';
      release();
    },
    waitIfPaused() {
      if (state !== 'paused') return Promise.resolve();
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
      });
    },
  };
}

export interface TaskLoopParams {
  deps: ServiceDeps;
  runtime: ToolRuntime;
  planner: TaskPlanner;
  /** 已创建（queued）的运行记录；循环负责推进状态机 */
  run: TaskRunView;
  /** 本任务可用工具白名单（决策提示与执行双重校验） */
  allowedTools: string[];
  /** 模型是否具备视觉能力（观察步截图是否注入决策） */
  visionCapable: boolean;
  /** 急停信号（全局热键/客户端断开） */
  signal?: AbortSignal;
  control?: TaskLoopControl;
  /** 观察工具名（默认 screen_snapshot，测试可替换） */
  observeToolName?: string;
  /**
   * v1.4 M2：知识能力注入（修复 D2 硬编码空），v1.5 支持多库。
   * 缺省 knowledgeBaseIds=[]/retrieve=空——桌面任务服务原行为不变；
   * 协作 Executor 的 tool 模式注入生效知识库集合与 RAG 检索回调。
   */
  knowledgeBaseIds?: string[];
  retrieve?: ToolContext['retrieve'];
  /** v1.4 M2：观察模式（screen=截图循环；tool=无截图，观察内容=工具结果/检索片段） */
  observeMode?: 'screen' | 'tool';
  /**
   * v1.4 热修：协作子任务完整上下文（tool 模式注入决策提示词）。
   * 桌面直派任务缺省——goal 本身即完整指令。
   */
  subtaskBrief?: string;
  subtaskAcceptance?: string[];
  /** 已授权知识库名称（与 knowledgeBaseIds 对应，提示词展示用） */
  knowledgeBaseNames?: string[];
}
