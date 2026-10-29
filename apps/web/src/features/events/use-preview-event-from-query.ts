'use client';

import * as React from 'react';
import { useToast } from '@/components/common/toast';
import { useI18n } from '@/lib/i18n/use-i18n';
import { useInstalledEventScripts } from './use-installed-event-scripts';
import type { EventStage } from './use-event-stage';

/**
 * v2.11：设置页「试演」跳转 `/chat?previewEvent=<scriptId>`，
 * 对话页拿到启用剧本后由导演手动预览一次，随后清除 query（避免反复播放）。
 * 只读 window.location，不依赖 App Router（单测/桌面窗口均可安全挂载）。
 */
export function usePreviewEventFromQuery(stage: Pick<EventStage, 'previewDefinition'>): void {
  const { t } = useI18n();
  const toast = useToast();
  const { data } = useInstalledEventScripts(true);
  const firedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('previewEvent');
    if (!eventId || firedRef.current === eventId) return;
    const script = data?.find((item) => item.id === eventId);
    if (!script) return;
    firedRef.current = eventId;
    if (stage.previewDefinition(script.definition) !== 'ok') {
      toast.info(t('event.ui.busy'));
    }
    params.delete('previewEvent');
    const query = params.toString();
    window.history.replaceState(null, '', query ? `/chat?${query}` : '/chat');
  }, [data, stage, t, toast]);
}
