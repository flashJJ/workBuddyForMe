/** 目标/计划/任务/审批/审计/协作/会议/工作流相关路径（v4.13 从 endpoints.ts 拆出） */
export const workApi = {
  /** v2.11：启用中的能力包剧本（短语触发匹配） */
  eventScripts: '/api/event-scripts',
  /** v2.11：外部代理（本地 CLI） */
  subagentProviders: '/api/subagents/providers',
  subagentRuns: '/api/subagents/runs',
  subagentRunCancel: (id: string) => `/api/subagents/runs/${encodeURIComponent(id)}/cancel`,
  // v2.7 工作信号 / 审批中心
  workSignals: '/api/work-signals',
  approvals: '/api/approvals',
  approvalResolve: (id: string) => `/api/approvals/${encodeURIComponent(id)}/resolve`,
  // v2.13 M3 审计账本
  auditEvents: '/api/audit/events',
  auditVerify: '/api/audit/verify',
  auditExport: (format = 'jsonl') => `/api/audit/export?format=${format}`,
  /** v2.15：区间归档 ZIP 与外部锚点校验 */
  auditArchive: (from: string, to: string) =>
    `/api/audit/archive?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  auditAnchorVerify: '/api/audit/anchor/verify',
  // v2.8 目标 / 计划 / 待办
  goals: '/api/goals',
  goalsByConversation: (conversationId: string) =>
    `/api/goals?conversationId=${encodeURIComponent(conversationId)}`,
  goal: (id: string) => `/api/goals/${encodeURIComponent(id)}`,
  workPlans: '/api/work-plans',
  workPlansByConversation: (conversationId: string) =>
    `/api/work-plans?conversationId=${encodeURIComponent(conversationId)}`,
  workPlan: (id: string) => `/api/work-plans/${encodeURIComponent(id)}`,
  workPlanReview: (id: string) => `/api/work-plans/${encodeURIComponent(id)}/review`,
  workPlanStep: (id: string, stepId: string) =>
    `/api/work-plans/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}`,
  tasks: '/api/tasks',
  taskList: (conversationId: string) => `/api/tasks?conversationId=${conversationId}`,
  task: (id: string) => `/api/tasks/${id}`,
  taskEvents: (id: string) => `/api/tasks/${id}/events`,
  taskControl: (id: string) => `/api/tasks/${id}/control`,
  taskStopAll: '/api/tasks/stop-all',
  // v1.4 多智能体协作；v1.9 M2 observe=1 为舞台只读第二客户端
  agentRuns: '/api/agent/runs',
  agentRun: (id: string) => `/api/agent/runs/${id}`,
  agentRunEvents: (id: string, observe = false) =>
    `/api/agent/runs/${id}/events${observe ? '?observe=1' : ''}`,
  agentRunCancel: (id: string) => `/api/agent/runs/${id}/cancel`,
  agentRunPlan: (id: string) => `/api/agent/runs/${id}/plan`,
  agentRunResume: (id: string) => `/api/agent/runs/${id}/resume`,
  // v1.9 M3 多助手会议
  meetings: '/api/meetings',
  meeting: (id: string) => `/api/meetings/${id}`,
  meetingTurns: (id: string) => `/api/meetings/${id}/turns`,
  meetingMode: (id: string) => `/api/meetings/${id}/mode`,
  meetingFinish: (id: string) => `/api/meetings/${id}/finish`,
  meetingAbort: (id: string) => `/api/meetings/${id}/abort`,
  meetingEvents: (id: string) => `/api/meetings/${id}/events`,
  meetingConclusion: (id: string) => `/api/meetings/${id}/conclusion`,
  meetingActionItems: (id: string) => `/api/meetings/${id}/action-items`,
  meetingActionItem: (id: string, itemId: string) =>
    `/api/meetings/${id}/action-items/${itemId}`,
  meetingActionItemReminder: (id: string, itemId: string) =>
    `/api/meetings/${id}/action-items/${itemId}/to-reminder`,
  meetingActionItemRunFlow: (id: string, itemId: string) =>
    `/api/meetings/${id}/action-items/${itemId}/run-flow`,
  meetingExport: (id: string) => `/api/meetings/${id}/export`,
  // v0.8 Flow Studio
  flows: '/api/flows',
  flow: (id: string) => `/api/flows/${id}`,
  /** v2.4 P0-2：以内置工作流为模板复制草稿 */
  flowClone: (id: string) => `/api/flows/${id}/clone`,
  flowVersions: (id: string) => `/api/flows/${id}/versions`,
  /** v2.15：版本差异摘要 */
  flowVersionCompare: (id: string, from: number, to: number) =>
    `/api/flows/${id}/versions/compare?from=${from}&to=${to}`,
  flowValidate: (id: string) => `/api/flows/${id}/validate`,
  flowPublish: (id: string) => `/api/flows/${id}/publish`,
  /** v2.14：把历史版本设为生产（不改当前草稿） */
  flowProduction: (id: string) => `/api/flows/${id}/production`,
  flowRuns: (id: string) => `/api/flows/${id}/runs`,
  flowRun: (runId: string) => `/api/flows/runs/${runId}`,
  flowRunEvents: (runId: string) => `/api/flows/runs/${runId}/events`,
  flowRunHuman: (runId: string) => `/api/flows/runs/${runId}/human`,
  flowRunToolConfirm: (runId: string) => `/api/flows/runs/${runId}/tool-confirm`,
  flowRunControl: (runId: string) => `/api/flows/runs/${runId}/control`,
  // v0.9 对外服务端点（内部管理面）
  flowEndpoint: (id: string) => `/api/flows/${id}/endpoint`,
  flowEndpointRotate: (id: string) => `/api/flows/${id}/endpoint/rotate`,
  /** v4.26：一流程多定时（集合 / 单项 / 立即运行） */
  flowSchedules: (id: string) => `/api/flows/${id}/schedules`,
  flowSchedule: (id: string, scheduleId: string) => `/api/flows/${id}/schedules/${scheduleId}`,
  flowSchedulesRun: (id: string) => `/api/flows/${id}/schedules/run`,
  /** v4.25：事件触发器管理 */
  flowTriggers: (id: string) => `/api/flows/${id}/triggers`,
  flowTrigger: (id: string, triggerId: string) => `/api/flows/${id}/triggers/${triggerId}`,
  flowTriggerRotate: (id: string, triggerId: string) =>
    `/api/flows/${id}/triggers/${triggerId}/rotate`,
  // v0.9 M4 运行记录与重放
  flowRunsCenter: '/api/flow-runs',
  flowRunsReplayBatch: '/api/flow-runs/replay-batch',
  flowRunsHealth: '/api/flow-runs/health',
  flowRunsCleanup: '/api/flow-runs/cleanup',
  flowRunsRetention: '/api/flow-runs/retention',
  flowRunReplay: (runId: string) => `/api/flows/runs/${runId}/replay`,
} as const;
