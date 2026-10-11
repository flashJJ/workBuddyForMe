/** 任务 Agent 域：循环护栏 */

/**
 * v0.7 M3 任务 Agent 循环护栏：
 * - TASK_MAX_STEPS 单任务步数上限（防失控死循环）；
 * - TASK_MAX_FAILURES 连续失败步数上限（与熔断阈值对齐，触顶自动终止）。
 */
export const TASK_MAX_STEPS = 20;
export const TASK_MAX_FAILURES = 3;

/**
 * v1.4 热修：授权知识库后「零检索即收尾」的强制纠正次数上限。
 * 弱模型会无视提示词硬规则直接 fail/done，由 task-loop 确定性拦截并注入纠正；
 * 超过此次数仍坚持收尾则尊重模型终态（避免死循环）。
 */
export const MANDATORY_RETRIEVAL_GRACE = 2;
