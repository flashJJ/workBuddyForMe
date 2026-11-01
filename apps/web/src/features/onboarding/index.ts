/** @域入口 onboarding：v2.16 公开入口（首启宿主、首问交接与首字分档） */
export { FIRST_ASK_EVENT, setPendingFirstAsk, takePendingFirstAsk } from './first-ask';
export { OnboardingHost, reopenOnboarding } from './use-onboarding-host';
export {
  LATENCY_SLOW_MAX_MS,
  LATENCY_SMOOTH_MAX_MS,
  formatLatencySeconds,
  latencyTier,
} from './latency-tier';
export type { LatencyTier } from './latency-tier';
