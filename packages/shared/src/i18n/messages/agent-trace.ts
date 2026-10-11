/**
 * agentTrace 命名空间：协作/任务链路中「系统生成」的轨迹文案。
 * 与 agents（UI 固定标签）区分：这些文本由 core 生成并持久化，
 * 以 system-message 线格式存 key（语言中立），渲染端按当前语言解码；
 * 模型自由产出（summary/reviewNotes/失败理由）不进此域。
 */

export const zhAgentTrace = {
  fallback: {
    degradedTitle: '[降级派单] {goal}',
    degradedBadge: '[降级派单]',
    plannerBrief: '规划器未能产出结构化子任务单，请执行者直接围绕用户目标尽力完成。',
    unparsedGoal: '未解析的用户目标',
    acceptance: '围绕用户目标给出可交付结论，并在未竟事项中说明无法确认的部分',
    autoApproved: '审查器连续两次未产出合法裁决，系统自动通过（未经独立审查）',
  },
  budget: {
    kind: {
      rounds: '轮次',
      steps: '步数',
      tokens: 'token 用量',
    },
    exceeded: '预算触顶（{kind}）',
    note: '[预算触顶] {kind}达上限，后续轮次未执行',
  },
  run: {
    rejected: '审查裁决终止任务',
    cancelled: '用户取消',
    notFound: '协作运行不存在：{id}',
  },
  terminal: {
    interrupted: '执行被中断（用户急停/连接断开），未完成',
    maxSteps: '执行达步数上限被终止，未完成',
    breaker: '执行以失败终态结束（目标工具已熔断）',
    maxFailures: '执行以失败终态结束（连续失败达上限）',
    maxFailuresCause: '执行以失败终态结束（连续失败达上限，末次原因：{cause}）',
    modelGaveUp:
      '执行以失败终态结束（模型主动宣告无法完成；若不应放弃请检查子任务上下文与工具授权）',
    noConclusion: '执行未产出有效结论（无终态文本与成功工具动作，详见未竟事项）',
    visionRequired: '屏幕（screen）观察模式要求视觉模型，当前 executor 模型不具备视觉能力',
  },
  step: {
    toolObserve: '工具模式观察',
    screenObserve: '观察当前屏幕状态',
    retrievalCorrection: '强制纠正：授权知识库未检索即收尾',
    modelDecision: '模型决策',
    decideFailed: '决策失败：{message}',
    toolNotAllowed: '工具不可用或不在任务白名单：{tool}',
    breakerTripped: '工具 {tool} 已熔断，任务终止',
    denied: '用户拒绝授权',
    observeFailed: '观察失败：屏幕感知不可用',
  },
};
