/**
 * v1.9 M2 舞台适配器客户端 barrel（浏览器安全）。
 *
 * stage-adapter 只依赖 @wbfm/shared（含语言中立 sys 标记），不触 database/原生模块；
 * 独立 tsup 入口 dist/stage-client.*，避免 web 生产构建经 core 根 barrel
 * 拖入 better-sqlite3/@napi-rs/canvas（同 event-client 模式）。
 */
export {
  adaptStageFrame,
  AGENT_ROLE_SLOT,
  createAgentStageCast,
  openingDirections,
  INITIAL_STAGE_ADAPTER_STATE,
  type StageAdapterState,
  type StageAgentFrame,
} from './stage-adapter';

// v1.9 M3：会议帧 → 舞台指令（纯映射，浏览器安全）
export {
  adaptMeetingFrame,
  createMeetingAdapterState,
  createMeetingCast,
  DEFAULT_MEETING_AVATAR,
  type MeetingAdapterState,
  type MeetingCastMemberInput,
} from '../meeting/meeting-stage-adapter';
export type { MeetingEvent } from '../meeting/meeting-types';
