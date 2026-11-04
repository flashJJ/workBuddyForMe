'use client';

import * as React from 'react';
import type { AppSettings, BranchLimitSettings } from '@wbfm/shared/types';
import { BRANCH_LIMITS, BRANCH_LIMIT_RANGES } from '@wbfm/shared/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useSettings, useUpdateSettings } from '@/lib/hooks/provider';

type LimitKey = 'branchMaxConcurrent' | 'branchMaxDepth' | 'branchMaxChildren' | 'branchTokenBudget';

type LimitLabelKey =
  | 'branch.limits.maxConcurrent'
  | 'branch.limits.maxDepth'
  | 'branch.limits.maxChildren'
  | 'branch.limits.tokenBudget';

const FIELDS: Array<{ key: LimitKey; labelKey: LimitLabelKey; range: { min: number; max: number } }> = [
  { key: 'branchMaxConcurrent', labelKey: 'branch.limits.maxConcurrent', range: BRANCH_LIMIT_RANGES.maxConcurrent },
  { key: 'branchMaxDepth', labelKey: 'branch.limits.maxDepth', range: BRANCH_LIMIT_RANGES.maxDepth },
  { key: 'branchMaxChildren', labelKey: 'branch.limits.maxChildren', range: BRANCH_LIMIT_RANGES.maxChildren },
  { key: 'branchTokenBudget', labelKey: 'branch.limits.tokenBudget', range: BRANCH_LIMIT_RANGES.maxTreeTokens },
];

const DEFAULTS: Record<LimitKey, number> = {
  branchMaxConcurrent: BRANCH_LIMITS.maxConcurrent,
  branchMaxDepth: BRANCH_LIMITS.maxDepth,
  branchMaxChildren: BRANCH_LIMITS.maxChildren,
  branchTokenBudget: BRANCH_LIMITS.maxTreeTokens,
};

/** v2.21 M3：设置页高级区——分支四项上限；恢复默认走同一 PUT /api/settings */
export function BranchLimitsPanel() {
  const { t } = useI18n();
  const { data: settings } = useSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = React.useState<Record<LimitKey, number>>(DEFAULTS);

  React.useEffect(() => {
    const saved = settings as (AppSettings & BranchLimitSettings) | undefined;
    if (!saved) return;
    setDraft({
      branchMaxConcurrent: saved.branchMaxConcurrent ?? DEFAULTS.branchMaxConcurrent,
      branchMaxDepth: saved.branchMaxDepth ?? DEFAULTS.branchMaxDepth,
      branchMaxChildren: saved.branchMaxChildren ?? DEFAULTS.branchMaxChildren,
      branchTokenBudget: saved.branchTokenBudget ?? DEFAULTS.branchTokenBudget,
    });
  }, [settings]);

  const save = (values: Record<LimitKey, number>): void => {
    update.mutate(values);
  };

  return (
    <section className="space-y-3 rounded-lg border p-3" data-testid="branch-limits-panel">
      <div>
        <h3 className="text-sm font-medium">{t('branch.limits.title')}</h3>
        <p className="text-xs text-muted-foreground">{t('branch.limits.description')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="block space-y-1">
            <span className="text-xs text-muted-foreground">{t(field.labelKey)}</span>
            <Input
              type="number"
              min={field.range.min}
              max={field.range.max}
              value={draft[field.key]}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, [field.key]: Number(event.target.value) }))
              }
              data-testid={`branch-limit-${field.key}`}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" disabled={update.isPending} onClick={() => save(draft)}>
          {t('common.actions.save')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => save(DEFAULTS)}>
          {t('branch.limits.reset')}
        </Button>
        {update.isSuccess && <span className="text-xs text-success">{t('branch.limits.saved')}</span>}
        {update.isError && <span className="text-xs text-destructive">{t('branch.limits.saveFailed')}</span>}
      </div>
    </section>
  );
}
