import type {
  MeetingMode,
  MeetingSpeakerKind,
  MeetingStatus,
} from '../schemas/meeting';

/** meetings 表行视图 */
export interface MeetingRecord {
  id: string;
  topic: string;
  /** assistants.id，2–4 个，顺序即席次 */
  memberIds: string[];
  mode: MeetingMode;
  /** models.id；null=系统默认对话模型 */
  modelId: string | null;
  status: MeetingStatus;
  /** 已用 auto 接龙轮次（硬上限 8） */
  autoRounds: number;
  createdAt: string;
  finishedAt: string | null;
}

/** meeting_messages 表行视图（会内严格递增 seq） */
export interface MeetingMessageRecord {
  id: string;
  meetingId: string;
  seq: number;
  speakerKind: MeetingSpeakerKind;
  /** assistant id；user 为 null */
  speakerId: string | null;
  /** 渲染快照名（assistant 名 / 用户称呼），避免成员改名后历史失真 */
  speakerName: string;
  content: string;
  /** 当轮表情标签（可选，只驱动当场发言者） */
  emotionTag: string | null;
  /** auto 接龙被服务端截断的超长发言标记 */
  truncated?: boolean;
  createdAt: string;
}

/** 会议详情 = 会议行 + 全量消息（会场首屏/终态回放） */
export interface MeetingDetailView {
  meeting: MeetingRecord;
  messages: MeetingMessageRecord[];
  /** 成员实时档案（恢复后悬空成员会缺失，UI 标注） */
  members: Array<{ id: string; name: string; missing?: boolean }>;
}
