import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMeetingHarness, TEST_MEMBERS, type MeetingHarness } from './meeting-test-harness';

describe('v2.6 meeting-conclusion-service', () => {
  let h: MeetingHarness;

  beforeEach(() => {
    h = createMeetingHarness();
  });
  afterEach(() => h.cleanup());

  const createFinished = () => {
    const meeting = h.service.create({
      topic: '评审方案',
      memberIds: TEST_MEMBERS.slice(0, 3).map((m) => m.id),
      mode: 'manual',
    });
    h.service.submitTurn(meeting.id, '今天评审方案 A');
    h.service.finish(meeting.id);
    return meeting;
  };

  it('生成：合法 JSON 落库，行动项来源 generated，模型 id 使用实际默认模型', async () => {
    const meeting = createFinished();
    const view = await h.service.generateConclusion(meeting.id);

    expect(view.conclusion).toMatchObject({
      meetingId: meeting.id,
      summary: '达成评审结论',
      decisions: ['采用方案 A'],
      modelId: 'mock-model',
    });
    expect(view.conclusion?.editedAt).toBeNull();
    expect(view.actionItems).toHaveLength(1);
    expect(view.actionItems[0]).toMatchObject({
      content: '补充测试',
      ownerMemberId: 'a',
      ownerLabel: '阿策',
      status: 'open',
      source: 'generated',
    });
    expect(h.completeCalls.at(-1)?.system).toContain('会议结论整理助手');
  });

  it('生成前校验：active/空会议拒绝，非法 JSON 不落伪结论', async () => {
    const active = h.service.create({
      topic: '进行中',
      memberIds: TEST_MEMBERS.slice(0, 2).map((m) => m.id),
      mode: 'manual',
    });
    await expect(h.service.generateConclusion(active.id)).rejects.toThrow(/结束后/);

    const empty = h.service.create({
      topic: '空会议',
      memberIds: TEST_MEMBERS.slice(0, 2).map((m) => m.id),
      mode: 'manual',
    });
    h.service.finish(empty.id);
    await expect(h.service.generateConclusion(empty.id)).rejects.toThrow(/没有可总结/);

    const meeting = createFinished();
    h.setConclusionResponse('这不是 JSON');
    await expect(h.service.generateConclusion(meeting.id)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
    });
    expect(h.service.getConclusion(meeting.id).conclusion).toBeNull();
  });

  it('编辑结论：无结论 404；有结论写 editedAt 且保留未改字段', async () => {
    const meeting = createFinished();
    expect(() => h.service.updateConclusion(meeting.id, { summary: 'x' })).toThrow(/不存在/);

    await h.service.generateConclusion(meeting.id);
    const updated = h.service.updateConclusion(meeting.id, { summary: '人工修订结论' });
    expect(updated.conclusion).toMatchObject({
      summary: '人工修订结论',
      decisions: ['采用方案 A'],
    });
    expect(updated.conclusion?.editedAt).not.toBeNull();
  });

  it('行动项：手动新增校验负责人，状态机拦截 done→cancelled', async () => {
    const meeting = createFinished();
    expect(() =>
      h.service.createActionItem(meeting.id, {
        content: '非法负责人',
        ownerLabel: '',
        ownerMemberId: 'ghost',
        dueAt: null,
      }),
    ).toThrow(/不是本会议成员/);

    const item = h.service.createActionItem(meeting.id, {
      content: '人工行动项',
      ownerLabel: '',
      ownerMemberId: 'a',
      dueAt: null,
    });
    expect(item).toMatchObject({ ownerLabel: '阿策', source: 'manual', status: 'open' });

    expect(h.service.updateActionItem(meeting.id, item.id, { status: 'done' }).status).toBe('done');
    expect(() =>
      h.service.updateActionItem(meeting.id, item.id, { status: 'cancelled' }),
    ).toThrow(/不能从 done/);
    expect(h.service.updateActionItem(meeting.id, item.id, { status: 'open' }).status).toBe('open');
    expect(
      h.service.updateActionItem(meeting.id, item.id, { status: 'cancelled' }).status,
    ).toBe('cancelled');
    expect(h.service.updateActionItem(meeting.id, item.id, { status: 'open' }).status).toBe('open');
  });

  it('长转录：先分块压缩再出结论，末次提示含分段摘要', async () => {
    const meeting = h.service.create({
      topic: '长会议',
      memberIds: TEST_MEMBERS.slice(0, 2).map((m) => m.id),
      mode: 'manual',
    });
    for (let i = 0; i < 14; i++) {
      h.service.submitTurn(meeting.id, `${i}:${'长内容'.repeat(600)}`);
    }
    h.service.finish(meeting.id);

    await h.service.generateConclusion(meeting.id);
    expect(h.completeCalls.length).toBeGreaterThan(1);
    expect(h.completeCalls[0]?.system).toContain('会议转录压缩助手');
    expect(h.completeCalls.at(-1)?.user).toContain('分段摘要');
    expect(h.service.getConclusion(meeting.id).conclusion?.summary).toBe('达成评审结论');
  });
});
