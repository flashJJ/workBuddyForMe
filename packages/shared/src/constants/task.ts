/** 任务 Agent 域：循环护栏 */

/**
 * v0.7 M3 任务 Agent 循环护栏：
 * - TASK_MAX_STEPS 单任务步数上限（防失控死循环）；
 * - TASK_MAX_FAILURES 连续失败步数上限（与熔断阈值对齐，触顶自动终止）。
 */
export const TASK_MAX_STEPS = 20;
export const TASK_MAX_FAILURES = 3;
