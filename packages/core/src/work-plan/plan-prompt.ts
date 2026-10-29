import type {
  ConversationGoalView,
  WorkPlanView,
} from '@wbfm/shared/schemas';

/**
 * v2.8：把会话目标 / 计划 / 待办折叠成一段 system 提示（上限 1 计划 / 10 步）。
 * 未批准计划明确标注「待评审，勿执行高风险步骤」；无内容返回空串。
 */
export function buildPlanPromptBlock(ctx: {
  goal: ConversationGoalView | null;
  plan: WorkPlanView | null;
  todo: WorkPlanView | null;
}): string {
  const lines: string[] = [];
  if (ctx.goal) {
    const criteria = ctx.goal.successCriteria ? `（成功标准：${ctx.goal.successCriteria}）` : '';
    lines.push(`当前目标：${ctx.goal.title}${criteria}`);
  }
  if (ctx.plan) {
    const reviewable = ctx.plan.status === 'draft' || ctx.plan.status === 'pending_review';
    lines.push(
      `当前计划《${ctx.plan.title}》状态：${planStatusLabel(ctx.plan.status)}${reviewable ? '（待评审，勿执行高风险步骤）' : ''}`,
    );
    const steps = ctx.plan.steps.slice(0, 10);
    steps.forEach((step) => {
      lines.push(`- [${stepStatusLabel(step.status)}] ${step.title}`);
    });
    if (ctx.plan.steps.length > steps.length) {
      lines.push(`- …共 ${ctx.plan.steps.length} 步`);
    }
  }
  if (ctx.todo) {
    const done = ctx.todo.steps.filter((step) => step.status === 'done' || step.status === 'skipped')
      .length;
    lines.push(`待办进度：${done}/${ctx.todo.steps.length}`);
    for (const step of ctx.todo.steps.slice(0, 10)) {
      lines.push(`- [${stepStatusLabel(step.status)}] ${step.title}`);
    }
  }
  if (lines.length === 0) return '';
  return ['【当前工作上下文】', ...lines, '需要更新待办时调用 todo_write，保持清单与真实进度一致。'].join(
    '\n',
  );
}

function planStatusLabel(status: WorkPlanView['status']): string {
  const labels: Record<WorkPlanView['status'], string> = {
    draft: '草稿',
    pending_review: '待评审',
    approved: '已批准',
    running: '执行中',
    done: '已完成',
    rejected: '已驳回',
    abandoned: '已放弃',
  };
  return labels[status];
}

function stepStatusLabel(status: WorkPlanView['steps'][number]['status']): string {
  const labels: Record<WorkPlanView['steps'][number]['status'], string> = {
    pending: '待办',
    running: '进行中',
    done: '完成',
    skipped: '跳过',
    blocked: '受阻',
  };
  return labels[status];
}
