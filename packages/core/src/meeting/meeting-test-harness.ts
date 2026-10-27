/**
 * v1.9 M3 会议域测试夹具：内存 DB + 脚本化发言客户端。
 * 仅供测试：speaker 按成员 id 路由脚本返回内容/挂起，
 * 模拟复读、身份冒充、越权提名与打断。
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createMeetingService } from './meeting-service';
import type { MeetingService, MeetingServiceDeps, MeetingSpeaker } from './meeting-types';

export interface TestMember {
  id: string;
  name: string;
}

export const TEST_MEMBERS: TestMember[] = [
  { id: 'a', name: '阿策' },
  { id: 'b', name: '阿审' },
  { id: 'c', name: '阿研' },
  { id: 'd', name: '阿品' },
];

/** 等待 service 后台执行结束（active 清空） */
export async function waitTurnDone(service: MeetingService, meetingId: string): Promise<void> {
  const deadline = Date.now() + 5000;
  while (service.isActive(meetingId) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
  }
  if (service.isActive(meetingId)) throw new Error('会议轮次未在 5s 内结束');
}

export interface LastRequest {
  memberId: string;
  system: string;
  userContent: string;
}

export interface MeetingHarness {
  db: DatabaseInstance;
  service: MeetingService;
  cleanup: () => void;
  setScript: (memberId: string, content: string | ((call: number) => string)) => void;
  /** v2.6：设置结论生成返回（默认合法 JSON） */
  setConclusionResponse: (content: string | ((call: number) => string)) => void;
  hang: (memberId: string) => void;
  calls: Record<string, number>;
  completeCalls: Array<{ system: string; user: string }>;
  lastRequest: LastRequest | null;
}

export function createMeetingHarness(): MeetingHarness {
  const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-meeting-'));
  setDataRootForTest(tempRoot);
  const db = createDatabase(':memory:');

  const scripts = new Map<string, (call: number) => string>();
  const hangers = new Set<string>();
  const calls: Record<string, number> = {};
  const completeCalls: Array<{ system: string; user: string }> = [];
  const state: { lastRequest: LastRequest | null } = { lastRequest: null };
  const defaultConclusion = JSON.stringify({
    summary: '达成评审结论',
    decisions: ['采用方案 A'],
    openQuestions: [],
    actionItems: [
      { content: '补充测试', ownerLabel: '阿策', ownerMemberId: 'a', dueAt: null },
    ],
  });
  let conclusionResponse: (call: number) => string = () => defaultConclusion;

  const deps: MeetingServiceDeps = {
    db,
    resolveTarget: () =>
      ({ provider: {}, model: { id: 'mock-model', modelId: 'mock' } }) as never,
    createSpeaker: (_target, memberId): MeetingSpeaker => ({
      async speak(params) {
        calls[memberId] = (calls[memberId] ?? 0) + 1;
        state.lastRequest = { memberId, system: params.system, userContent: params.userContent };
        if (hangers.has(memberId)) {
          await new Promise<void>((resolve) => {
            params.signal?.addEventListener('abort', () => resolve());
          });
          throw new Error('aborted');
        }
        const content = (scripts.get(memberId) ?? (() => '默认观点'))(calls[memberId]!);
        params.onDelta?.(content.slice(0, 1));
        await Promise.resolve();
        params.onDelta?.(content);
        return { content };
      },
    }),
    complete: async (_target, params) => {
      completeCalls.push({ system: params.system, user: params.user });
      if (params.system.includes('会议转录压缩助手')) {
        return `压缩片段 ${completeCalls.length}`;
      }
      return conclusionResponse(completeCalls.length);
    },
    getMemberName: (id) => TEST_MEMBERS.find((m) => m.id === id)?.name ?? null,
    getPersonaBlock: (id) => (id === 'a' ? '【角色卡】\n你是策略担当' : null),
  };

  return {
    db,
    service: createMeetingService(deps),
    cleanup: () => {
      db.close();
      resetDataRootForTest();
    },
    setScript: (memberId, content) => {
      scripts.set(memberId, typeof content === 'function' ? content : () => content);
    },
    setConclusionResponse: (content) => {
      conclusionResponse = typeof content === 'function' ? content : () => content;
    },
    hang: (memberId) => hangers.add(memberId),
    calls,
    completeCalls,
    get lastRequest() {
      return state.lastRequest;
    },
  };
}
