'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BranchBudget, ConversationBranch } from '@wbfm/shared/types';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

export interface BranchListResult {
  branches: ConversationBranch[];
  budget: BranchBudget;
}

export interface BranchCreatePayload {
  goal: string;
  title?: string;
  autoStart?: boolean;
}

/** v2.21：父会话分支列表 + 会话树预算；面板打开期间 5s 轮询收敛状态 */
export function useBranches(conversationId: string | null, includeArchived = true) {
  const query = useQuery<BranchListResult>({
    queryKey: QUERY_KEYS.branches(conversationId ?? ''),
    queryFn: () =>
      apiGet<BranchListResult>(
        `${API.conversationBranches(conversationId!)}?includeArchived=${includeArchived}`,
      ),
    enabled: Boolean(conversationId),
    refetchInterval: 5000,
    staleTime: 3000,
  });
  return {
    ...query,
    branches: query.data?.branches ?? [],
    budget: query.data?.budget ?? null,
  };
}

/** v2.21：子会话反查来源分支（无来源返回 null） */
export function useBranchByChild(childConversationId: string | null) {
  const query = useQuery<{ branch: ConversationBranch | null }>({
    queryKey: QUERY_KEYS.branchByChild(childConversationId ?? ''),
    queryFn: () => apiGet<{ branch: ConversationBranch | null }>(API.branchByChild(childConversationId!)),
    enabled: Boolean(childConversationId),
    staleTime: 60000,
  });
  return { ...query, branch: query.data?.branch ?? null };
}

/** v2.21：分支操作集合；成功后刷新列表并让会话列表带上新子会话 */
export function useBranchActions(conversationId: string) {
  const queryClient = useQueryClient();
  const invalidate = (): void => {
    void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.branches(conversationId) });
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const create = useMutation({
    mutationFn: (input: BranchCreatePayload) =>
      apiPost<{ branch: ConversationBranch; childConversationId: string }>(
        API.conversationBranches(conversationId),
        input,
      ),
    onSuccess: invalidate,
  });
  const start = useMutation({
    mutationFn: (branchId: string) => apiPost<{ branch: ConversationBranch }>(API.branchStart(branchId)),
    onSuccess: invalidate,
  });
  const rename = useMutation({
    mutationFn: ({ branchId, title }: { branchId: string; title: string }) =>
      apiPatch<{ branch: ConversationBranch }>(API.branch(branchId), { title }),
    onSuccess: invalidate,
  });
  const cancel = useMutation({
    mutationFn: (branchId: string) => apiPost<{ branch: ConversationBranch }>(API.branchCancel(branchId)),
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: (branchId: string) => apiPost<{ branch: ConversationBranch }>(API.branchArchive(branchId)),
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: (branchId: string) => apiPost<{ branch: ConversationBranch }>(API.branchRestore(branchId)),
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: (branchId: string) =>
      apiPost<{ branch: ConversationBranch; childConversationId: string }>(
        API.branchRetry(branchId),
      ),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (branchId: string) => apiDelete<{ id: string }>(API.branch(branchId)),
    onSuccess: invalidate,
  });

  return { create, start, rename, retry, cancel, archive, restore, remove, invalidate };
}
