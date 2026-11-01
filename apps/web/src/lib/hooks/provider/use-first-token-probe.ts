'use client';

import { useMutation } from '@tanstack/react-query';
import { apiPost } from '@/lib/api/client';
import { API } from '@/lib/api/endpoints';

/** 首字延迟自检结果（measurable=false 表示该供应商暂无可用对话模型，无法自检） */
export interface FirstTokenProbeReport {
  measurable: boolean;
  ok: boolean;
  firstTokenMs: number | null;
  totalMs: number | null;
}

/** v2.4 M1 T5：对单个供应商发起一次首字延迟自检 */
export function useFirstTokenProbe() {
  return useMutation({
    mutationFn: (providerId: string) =>
      apiPost<FirstTokenProbeReport>(API.providerFirstToken(providerId)),
  });
}
