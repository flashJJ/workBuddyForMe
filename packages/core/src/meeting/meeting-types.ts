import type { SseEvent } from '@wbfm/shared/api';
import type {
  MeetingActionItemCreateInput,
  MeetingActionItemUpdateInput,
  MeetingConclusionUpdateInput,
  MeetingCreateInput,
  MeetingMode,
} from '@wbfm/shared/schemas';
import type {
  MeetingActionItemRecord,
  MeetingConclusionView,
  MeetingDetailView,
  MeetingMessageRecord,
  MeetingRecord,
} from '@wbfm/shared/types';
import type { DatabaseInstance } from '@wbfm/database';
import type { ResolvedChatTarget } from '../chat/model-resolver';

/** 会议线上事件（机械派生于 SSE 真源，service/总线/舞台共用） */
export type MeetingEvent = SseEvent<
  'meeting_turn' | 'meeting_delta' | 'meeting_message' | 'meeting_status' | 'error'
>;

/** 单次模型发言请求（无工具；形状恒 system+user） */
export interface SpeakParams {
  system: string;
  userContent: string;
  signal?: AbortSignal;
  /** 流式回调：参数为该成员本轮累计全文 */
  onDelta?: (fullText: string) => void;
}

export interface MeetingSpeaker {
  speak(params: SpeakParams): Promise<{ content: string }>;
}

/** submitTurn 结果（manual 无 @ 时 triggered=false，不产生模型调用） */
export interface SubmitTurnResult {
  triggered: boolean;
  speakerIds: string[];
}

export interface MeetingServiceDeps {
  db: DatabaseInstance;
  /** 会议共用模型解析（null=系统默认对话模型；成员模型不参与，人格只来自角色卡） */
  resolveTarget: (modelId: string | null) => ResolvedChatTarget;
  /** 发言客户端工厂（测试注入脚本化 speaker；memberId 供人格/脚本路由，模型会议共用） */
  createSpeaker: (target: ResolvedChatTarget, memberId: string) => MeetingSpeaker;
  /** v2.6：一次性文本补全（结论生成/长转录分段压缩），无工具 */
  complete: (
    target: ResolvedChatTarget,
    params: { system: string; user: string; signal?: AbortSignal },
  ) => Promise<string>;
  /** 成员实时姓名；成员已删除返回 null（创建时校验，执行期兜底） */
  getMemberName: (assistantId: string) => string | null;
  /** 成员角色卡正文（buildPersonaBlock 结果；无卡/缺失返回 null） */
  getPersonaBlock: (assistantId: string) => string | null;
}

export interface MeetingService {
  /** 创建会议：成员必须全部存在且共用模型可解析，否则抛 ApiError */
  create(input: MeetingCreateInput): MeetingRecord;
  list(): MeetingRecord[];
  getDetail(id: string): MeetingDetailView | null;
  /** 用户发言/调度动作；异步执行（不绑 SSE 生命周期），active 会议重复提交 409 */
  submitTurn(meetingId: string, content: string): SubmitTurnResult;
  updateMode(meetingId: string, mode: MeetingMode): void;
  /** 手动结束（active→finished）；活跃发言先 abort */
  finish(meetingId: string): void;
  /** 打断（active→aborted）；活跃发言 abort，running 未执行直接收敛 */
  abort(meetingId: string): void;
  isActive(meetingId: string): boolean;
  /** 只读观察（会场页/舞台）；非活跃返回 null，调用方回落落库回放 */
  observe(meetingId: string): AsyncIterableIterator<MeetingEvent> | null;
  /** v2.6：读取结论 + 行动项（无结论时 conclusion=null） */
  getConclusion(meetingId: string): MeetingConclusionView;
  /** v2.6：对 finished 会议生成结构化结论；失败不落伪结论 */
  generateConclusion(meetingId: string): Promise<MeetingConclusionView>;
  /** v2.6：编辑结论正文（summary/decisions/openQuestions） */
  updateConclusion(meetingId: string, input: MeetingConclusionUpdateInput): MeetingConclusionView;
  /** v2.6：行动项列表/新增/更新（取消=status=cancelled，不物理删除） */
  listActionItems(meetingId: string): MeetingActionItemRecord[];
  createActionItem(meetingId: string, input: MeetingActionItemCreateInput): MeetingActionItemRecord;
  updateActionItem(
    meetingId: string,
    itemId: string,
    input: MeetingActionItemUpdateInput,
  ): MeetingActionItemRecord;
}

export type {
  MeetingActionItemRecord,
  MeetingConclusionView,
  MeetingCreateInput,
  MeetingDetailView,
  MeetingMessageRecord,
  MeetingRecord,
};
