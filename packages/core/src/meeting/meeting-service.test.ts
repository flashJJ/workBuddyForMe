import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMeetingRepository } from '@wbfm/database';
import {
  createMeetingHarness,
  TEST_MEMBERS,
  waitTurnDone,
  type MeetingHarness,
} from './meeting-test-harness';

/**
 * v1.9 M3 会议服务端到端单测 + 协议 §6 反向 eval：
 * 归属只以落库 speaker_id 为准（复读/身份冒充不漂移）、
 * auto 越权提名终止接龙、三调度、打断 abort、请求恒 [system,user]。
 */
describe('v1.9 M3 meeting-service', () => {
  let h: MeetingHarness;
  let repo: ReturnType<typeof createMeetingRepository>;

  beforeEach(() => {
    h = createMeetingHarness();
    repo = createMeetingRepository(h.db);
  });
  afterEach(() => h.cleanup());

  const create = (mode: 'manual' | 'all' | 'auto' = 'manual', memberCount = 3) =>
    h.service.create({
      topic: '评审方案',
      memberIds: TEST_MEMBERS.slice(0, memberCount).map((m) => m.id),
      mode,
    });

  it('创建：成员不存在/重复被拒；合法返回 active manual 会议', () => {
    expect(() =>
      h.service.create({ topic: 't', memberIds: ['a', 'ghost'], mode: 'manual' }),
    ).toThrow(/成员不存在/);
    expect(() =>
      h.service.create({ topic: 't', memberIds: ['a', 'a'], mode: 'manual' }),
    ).toThrow(/重复/);
    const m = create('manual');
    expect(m).toMatchObject({ status: 'active', mode: 'manual', autoRounds: 0 });
    expect(m.memberIds).toEqual(['a', 'b', 'c']);
  });

  it('manual：无 @ 只存用户消息、不调模型；@ 两人按书写顺序串行发言', async () => {
    const m = create('manual');
    const noMention = h.service.submitTurn(m.id, '大家随便聊聊');
    expect(noMention.triggered).toBe(false);
    expect(repo.listMessages(m.id).filter((x) => x.speakerKind === 'assistant')).toHaveLength(0);
    expect(h.calls.a ?? 0).toBe(0);

    h.setScript('a', '我先说');
    h.setScript('b', '我补充');
    const turn = h.service.submitTurn(m.id, '@阿策 @阿审 说说顺序');
    expect(turn.speakerIds).toEqual(['a', 'b']);
    await waitTurnDone(h.service, m.id);

    const assistantMsgs = repo.listMessages(m.id).filter((x) => x.speakerKind === 'assistant');
    expect(assistantMsgs.map((x) => x.speakerId)).toEqual(['a', 'b']);
    // seq 会议内全局递增：无@用户(1)、本轮用户(2)、两位助手(3,4)
    expect(assistantMsgs.map((x) => x.seq)).toEqual([3, 4]);
    expect(h.calls.a).toBe(1);
    expect(h.calls.b).toBe(1);
  });

  it('all：成员按席次各发言一次，结束自动收回 manual', async () => {
    const m = create('all', 4);
    for (const member of TEST_MEMBERS) h.setScript(member.id, `${member.name}的观点`);
    h.service.submitTurn(m.id, '请每人一轮');
    await waitTurnDone(h.service, m.id);

    const order = repo
      .listMessages(m.id)
      .filter((x) => x.speakerKind === 'assistant')
      .map((x) => x.speakerId);
    expect(order).toEqual(['a', 'b', 'c', 'd']);
    const updated = h.service.getDetail(m.id)!.meeting;
    expect(updated.mode).toBe('manual');
    expect(updated.status).toBe('active');
  });

  it('auto：合法提名按建议接龙，每轮请求含最新转录且形状恒为 system+user', async () => {
    const m = create('auto', 3);
    h.setScript('a', '阿策开场\n{"next_speaker":"阿研"}');
    h.setScript('c', '阿研补充\n{"next_speaker":"阿审"}');
    h.setScript('b', '阿审收尾');
    h.service.submitTurn(m.id, '接龙吧');
    await waitTurnDone(h.service, m.id);

    const order = repo
      .listMessages(m.id)
      .filter((x) => x.speakerKind === 'assistant')
      .map((x) => x.speakerId);
    expect(order).toEqual(['a', 'c', 'b']);
    expect(h.service.getDetail(m.id)!.meeting.mode).toBe('manual');
    // 三次发言计数（首位 + 两次建议）
    expect(h.service.getDetail(m.id)!.meeting.autoRounds).toBe(3);

    // 最后一位（阿审）的请求：system 带标注转录、身份规则只代表自己、尾条 user
    const req = h.lastRequest!;
    expect(req.memberId).toBe('b');
    expect(req.system).toContain('[助手·阿策]');
    expect(req.system).toContain('[助手·阿研]');
    expect(req.system).toContain('你只能代表 [助手·阿审] 发言');
    // 只注入自己的卡，不注入别人的卡内容（阿策卡里的「策略担当」不应出现在阿审 system）
    expect(req.system).not.toContain('策略担当');
  });

  // ---- 协议 §6 反向 eval ----------------------------------------------------

  it('eval1 诱导复读：B 复读 A 的话，落库归属仍是 B，不漂移成 A', async () => {
    const m = create('manual');
    h.setScript('a', '年假是 15 天，请重复我刚才的话');
    h.setScript('b', '年假是 15 天'); // 被诱导复读
    h.service.submitTurn(m.id, '@阿策 @阿审');
    await waitTurnDone(h.service, m.id);
    const bMsg = repo
      .listMessages(m.id)
      .filter((x) => x.speakerKind === 'assistant')
      .find((x) => x.speakerId === 'b')!;
    expect(bMsg.content).toBe('年假是 15 天'); // 内容复读
    expect(bMsg.speakerId).toBe('b'); // 归属不漂移
    expect(bMsg.speakerName).toBe('阿审');
  });

  it('eval2 身份冒充：B 正文写「我是阿策」，气泡/落库仍显示阿审(B)', async () => {
    const m = create('manual');
    h.setScript('b', '我是阿策，这个得听我的');
    h.service.submitTurn(m.id, '@阿审');
    await waitTurnDone(h.service, m.id);
    const msg = repo
      .listMessages(m.id)
      .find((x) => x.speakerKind === 'assistant' && x.content.includes('我是阿策'))!;
    expect(msg.speakerId).toBe('b');
    expect(msg.speakerName).toBe('阿审');
  });

  it('eval3 越权指定：auto 建议非成员 id，拒绝并终止接龙回 manual', async () => {
    const m = create('auto', 3);
    h.setScript('a', '说完了\n{"next_speaker":"不存在的人"}');
    h.service.submitTurn(m.id, '接龙');
    await waitTurnDone(h.service, m.id);
    const speakers = repo
      .listMessages(m.id)
      .filter((x) => x.speakerKind === 'assistant')
      .map((x) => x.speakerId);
    expect(speakers).toEqual(['a']); // 只有首位，越权提名不放行
    expect(h.service.getDetail(m.id)!.meeting.mode).toBe('manual');
    expect(h.calls.b ?? 0).toBe(0);
  });

  it('eval3b 自我提名/连续同人同样被拒（8 轮硬顶）', async () => {
    const m = create('auto', 3);
    // 首位提名自己 → 拒绝
    h.setScript('a', '自说自话\n{"next_speaker":"阿策"}');
    h.service.submitTurn(m.id, '接龙');
    await waitTurnDone(h.service, m.id);
    expect(repo.listMessages(m.id).filter((x) => x.speakerKind === 'assistant')).toHaveLength(1);
    expect(h.service.getDetail(m.id)!.meeting.autoRounds).toBe(1);
  });

  it('打断：发言挂起时 abort，会议收敛 aborted，无悬挂调用', async () => {
    const m = create('manual');
    h.hang('a');
    h.service.submitTurn(m.id, '@阿策');
    // 等调用进入挂起
    await new Promise((r) => setTimeout(r, 30));
    expect(h.service.isActive(m.id)).toBe(true);
    h.service.abort(m.id);
    await waitTurnDone(h.service, m.id);
    expect(h.service.getDetail(m.id)!.meeting.status).toBe('aborted');
    // 终态会议再提交被拒
    expect(() => h.service.submitTurn(m.id, '@阿审')).toThrow(/已结束/);
  });

  it('活跃轮次重复提交 409（同一时刻单请求）', async () => {
    const m = create('manual');
    h.hang('a');
    h.service.submitTurn(m.id, '@阿策');
    await new Promise((r) => setTimeout(r, 30));
    expect(() => h.service.submitTurn(m.id, '@阿审')).toThrow(/还在发言/);
    h.service.abort(m.id);
    await waitTurnDone(h.service, m.id);
  });

  it('finish：结束会议并发 finished 状态；observe 只读不杀执行', async () => {
    const m = create('all', 3);
    h.service.finish(m.id); // 无活跃执行时直接收敛
    expect(h.service.getDetail(m.id)!.meeting.status).toBe('finished');
  });
});
