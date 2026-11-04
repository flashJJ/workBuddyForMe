/**
 * v2.21：分支四项上限的读取口。
 * 设置项缺省回落 BRANCH_LIMITS；非法值也整体回落默认，避免半套上限。
 */
import type { BranchLimits } from '@wbfm/shared/types';
import { BRANCH_LIMITS } from '@wbfm/shared/types';
import { branchLimitsSchema } from '@wbfm/shared/schemas';
import { createSettingsRepository, type DatabaseInstance } from '@wbfm/database';

const SETTINGS_KEY = 'app-settings';

export function readBranchLimits(db: DatabaseInstance): BranchLimits {
  const raw = createSettingsRepository(db).getJson<Record<string, unknown>>(SETTINGS_KEY, {});
  const parsed = branchLimitsSchema.safeParse({
    maxConcurrent: raw.branchMaxConcurrent ?? BRANCH_LIMITS.maxConcurrent,
    maxDepth: raw.branchMaxDepth ?? BRANCH_LIMITS.maxDepth,
    maxChildren: raw.branchMaxChildren ?? BRANCH_LIMITS.maxChildren,
    maxTreeTokens: raw.branchTokenBudget ?? BRANCH_LIMITS.maxTreeTokens,
  });
  return parsed.success ? parsed.data : BRANCH_LIMITS;
}
