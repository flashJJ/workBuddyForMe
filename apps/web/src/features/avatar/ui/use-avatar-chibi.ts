'use client';

import type { VoiceSettings } from '@wbfm/shared/schemas';
import { useVisibleQuery } from '@/lib/ui/panel-visibility';
import { apiGet } from '@/lib/api/client';
import { API, QUERY_KEYS } from '@/lib/api/endpoints';

/** v3.0 P4 Q 版比例：来自语音设置域；主窗保存后由设置广播失效，桌宠自动重取 */
export function useAvatarChibi(): boolean {
  const { data } = useVisibleQuery({
    queryKey: QUERY_KEYS.voiceSettings,
    queryFn: () => apiGet<VoiceSettings>(API.voiceSettings),
    staleTime: 30_000,
  });
  return data?.avatarChibi === true;
}
