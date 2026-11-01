'use client';


import type { RelationshipMilestoneRecord } from '@wbfm/shared/schemas';
import { apiGet } from '@/lib/api/client';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';

/**
 * v2.0 M2 助手共同里程碑查询：
 * GET 端会先懒评估（协作次数变化/自然日跨天即写达成），故 30s 轮询即可让
 * 面板与纪念演出在聊天页存活期间近实时刷新；切助手随 queryKey 重新拉取。
 */
export function useRelationshipMilestones(assistantId: string | null, enabled: boolean) {
  return useVisibleQuery({
    queryKey: ['relationship-milestones', assistantId],
    queryFn: () =>
      apiGet<RelationshipMilestoneRecord[]>(
        `/api/assistants/${assistantId}/relationship/milestones`,
      ),
    enabled: enabled && Boolean(assistantId),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** DB 里程碑 key（day_1）→ i18n 叶子键（day1） */
export function milestoneI18nKey(milestoneKey: string): string {
  return milestoneKey.replace('_', '');
}
