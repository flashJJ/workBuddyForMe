'use client';

import type { ConversationBranch } from '@wbfm/shared/types';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/use-i18n';
import {
  BRANCH_STATUS_TONE,
  branchTotalTokens,
  isActiveBranch,
  statusLabelKey,
} from '../model/branch-status';

export interface BranchCardActions {
  onStart: (id: string) => void;
  onCancel: (id: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onRemove: (branch: ConversationBranch) => void;
  onOpenChild: (childConversationId: string) => void;
}

/** v2.21：单条分支卡：状态 / Token / 回传 evidence / 归档恢复取消删除 */
export function BranchCard({ branch, actions }: { branch: ConversationBranch; actions: BranchCardActions }) {
  const { t } = useI18n();
  const active = isActiveBranch(branch);
  const tokens = branchTotalTokens(branch) ?? (branch.reservedTokens > 0 ? branch.reservedTokens : null);
  const evidence = branch.evidence;

  return (
    <div className="rounded-md border p-2.5 text-xs space-y-1.5" data-testid={`branch-card-${branch.id}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium break-words">{branch.title}</p>
        <Badge variant={BRANCH_STATUS_TONE[branch.status]}>{t(statusLabelKey(branch.status))}</Badge>
      </div>
      <p className="text-muted-foreground line-clamp-2 break-words">{branch.goal}</p>
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
        <span>{branch.depth}</span>
        {tokens !== null && <span>{tokens} tokens</span>}
        {branch.archivedAt && <Badge variant="outline">{t('branch.list.archived')}</Badge>}
      </div>
      {branch.statusReason && <p className="text-destructive break-words">{branch.statusReason}</p>}

      {evidence && (
        <div className="rounded bg-muted/60 p-2 space-y-1" data-testid={`branch-evidence-${branch.id}`}>
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{t('branch.evidence.title')}</span>
            {evidence.needsReview && <Badge variant="warning">{t('branch.evidence.needsReview')}</Badge>}
            {evidence.artifacts.length > 0 && (
              <span className="text-muted-foreground">
                {t('branch.evidence.artifacts', { count: evidence.artifacts.length })}
              </span>
            )}
          </div>
          <p className="break-words">{evidence.summary || t('branch.evidence.noSummary')}</p>
          {evidence.artifacts.length > 0 && (
            <ul className="space-y-0.5 text-muted-foreground" data-testid={`branch-artifacts-${branch.id}`}>
              {evidence.artifacts.map((artifact) => (
                <li key={artifact.id} className="break-words">
                  {artifact.title} <span className="opacity-70">({artifact.kind})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {branch.status === 'queued' && <Action onClick={() => actions.onStart(branch.id)}>{t('branch.list.start')}</Action>}
        {(branch.status === 'queued' || active) && (
          <Action onClick={() => actions.onCancel(branch.id)}>{t('branch.list.cancel')}</Action>
        )}
        {branch.archivedAt ? (
          <Action onClick={() => actions.onRestore(branch.id)}>{t('branch.list.restore')}</Action>
        ) : (
          branch.status !== 'running' &&
          branch.status !== 'waiting' && (
            <Action onClick={() => actions.onArchive(branch.id)}>{t('branch.list.archive')}</Action>
          )
        )}
        <Action onClick={() => actions.onOpenChild(branch.childConversationId)}>
          {t('branch.list.openChild')}
        </Action>
        <Action danger onClick={() => actions.onRemove(branch)}>
          {t('branch.list.remove')}
        </Action>
      </div>
    </div>
  );
}

function Action({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={danger ? 'text-destructive hover:underline' : 'text-muted-foreground hover:text-foreground'}
    >
      {children}
    </button>
  );
}
