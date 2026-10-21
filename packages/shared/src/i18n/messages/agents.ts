/** agents 命名空间：v1.4 多智能体协作（任务模式入口/泳道时间线/预算条/终态/任务中心/HITL） */

export const zhAgents = {
  entry: {
    label: '任务模式',
    on: '任务模式：开',
    off: '任务模式：关',
    hint: '开启后由 Planner/Executor/Reviewer 三角色分工完成；仅当前会话有效，不跨会话保留',
  },
  role: {
    planner: '规划',
    executor: '执行',
    reviewer: '审查',
  },
  phase: {
    planning: '规划中',
    executing: '执行中',
    reviewing: '审查中',
  },
  round: {
    label: '第 {round} 轮',
    reworkBadge: '返工',
  },
  budget: {
    label: '预算',
    rounds: '轮次 {used}/{max}',
    steps: '步数 {used}/{max}',
    tokens: 'token {used}/{max}',
    over: '已超上限',
  },
  planning: {
    title: '规划卡 · 子任务',
    brief: '任务说明',
    acceptance: '验收标准',
  },
  execution: {
    title: '执行卡 · 交付',
    tools: '调用工具',
    evidence: '证据',
    none: '本轮无工具调用与证据',
    unfinished: '未完成项',
  },
  review: {
    title: '审查卡 · 裁决',
    approve: '通过',
    revise: '返工',
    reject: '驳回',
    passed: '达标',
    failed: '未达标',
    notes: '审查意见',
    awaiting: '等待审查…',
  },
  terminal: {
    done: '协作完成',
    budgetExceeded: '预算触顶，已交付当前最佳结果（未竟项见执行卡）',
    failed: '协作失败终止',
    cancelled: '协作已取消',
  },
  confirm: {
    origin: '协作任务 · Executor 发起',
    waiting: '等待工具授权，授权后协作继续',
  },
  errors: {
    streamConnectFailed: '协作事件流连接失败',
    networkInterrupted: '网络连接中断',
  },
  tasks: {
    title: '协作任务',
    description: 'Planner/Executor/Reviewer 三角色协作运行记录',
    empty: '暂无协作任务',
    filterAll: '全部状态',
    detailTitle: '交接明细',
    goal: '目标',
    runId: '运行 ID：',
    conversation: '所属会话：',
    loading: '加载协作任务…',
    loadFailed: '加载失败',
    cancel: '急停',
    cancelling: '急停中…',
  },
};
