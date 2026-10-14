import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createAssistantRepository,
  createDatabase,
  createMeetingRepository,
  createStageSceneRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import type { StageScenePayload } from '@wbfm/shared/schemas';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { exportBackup } from './export';
import { precheckBackup, restoreBackup } from './restore';
import {
  readV19TrackPayloads,
  restoreV19TrackData,
} from './restore-meetings';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';

const SCENE_PAYLOAD: StageScenePayload = {
  background: { type: 'solid', color: '#101826', brightness: 1, blur: 0 },
  slots: {},
  cast: {},
  sceneZoom: 1,
  showDialog: true,
  showNameplates: true,
  warmFilter: { color: '#e8b06b', opacity: 0 },
};

function customAssistant(db: DatabaseInstance, id: string, name: string): void {
  createAssistantRepository(db).create({
    id,
    name,
    emoji: null,
    color: null,
    systemPrompt: '测试助手',
    temperature: 1,
    topP: 1,
    maxTokens: null,
    modelId: null,
    knowledgeBaseIds: [],
    enabledTools: [],
    retrieveAlways: false,
    isBuiltin: false,
    sortOrder: 0,
  });
}

describe('v1.9 备份恢复（events 轨：舞台场景 + 会议）', () => {
  let srcDb: DatabaseInstance;
  let dstDb: DatabaseInstance;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-v19-backup-'));
    setDataRootForTest(tempRoot);
    srcDb = createDatabase(':memory:');
    dstDb = createDatabase(':memory:');
  });

  afterEach(() => {
    srcDb.close();
    dstDb.close();
    resetDataRootForTest();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('events 轨 roundtrip：场景/会议/转录导入，precheck 计数正确，重复恢复幂等', async () => {
    ensureSeedData(srcDb);
    customAssistant(srcDb, 'a1', '阿策');
    customAssistant(srcDb, 'a2', '阿审');
    const sceneRepo = createStageSceneRepository(srcDb);
    sceneRepo.create({ name: '会议舞台', payload: SCENE_PAYLOAD });
    const meetingRepo = createMeetingRepository(srcDb);
    const meeting = meetingRepo.create({
      topic: '方案评审',
      memberIds: ['a1', 'a2'],
      mode: 'manual',
      modelId: null,
    });
    meetingRepo.appendMessage({
      meetingId: meeting.id,
      speakerKind: 'user',
      speakerId: null,
      speakerName: '用户',
      content: '@阿策 开场',
    });
    meetingRepo.appendMessage({
      meetingId: meeting.id,
      speakerKind: 'assistant',
      speakerId: 'a1',
      speakerName: '阿策',
      content: '我先讲结论',
    });
    meetingRepo.finalize(meeting.id, 'finished');

    const { archive, manifest } = await exportBackup(
      { db: srcDb, cipher: createWebCipher() },
      { tracks: ['events'] },
    );
    expect(manifest.tracks.events?.meetingCount).toBe(1);
    expect(manifest.tracks.events?.meetingMessageCount).toBe(2);
    expect(manifest.tracks.events?.stageSceneCount).toBe(1);

    const pre = await precheckBackup(archive);
    expect(pre.compatible).toBe(true);
    expect(pre.tracks.meetings).toBe(1);
    expect(pre.tracks.meetingMessages).toBe(2);
    expect(pre.tracks.stageScenes).toBe(1);

    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);

    const dstScenes = createStageSceneRepository(dstDb).list();
    expect(dstScenes).toHaveLength(1);
    expect(dstScenes[0]!.name).toBe('会议舞台');

    const dstMeetings = createMeetingRepository(dstDb);
    const restored = dstMeetings.list();
    expect(restored).toHaveLength(1);
    expect(restored[0]!.topic).toBe('方案评审');
    expect(restored[0]!.status).toBe('finished');
    expect(restored[0]!.memberIds).toEqual(['a1', 'a2']);
    const messages = dstMeetings.listMessages(meeting.id);
    expect(messages.map((m) => [m.seq, m.speakerKind, m.speakerId])).toEqual([
      [1, 'user', null],
      [2, 'assistant', 'a1'],
    ]);

    // 幂等：二次恢复不重复导入
    await restoreBackup({ db: dstDb, cipher: createWebCipher() }, archive);
    expect(createMeetingRepository(dstDb).listMessages(meeting.id)).toHaveLength(2);
    expect(createStageSceneRepository(dstDb).list()).toHaveLength(1);
  });

  it('悬空成员：memberIds 剔除目标库不存在的助手，其历史转录仍保留（speakerName 快照）', () => {
    ensureSeedData(dstDb);
    customAssistant(dstDb, 'a1', '阿策');
    const now = new Date().toISOString();
    const counts = restoreV19TrackData(dstDb, {
      stageScenes: [],
      meetings: [
        {
          id: 'm1',
          topic: '残缺会议',
          memberIds: ['a1', 'ghost'],
          mode: 'auto',
          modelId: null,
          status: 'finished',
          autoRounds: 2,
          createdAt: now,
          finishedAt: now,
        },
      ],
      meetingMessages: [
        {
          id: 'msg1',
          meetingId: 'm1',
          seq: 1,
          speakerKind: 'assistant',
          speakerId: 'ghost',
          speakerName: '阿研（快照名）',
          content: '我的助手行没有随档恢复',
          emotionTag: null,
          createdAt: now,
        },
        {
          id: 'msg2',
          meetingId: 'm1',
          seq: 2,
          speakerKind: 'assistant',
          speakerId: 'a1',
          speakerName: '阿策',
          content: '我补充',
          emotionTag: null,
          createdAt: now,
        },
      ],
    });

    expect(counts.meetings.imported).toBe(1);
    expect(counts.meetingMessages.imported).toBe(2);
    const repo = createMeetingRepository(dstDb);
    expect(repo.findById('m1')!.memberIds).toEqual(['a1']); // ghost 剔除
    const ghostMsg = repo.listMessages('m1').find((m) => m.id === 'msg1')!;
    expect(ghostMsg.speakerName).toBe('阿研（快照名）'); // 转录不丢、名字不失真
  });

  it('宽容降级：缺文件（v4 旧档）全空计数；坏行逐条跳过不阻断', () => {
    ensureSeedData(dstDb);
    const empty = readV19TrackPayloads(new Map());
    expect(empty).toEqual({ stageScenes: [], meetings: [], meetingMessages: [] });
    expect(restoreV19TrackData(dstDb, empty)).toEqual({
      stageScenes: { imported: 0, skipped: 0 },
      meetings: { imported: 0, skipped: 0 },
      meetingMessages: { imported: 0, skipped: 0 },
    });

    const counts = restoreV19TrackData(dstDb, {
      stageScenes: [{ id: 'bad-scene', name: 'x', payload: { nope: true } }],
      meetings: [{ id: 'bad-meeting', topic: 'x' }],
      meetingMessages: [
        { id: 'orphan', meetingId: 'no-such-meeting', seq: 1, speakerKind: 'user' },
      ],
    });
    expect(counts.stageScenes.skipped).toBe(1);
    expect(counts.meetings.skipped).toBe(1);
    expect(counts.meetingMessages.skipped).toBe(1); // 孤儿消息跳过
  });
});
