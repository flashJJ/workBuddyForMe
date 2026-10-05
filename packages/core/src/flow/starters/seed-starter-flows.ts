import type { WorkflowRepository } from '@wbfm/database';
import { compileFlow } from '../compiler';
import { STARTER_FLOWS } from './starters';

/**
 * 启动幂等播种内置 starter flows（对齐 builtin skills 的只增不改策略）：
 * - 固定 id 已存在则跳过（仅启动时播种一次，进程内删除不会立即复活；重启会重新播种，与 builtin skills 策略一致）；
 * - 播种即保存图为 v1 并发布，使其立即以 flow:<id> 工具出现在对话中；
 * - 已存在的模板改名/改图/停用均不覆盖（仅行缺失时插入）。
 * 返回本次新播种的流程数。
 */
export function ensureStarterFlows(repo: WorkflowRepository): number {
  let seeded = 0;
  for (const starter of STARTER_FLOWS) {
    if (repo.getWorkflow(starter.id)) continue;
    // 防御：模板图必须可编译（编译失败不播种，避免污染工具目录）
    const result = compileFlow(starter.graph);
    if (!result.ok) {
      console.error(
        `[flow] starter「${starter.name}」图校验失败，跳过播种：`,
        result.diagnostics.map((d) => d.message).join('；'),
      );
      continue;
    }
    repo.createWorkflow({
      id: starter.id,
      name: starter.name,
      description: starter.description,
      icon: starter.icon,
      color: starter.color,
    });
    repo.addVersion(starter.id, starter.graph);
    repo.publishVersion(starter.id);
    seeded += 1;
  }
  return seeded;
}
