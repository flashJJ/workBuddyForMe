import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  backupManifestSchema,
  type BackupManifest,
} from '@wbfm/shared/backup';
import type { ServiceDeps } from '../services/base/deps';
import {
  createConversationBranchRepository,
  createStagePlanRepository,
  createSettingsRepository,
  createSkillStateRepository,
  createEmotionStateRepository,
  createEmotionEventRepository,
} from '@wbfm/database';
import { filterBranchEvents, serializeBranchEvents } from './portability/export/export-branch-events';
import { serializeConversationsTrack } from './portability/export/export-conversations';
import { serializeKnowledgeTrack } from './portability/export/export-knowledge';
import { filterEmotionFile, filterEventsFiles, eventsTotal, filterTasksFiles } from './portability/export/incremental-filter';
import { serializeTasksTrack } from './export-tasks-track';
import { serializeAgentRunsTrack, serializeAgentHandoffsTrack } from './portability/export-agent-runs';
import { serializeAttachmentsTrack } from './portability/export/export-attachments';
import { createExportReporter, payloadBytes } from './portability/export/export-report';
import { serializeEventsTrack } from './export-events-track';
import { getAppVersion } from './app-version';
import { ApiError } from '@wbfm/shared/errors';
import { getDataRoot } from '@wbfm/config';
import { packTarGz } from './export-archive';
import { sealArchive } from './portability/archive-cipher';
import { chainInfoFromManifest } from './portability/chain/chain-info';
import { appendBackupHistory, requireIncrementalParent } from './portability/chain/backup-registry';
import { sanitizeSettings } from './export-sanitize';
import { BACKUP_MAX_ARCHIVE_BYTES } from './export-types';
import type { BackupExportOptions, BackupExportResult } from './export-types';

// 既有域 barrel 导出名原位保留（实现已拆至 kebab-case 纯函数模块，exportBackup 主流程不变）
export { sanitizeSettings };
export { BACKUP_MAX_ARCHIVE_BYTES, type BackupExportOptions, type BackupExportResult };

/**
 * 备份导出：全量或增量（v2.34）JSON 序列化 + tar.gz 归档。
 *
 * 脱敏策略：settings_kv 中任何形如 { encrypted: true, ciphertext: string } 的 JSON 值，
 * 将 ciphertext 替换为 '[REDACTED]'（Electron safeStorage DPAPI key per-device 跨机器无法解密，
 * 用户恢复后需重新填入敏感凭证）。
 *
 * 向量不备份——knowledge 轨只存分片文本，恢复后走 ingestion pipeline 重新嵌入。
 * 增量语义：只带 since（上一段 startedAt）之后新建的行 + settings/skills 快照；
 * 既有行的修改、删除与文档重解析不进入增量，全量仍是迁移权威。
 */
export async function exportBackup(
  deps: ServiceDeps,
  options: BackupExportOptions,
): Promise<BackupExportResult> {
  const { tracks, onProgress } = options;
  const mode = options.mode ?? 'full';
  // v2.34：since 取父段开始时间（宁可重复不可遗漏），无基线拒绝增量
  const parent = mode === 'incremental' ? requireIncrementalParent(deps.db) : null;
  const since = parent?.startedAt ?? undefined;
  const startedAt = new Date().toISOString();
  const dataRoot = getDataRoot();
  // v2.33：逐轨条目/字节/耗时（只读报告，失败不影响导出）
  const reporter = createExportReporter();

  // 用 repository 接口拉取数据（monorepo workspace 可直接 import database）
  const stagePlansRepo = createStagePlanRepository(deps.db);
  const settingsRepo = createSettingsRepository(deps.db);
  const skillStateRepo = createSkillStateRepository(deps.db);
  const emotionStateRepo = createEmotionStateRepository(deps.db);
  const emotionEventRepo = createEmotionEventRepository(deps.db);

  // 1. 逐轨序列化（纯 JSON，进 tar）
  const files: Record<string, string> = {};
  const manifestPartial: BackupManifest['tracks'] = {
    conversations: { files: 'conversations.json', entryCount: 0 },
    knowledge: { files: 'knowledge.json', knowledgeBaseCount: 0, documentCount: 0 },
    settings: { files: 'settings.json' },
    attachments: { files: 'attachments/', entryCount: 0, totalBytes: 0 },
    skills: { files: 'skills.json', entryCount: 0 },
    tasks: { files: 'tasks.json', entryCount: 0 },
    emotion: { files: 'emotion.json', entryCount: 0 },
    events: { files: 'events.json', scheduleCount: 0, usageCount: 0, assistantCount: 0, triggerCount: 0, cardCount: 0 },
  };

  if (tracks.includes('conversations')) {
    // v2.34：全量分页读取全部会话与消息，不再有 10,000 / 500 静默上限
    const payload = serializeConversationsTrack(
      deps.db,
      (conversationId) => stagePlansRepo.get(conversationId),
      since,
    );
    files['conversations.json'] = payload.json;
    // v2.21：分支关联随 conversations 轨（可选文件；旧归档缺文件按空数组）
    const branchRows = createConversationBranchRepository(deps.db)
      .listAll()
      .filter((branch) => !since || branch.createdAt > since);
    files['branches.json'] = JSON.stringify(branchRows, null, 2);
    manifestPartial.conversations.branchCount = branchRows.length;
    // v2.22：分支事件随 conversations 轨（恢复后图车道/回传节点不依赖重新运行）
    const branchEvents = filterBranchEvents(serializeBranchEvents(deps.db), since);
    files['branch-events.json'] = branchEvents.json;
    manifestPartial.conversations.branchEventCount = branchEvents.count;
    manifestPartial.conversations.branchEventsTruncated = branchEvents.truncated;
    manifestPartial.conversations.entryCount = payload.entryCount;
    // v2.34：记录真实消息数，核对时不再只比会话数
    manifestPartial.conversations.messageCount = payload.messageCount;
    reporter.record(
      'conversations',
      payload.entryCount + payload.messageCount + branchRows.length + branchEvents.count,
      payloadBytes(files, ['conversations.json', 'branches.json', 'branch-events.json']),
    );
    onProgress?.({ track: 'conversations', processed: payload.entryCount, total: payload.entryCount });
  }

  if (tracks.includes('knowledge')) {
    const payload = serializeKnowledgeTrack(deps.db, since);
    files['knowledge.json'] = payload.json;
    manifestPartial.knowledge.knowledgeBaseCount = payload.knowledgeBaseCount;
    manifestPartial.knowledge.documentCount = payload.documentCount;
    reporter.record(
      'knowledge',
      payload.knowledgeBaseCount + payload.documentCount,
      payloadBytes(files, ['knowledge.json']),
    );
    onProgress?.({ track: 'knowledge', processed: payload.knowledgeBaseCount, total: payload.knowledgeBaseCount });
  }

  if (tracks.includes('settings')) {
    const raw = settingsRepo.all();
    files['settings.json'] = JSON.stringify(sanitizeSettings(raw), null, 2);
    reporter.record('settings', 1, payloadBytes(files, ['settings.json']));
    onProgress?.({ track: 'settings', processed: 1, total: 1 });
  }

  if (tracks.includes('skills')) {
    // v0.6 M3：技能轨——skills/ 下各文件夹的 skill.json 原文 + skills_state 启停状态
    const skillsDir = path.join(dataRoot, 'skills');
    const skills: Array<{ name: string; skillJson: string }> = [];
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const manifestPath = path.join(skillsDir, entry.name, 'skill.json');
        if (fs.existsSync(manifestPath)) {
          skills.push({ name: entry.name, skillJson: fs.readFileSync(manifestPath, 'utf-8') });
        }
      }
    }
    files['skills.json'] = JSON.stringify({ states: skillStateRepo.list(), skills }, null, 2);
    manifestPartial.skills = { files: 'skills.json', entryCount: skills.length };
    reporter.record('skills', skills.length, payloadBytes(files, ['skills.json']));
    onProgress?.({ track: 'skills', processed: skills.length, total: skills.length });
  }

  if (tracks.includes('tasks')) {
    // v0.7 M4：任务轨——task_runs + task_steps 全量序列化（截图附件 id 引用 attachments 表，独立于 attachments 轨）
    const serialized = serializeTasksTrack(deps.db);
    files['tasks.json'] = JSON.stringify(serialized, null, 2);
    // v2.32：协作运行与角色交接随 tasks 轨（v7 归档缺文件，恢复端按空数组处理）
    const agentRuns = serializeAgentRunsTrack(deps.db);
    const agentHandoffs = serializeAgentHandoffsTrack(deps.db);
    files['agentRuns.json'] = JSON.stringify(agentRuns, null, 2);
    files['agentHandoffs.json'] = JSON.stringify(agentHandoffs, null, 2);
    manifestPartial.tasks = {
      files: 'tasks.json',
      entryCount: serialized.length,
      agentRunCount: agentRuns.length,
      agentHandoffCount: agentHandoffs.length,
    };
    // v2.34：增量只保留 since 之后新建的任务/协作运行/交接
    if (since) filterTasksFiles(files, manifestPartial.tasks, since);
    const taskTotal =
      manifestPartial.tasks.entryCount +
      (manifestPartial.tasks.agentRunCount ?? 0) +
      (manifestPartial.tasks.agentHandoffCount ?? 0);
    reporter.record(
      'tasks',
      taskTotal,
      payloadBytes(files, ['tasks.json', 'agentRuns.json', 'agentHandoffs.json']),
    );
    onProgress?.({ track: 'tasks', processed: manifestPartial.tasks.entryCount, total: manifestPartial.tasks.entryCount });
  }

  if (tracks.includes('emotion')) {
    // v1.6：情绪/关系轨——每助手一行状态快照 + 其事件流水（均不含对话原文）
    const eventsByAssistant = new Map<string, unknown[]>();
    for (const event of emotionEventRepo.listAll()) {
      const list = eventsByAssistant.get(event.assistantId) ?? [];
      list.push(event);
      eventsByAssistant.set(event.assistantId, list);
    }
    const records = emotionStateRepo.list().map((record) => ({
      ...record,
      events: eventsByAssistant.get(record.assistantId) ?? [],
    }));
    files['emotion.json'] = JSON.stringify(records, null, 2);
    const filtered = since ? filterEmotionFile(files, since) : null;
    manifestPartial.emotion = { files: 'emotion.json', entryCount: filtered ?? records.length };
    reporter.record('emotion', filtered ?? records.length, payloadBytes(files, ['emotion.json']));
    onProgress?.({ track: 'emotion', processed: filtered ?? records.length, total: filtered ?? records.length });
  }

  if (tracks.includes('events')) {
    // v1.7–v2.0：自定义助手/提醒/演出流水/角色卡/舞台/会议/里程碑/mod 安装记录/
    // VRM 形象引用（仅元数据）。背景图与 .vrm 二进制只带引用不进档。
    const payload = serializeEventsTrack(deps.db);
    Object.assign(files, payload.files);
    const eventsManifest = payload.manifest;
    manifestPartial.events = eventsManifest;
    // v2.34：增量按 createdAt 过滤全部追加型文件，并重算计数
    if (since) filterEventsFiles(files, eventsManifest, since);
    const total = since ? eventsTotal(eventsManifest) : payload.total;
    reporter.record('events', total, payloadBytes(files, Object.keys(payload.files)));
    onProgress?.({ track: 'events', processed: total, total });
  }

  // 2. 附件：元数据 JSON + 二进制（可选）
  const attachmentsToPack: Array<{ name: string; data: Buffer }> = [];
  if (tracks.includes('attachments')) {
    // v2.33：元数据 + refs.json + 已存在文件（旧归档缺 refs 由恢复端回填补齐）
    const track = serializeAttachmentsTrack(deps.db, dataRoot, since);
    Object.assign(files, track.files);
    attachmentsToPack.push(...track.binaries);
    manifestPartial.attachments.entryCount = track.entryCount;
    manifestPartial.attachments.totalBytes = track.totalBytes;
    manifestPartial.attachments.refCount = track.refCount;
    reporter.record(
      'attachments',
      track.entryCount,
      track.totalBytes + payloadBytes(files, ['attachments.json', 'refs.json']),
    );
    onProgress?.({ track: 'attachments', processed: track.entryCount, total: track.totalCount });
  }

  // 3. 打包成 tar.gz
  const archiveId = randomUUID();
  const chainId = parent?.chainId ?? archiveId;
  const sequence = parent ? parent.sequence + 1 : 0;
  const manifest: BackupManifest = backupManifestSchema.parse({
    backupSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    appVersion: getAppVersion(),
    createdAt: new Date().toISOString(),
    startedAt,
    sourceDataRoot: dataRoot,
    archiveId,
    kind: mode,
    chainId,
    sequence,
    ...(parent ? { parentArchiveId: parent.archiveId } : {}),
    tracks: manifestPartial,
  });

  const packed = await packTarGz(files, attachmentsToPack, manifest);

  // 上限按加密前的归档大小判断（加密在整包缓冲上完成，不引入流式依赖）
  if (packed.length > BACKUP_MAX_ARCHIVE_BYTES) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `归档大小 ${(packed.length / 1024 / 1024).toFixed(1)}MB 超过上限 ${BACKUP_MAX_ARCHIVE_BYTES / 1024 / 1024}MB，请分批导出`,
    );
  }

  const encrypted = typeof options.password === 'string' && options.password.length > 0;
  const archive = encrypted ? sealArchive(packed, options.password!) : packed;

  if (options.outputPath) {
    fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
    fs.writeFileSync(options.outputPath, archive);
  }

  const report = reporter.finish(archive.length, encrypted);
  const chain = chainInfoFromManifest(manifest);
  // v2.34：登记到 meta（不进入备份），供下一次增量取基线、设置页展示历史
  appendBackupHistory(deps.db, {
    ...chain,
    at: manifest.createdAt,
    trackCount: report.tracks.length,
    totalBytes: report.totalBytes,
    encrypted,
  });

  return { archive, manifest, size: archive.length, encrypted, report, chain };
}
