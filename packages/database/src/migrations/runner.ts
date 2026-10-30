import type { Database } from 'better-sqlite3';
import { migrateV001 } from './v001-initial-schema';
import { migrateV002 } from './v002-tools';
import { migrateV003 } from './v003-multimodal';
import { migrateV004 } from './v004-ocr';
import { migrateV005 } from './v005-conversation-summary';
import { migrateV006 } from './v006-memory';
import { migrateV007 } from './v007-message-feedback';
import { migrateV008 } from './v008-mcp-servers';
import { migrateV009 } from './v009-tool-permissions';
import { migrateV010 } from './v010-skills-state';
import { migrateV011 } from './v011-task-runs';
import { migrateV012 } from './v012-flow-studio';
import { migrateV013 } from './v013-flow-serving';
import { migrateV014 } from './v014-voice';
import { migrateV015 } from './v015-assistant-expression';
import { migrateV016 } from './v016-release-polish';
import { migrateV017 } from './v017-knowledge';
import { migrateV018 } from './v018-fts-backfill';
import { migrateV019 } from './v019-agent-collab';
import { migrateV020 } from './v020-agent-roles';
import { migrateV021 } from './v021-assistant-multi-kb';
import { migrateV022 } from './v022-assistant-emotion';
import { migrateV023 } from './v023-emotion-events';
import { migrateV024 } from './v024-events-scheduler';
import { migrateV025 } from './v025-event-triggers';
import { migrateV026 } from './v026-character-cards';
import { migrateV027 } from './v027-stage-scenes';
import { migrateV028 } from './v028-meetings';
import { migrateV029 } from './v029-relationship-milestones';
import { migrateV030 } from './v030-vrm-avatars';
import { migrateV031 } from './v031-mod-installs';
import { migrateV032 } from './v032-motion-assets';
import { migrateV033 } from './v033-motion-segments';
import { migrateV034 } from './v034-assistant-skills';
import { migrateV035 } from './v035-meeting-conclusions';
import { migrateV036 } from './v036-memory-provenance';
import { migrateV037 } from './v037-work-companion';
import { migrateV038 } from './v038-session-events';
import { migrateV039 } from './v039-capability-packs';
import { migrateV040 } from './v040-capability-effects';
import { migrateV041 } from './v041-agent-governance';

interface Migration {
  version: number;
  description: string;
  up: (db: Database) => void;
}

/** 顺序迁移表：新版本在此追加，禁止修改已发布迁移 */
const MIGRATIONS: Migration[] = [
  { version: 1, description: 'initial schema', up: migrateV001 },
  { version: 2, description: 'tool calling: assistant tools + message tool_trace', up: migrateV002 },
  {
    version: 3,
    description: 'multimodal: attachments + message content_parts + document source',
    up: migrateV003,
  },
  {
    version: 4,
    description: 'ocr: documents.ocr_status + ocr_engine',
    up: migrateV004,
  },
  {
    version: 5,
    description: 'conversation compaction: conversations.summary + summary_turns',
    up: migrateV005,
  },
  {
    version: 6,
    description: 'long-term memory: assistants.memory_enabled + memories table',
    up: migrateV006,
  },
  {
    version: 7,
    description: 'message feedback: messages.feedback + feedback_at',
    up: migrateV007,
  },
  {
    version: 8,
    description: 'mcp servers: mcp_servers table (stdio/http)',
    up: migrateV008,
  },
  {
    version: 9,
    description: 'tool permissions: read/write/danger + HITL allow/deny',
    up: migrateV009,
  },
  {
    version: 10,
    description: 'skills: skills_state table (enable/disable references)',
    up: migrateV010,
  },
  {
    version: 11,
    description: 'computer agent: task_runs + task_steps (action log)',
    up: migrateV011,
  },
  {
    version: 12,
    description: 'flow studio: workflows + workflow_versions + workflow_runs + node_executions',
    up: migrateV012,
  },
  {
    version: 13,
    description: 'flow serving: workflow_endpoints + workflow_runs 端点/重放/中断列',
    up: migrateV013,
  },
  {
    version: 14,
    description: 'voice companion: voice_models 下载状态表（设置复用 settings_kv）',
    up: migrateV014,
  },
  {
    version: 15,
    description: 'assistant expression: assistants.expression_enabled 表情指令开关',
    up: migrateV015,
  },
  {
    version: 16,
    description: 'release polish: 老用户 app-settings 回填 hasOnboarded=true（无表结构变更）',
    up: migrateV016,
  },
  {
    version: 17,
    description:
      'knowledge: chunk 页段坐标 + chunks_fts 全文表 + 知识编译三表 + documents 编译状态列（纯加法）',
    up: migrateV017,
  },
  {
    version: 18,
    description: 'knowledge: chunks_fts 存量分片回填（v017 只建空表，升级老库关键词路零行）',
    up: migrateV018,
  },
  {
    version: 19,
    description: 'agents: agent_runs/agent_handoffs 协作运行与交接表 + task_runs/steps 归属列（纯加法）',
    up: migrateV019,
  },
  {
    version: 20,
    description: 'agents: assistants 三角色模型覆盖列 + task_steps.citations_json（纯加法）',
    up: migrateV020,
  },
  {
    version: 21,
    description: 'assistant multi-kb: assistants.knowledge_base_ids JSON 数组列（旧单值回填）',
    up: migrateV021,
  },
  {
    version: 22,
    description: 'assistant emotion: assistant_emotion_states 情绪/关系状态表（每助手一行）',
    up: migrateV022,
  },
  {
    version: 23,
    description: 'assistant emotion: emotion_events 情绪事件流水（不可变追加，无对话原文）',
    up: migrateV023,
  },
  {
    version: 24,
    description:
      'v1.7 events: assistants 人格 4 列 + scheduled_tasks 提醒表 + event_usage 演出流水（纯加法）',
    up: migrateV024,
  },
  {
    version: 25,
    description: 'v1.7 events: event_triggers 自定义短语触发器（纯加法）',
    up: migrateV025,
  },
  {
    version: 26,
    description: 'v1.8 personalize: character_cards 角色卡库 + assistants.card_id（纯加法）',
    up: migrateV026,
  },
  {
    version: 27,
    description: 'v1.9 stage: stage_scenes 舞台场景表（纯加法）',
    up: migrateV027,
  },
  {
    version: 28,
    description: 'v1.9 meeting: meetings + meeting_messages 多助手会议（纯加法）',
    up: migrateV028,
  },
  {
    version: 29,
    description: 'v2.0 relationship: relationship_milestones 共同里程碑达成记录（纯加法）',
    up: migrateV029,
  },
  {
    version: 30,
    description: 'v2.0 M4: vrm_avatars 用户导入 VRM 形象表（纯加法）',
    up: migrateV030,
  },
  {
    version: 31,
    description: 'v2.0 M5: mod_installs .wbfm-pack 导入安装记录表（纯加法）',
    up: migrateV031,
  },
  {
    version: 32,
    description: 'v2.0: motion_assets 用户导入 VRMA 待机动作表（纯加法）',
    up: migrateV032,
  },
  {
    version: 33,
    description: 'v2.2 M0: motion_assets 动作段与情绪档位四列（纯加法）',
    up: migrateV033,
  },
  {
    version: 34,
    description: 'v2.4 M4: assistants.skill_names 助手级技能勾选（纯加法，空=跟随全局）',
    up: migrateV034,
  },
  {
    version: 35,
    description: 'v2.6: meeting_conclusions + meeting_action_items 会议结论与行动项（纯加法）',
    up: migrateV035,
  },
  {
    version: 36,
    description: 'v2.6 M4: memories.source_message_id + recall_count 记忆溯源与召回计数（纯加法）',
    up: migrateV036,
  },
  {
    version: 37,
    description:
      'v2.8: 运行租约 + 完成回投幂等键 + 目标/计划/待办表 + 定时跟进 payload（纯加法）',
    up: migrateV037,
  },
  {
    version: 38,
    description: 'v2.9: session_events 追加式事件日志 + CJK 全文索引（纯加法）',
    up: migrateV038,
  },
  {
    version: 39,
    description: 'v2.10: capability_packs 能力包登记表（纯加法）',
    up: migrateV039,
  },
  {
    version: 40,
    description:
      'v2.11: workflows 来源列 + 剧本/报告卡片/外部代理运行表（纯加法）',
    up: migrateV040,
  },
  {
    version: 41,
    description:
      'v2.13: task_runs 执行模式/工作目录/策略快照/定时来源 + audit_events 审计账本（纯加法）',
    up: migrateV041,
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/**
 * 基于 PRAGMA user_version 的顺序迁移（前向、事务化、幂等）。
 * 迁移策略：读兼容、写收敛 —— 后续版本只做加法或兼容映射。
 */
export function applyMigrations(
  db: Database,
  targetVersion = LATEST_SCHEMA_VERSION,
): { from: number; to: number; applied: number[] } {
  const from = db.pragma('user_version', { simple: true }) as number;
  const pending = MIGRATIONS.filter(
    (m) => m.version > from && m.version <= targetVersion,
  ).sort((a, b) => a.version - b.version);
  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db);
      db.pragma(`user_version = ${migration.version}`);
    });
    apply();
  }
  return { from, to: targetVersion, applied: pending.map((m) => m.version) };
}

export function getSchemaVersion(db: Database): number {
  return db.pragma('user_version', { simple: true }) as number;
}
