/** @域 barrel events：v2.16 公开入口（纯 re-export，仅导出跨域需要的能力） */
export { uiTaskEventBus } from './bus/event-bus';
export { useContextTriggers } from './hooks/use-context-triggers';
export { useEventStage, type EventStage } from './hooks/use-event-stage';
export { useEventTriggers } from './hooks/use-event-triggers';
export { useInstalledEventScripts } from './hooks/use-installed-event-scripts';
export { useMilestoneScenes } from './hooks/use-milestone-scenes';
export { usePreviewEventFromQuery } from './hooks/use-preview-event-from-query';
export { CustomTriggerSection } from './ui/custom-trigger-section';
export { EventPreviewMenu } from './ui/event-preview-menu';
export { EventUsageStats } from './ui/event-usage-stats';
export { eventTitle } from './triggers/event-title';
export { EventFxLayer } from './player/event-fx-layer';
export { EventSkipOverlay } from './player/event-skip-overlay';
export { EventSubtitleSlot } from './player/event-subtitle-bubble';
export type { ActiveFx } from './player/fx-registry';
export type { PreviewResult } from './player/use-event-director';
export type { EventPlaybackBridge } from './player/use-event-player';
