import { ApiError } from '@wbfm/shared/errors';
import type { FlowGraph } from '@wbfm/shared/schemas';
import type { WorkflowRepository } from '@wbfm/database';
import { compileFlow } from '../compiler/compiler';

/** v5.0：运行载图/编译（从 run-service 拆出以控行数） */

export function compileGraph(graph: FlowGraph) {
  const result = compileFlow(graph);
  if (!result.compiled) {
    const detail = result.diagnostics.map((d) => `[${d.severity}] ${d.message}`).join('；');
    throw ApiError.validation(`工作流图校验未通过：${detail}`);
  }
  return result.compiled;
}

export function loadCompiledGraph(
  workflows: WorkflowRepository,
  workflowId: string,
  requirePublished: boolean,
) {
  const wf = workflows.getWorkflow(workflowId);
  if (!wf) throw ApiError.notFound('工作流不存在');
  // v2.14：有生产版本时，保存草稿不影响对外运行
  if (requirePublished && wf.publishedVersion === null && wf.status !== 'published') {
    throw ApiError.validation('工作流尚未发布');
  }
  const versionView = workflows.getProductionVersion(workflowId);
  if (!versionView) throw ApiError.validation('工作流还没有已保存的版本');
  return {
    version: versionView.version,
    graph: versionView.graph,
    compiled: compileGraph(versionView.graph),
  };
}
