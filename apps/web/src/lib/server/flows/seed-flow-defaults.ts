import {
  createEventUsageRepository,
  createKnowledgeRepository,
  createWorkflowRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { ensureStarterKnowledgeBases } from '@wbfm/core';
import { ensureStarterFlows } from '@wbfm/core/flow';

/** v5.0：启动播种与轻量清理（从 container 拆出以控行数） */
export function seedFlowDefaults(
  db: DatabaseInstance,
  workflows: ReturnType<typeof createWorkflowRepository>,
): void {
  const starterCount = ensureStarterFlows(workflows);
  if (starterCount > 0) console.info(`[flow] 已播种 ${starterCount} 个内置工作流模板`);
  const kbStarterCount = ensureStarterKnowledgeBases(createKnowledgeRepository(db));
  if (kbStarterCount > 0) console.info(`[knowledge] 已播种 ${kbStarterCount} 个内置知识库模板`);
  try {
    const purged = createEventUsageRepository(db).purgeBefore(Date.now() - 90 * 24 * 3600_000);
    if (purged > 0) console.info(`[event] 已清理 ${purged} 条过期演出流水`);
  } catch (error) {
    console.warn('[event] 演出流水清理失败', error);
  }
}
