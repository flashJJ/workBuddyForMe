import { z } from 'zod';

/**
 * v0.6 M2：HITL 工具确认 API 契约。
 * orchestrator 挂起未授权的 write/danger 工具调用后，前端通过
 * POST /api/tools/confirm 提交用户决策（超时/中断服务端自动 deny）。
 */
export const toolConfirmSchema = z
  .object({
    callId: z.string().trim().min(1).max(128),
    tool: z.string().trim().min(1).max(200),
    action: z.enum(['allow', 'deny']),
    /**
     * 授权记忆范围：assistant=仅当前助手（落库），all=全局（落库），
     * task=本任务内（v0.7，仅内存，任务/会话结束即失效）；缺省仅本次生效
     */
    remember: z.enum(['assistant', 'all', 'task']).optional(),
    /** remember='assistant' 时必填 */
    assistantId: z.string().trim().min(1).max(64).optional(),
    /** remember='task' 时必填：任务作用域标识（对话 id / 任务运行 id） */
    taskScope: z.string().trim().min(1).max(128).optional(),
  })
  .refine((v) => v.remember !== 'assistant' || Boolean(v.assistantId), {
    message: 'remember=assistant 时必须提供 assistantId',
    path: ['assistantId'],
  })
  .refine((v) => v.remember !== 'task' || Boolean(v.taskScope), {
    message: 'remember=task 时必须提供 taskScope',
    path: ['taskScope'],
  });
export type ToolConfirmInput = z.infer<typeof toolConfirmSchema>;

/**
 * v0.6 M4：工具调试执行 API 契约。
 * 设置页调试台 POST /api/tools/debug 提交选定的工具名与参数 JSON，
 * 服务端不经模型/熔断/HITL 直接试跑并返回结构化结果。
 */
export const toolDebugExecuteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** 参数 JSON 字符串：解析失败由服务端归一为参数错误，不阻断响应 */
  args: z.unknown(),
});
export type ToolDebugExecuteInput = z.infer<typeof toolDebugExecuteSchema>;
