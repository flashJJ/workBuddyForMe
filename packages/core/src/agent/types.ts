import type { TaskStepView } from '@wbfm/shared/schemas';

/**
 * v0.7 M3 任务 Agent 循环类型契约：
 * planner（决策器）由调用方注入——生产环境为 LLM planner（llm-planner.ts），
 * 测试注入 mock，循环本体（task-loop.ts）不依赖具体模型。
 */

/** 一次「观察」的结果（屏幕感知） */
export interface TaskObservation {
  /** 观察文本摘要（截图元数据 / 降级说明），注入决策上下文 */
  summary: string;
  /** 截图附件 id（落库 screenshot_path；无截图时空串） */
  screenshotPath: string;
  /** 视觉轮截图 base64（注入 planner 图片消息；无视觉能力时缺省） */
  imageBase64?: string;
  mimeType?: string;
}

/** planner 决策输出协议（与 LLM planner 的 JSON 协议一一对应） */
export interface TaskPlanDecision {
  /** tool=执行工具；done=宣告完成；fail=宣告无法完成 */
  action: 'tool' | 'done' | 'fail';
  /** action=tool 时必填 */
  tool?: string;
  args?: Record<string, unknown>;
  /** 决策理由（落库 + 前端时间线展示） */
  reason: string;
  /** done/fail 时给用户的总结 */
  message?: string;
}

export interface TaskPlannerInput {
  goal: string;
  /** 已落库步骤（含观察摘要与动作结果），供模型回顾轨迹 */
  steps: TaskStepView[];
  /** 最近一次观察（首次循环失败时可能为 null） */
  observation: TaskObservation | null;
  /** 本任务可用工具白名单 */
  allowedTools: string[];
}

export interface TaskPlanner {
  decide(input: TaskPlannerInput, signal?: AbortSignal): Promise<TaskPlanDecision>;
}
