import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAssistantRepository,
  createDatabase,
  createMeetingConclusionRepository,
  createMeetingRepository,
  createMemoryRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { exportBackup } from './export';
import { precheckBackup, restoreBackup } from './restore';
import { restoreProvenance } from './restore-provenance';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';

describe('v2.6 备份恢复（events 轨：记忆 + 会议结论 + 行动项）', () => {
  let srcDb: DatabaseInstance;
  let dstDb: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-v26-backup-'));
    setDataRootForTest(tempRoot);
    srcDb = createDatabase(':memory:');
    dstDb = createDatabase(':memory:');
    ensureSeedData(srcDb);
    ensureSeedData(dstDb);
  });

  afterEach(() => {
    srcDb.close();
    dstDb.close();
    resetDataRootForTest();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('roundtrip：来源消息/召回次数/结论/行动项保留，precheck 计数正确，重复恢复幂等', async () => {
    const members = createAssistantRepository(srcDb)
      .list()
      .slice(0, 2)
      .map((assistant) => assistant.id);
    const meetings = createMeetingRepository(srcDb);
    const meeting = meetings.create({
      topic: 'v2.6 收口评审',
      memberIds: members,
      mode: 'manual',
      modelId: null,
    });
    meetings.appendMessage({
      meetingId: meeting.id,
      speakerKind: 'user',
      speakerId: null,
      speakerName: '用户',
      content: '讨论备份范围',
    });
    meetings.finalize(meeting.id, 'finished');

    const conclusions = createMeetingConclusionRepository(srcDb);
    conclusions.saveGeneratedConclusion(
      {
        meetingId: meeting.id,
        summary: '备份纳入结论与记忆',
        decisions: ['升 schema v7'],
        openQuestions: ['向量是否入档'],
        modelId: null,
      },
      [{ content: '补 roundtrip 测试', ownerLabel: '未指定', ownerMemberId: null, dueAt: null }],
    );
    const manual = conclusions.createActionItem(meeting.id, {
      content: '人工行动项',
      ownerLabel: '用户',
      ownerMemberId: null,
      dueAt: null,
    });
    conclusions.updateActionItem(meeting.id, manual.id, { status: 'done' });
    conclusions.linkReminder(meeting.id, manual.id, 'rem-1');

    const memoryRepo = createMemoryRepository(srcDb);
    const memory = memoryRepo.add({
      kind: 'preference',
      content: '用户偏好中文回复',
      importance: 0.9,
      sourceConversationId: 'conv-x',
      sourceMessageId: 'msg-y',
    });
    memoryRepo.touchAccessed([memory.id, memory.id]);

    const { archive, manifest } = await exportBackup(
      { db: srcDb, cipher: createWebCipher() },
      { tracks: ['events'] },
    );
    expect(manifest.tracks.events?.memoryCount).toBe(1);
    expect(manifest.tracks.events?.meetingConclusionCount).toBe(1);
    expect(manifest.tracks.events?.meetingActionItemCount).toBe(2);

    const pre = await precheckBackup(archive);
    expect(pre.tracks.memories).toBe(1);
    expect(pre.tracks.meetingConclusions).toBe(1);
    expect(pre.tracks.meetingActionItems).toBe(2);

    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);

    const restoredMemory = createMemoryRepository(dstDb).findById(memory.id);
    expect(restoredMemory).toMatchObject({
      content: '用户偏好中文回复',
      sourceConversationId: 'conv-x',
      sourceMessageId: 'msg-y',
      recallCount: 2,
    });
    expect(restoredMemory!.lastAccessedAt).toBeTruthy();

    const dstConclusions = createMeetingConclusionRepository(dstDb);
    expect(dstConclusions.getConclusion(meeting.id)).toMatchObject({
      summary: '备份纳入结论与记忆',
      decisions: ['升 schema v7'],
      openQuestions: ['向量是否入档'],
    });
    const items = dstConclusions.listActionItems(meeting.id);
    expect(items).toHaveLength(2);
    expect(items.find((item) => item.id === manual.id)).toMatchObject({
      status: 'done',
      linkedReminderId: 'rem-1',
    });

    // 幂等：第二次恢复不重复写入
    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(createMemoryRepository(dstDb).list()).toHaveLength(1);
    expect(dstConclusions.listActionItems(meeting.id)).toHaveLength(2);
  });

  it('悬空会议/非法记忆：跳过而非写入脏数据', () => {
    const counts = restoreProvenance(dstDb, {
      memories: [{ id: 'not-a-number', kind: 'fact', content: 'x' }],
      meetingConclusions: [
        {
          meetingId: 'ghost-meeting',
          summary: '悬空结论',
          decisions: [],
          openQuestions: [],
          generatedAt: new Date().toISOString(),
        },
      ],
      meetingActionItems: [],
    });
    expect(counts.memories.skipped).toBe(1);
    expect(counts.meetingConclusions.skipped).toBe(1);
    expect(createMemoryRepository(dstDb).list()).toHaveLength(0);
  });
});
