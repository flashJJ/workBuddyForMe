import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDatabase,
  createModelRepository,
  createProviderRepository,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import { createAssistantsService } from '../services/assistant-service';
import { createSettingsService } from '../services/settings-service';
import { createSkillService, type SkillService } from '../skills/skill-service';
import { createChatOrchestrator } from './chat-orchestrator';
import type { OrchestratorEvent } from './types';

const ANSWER_SSE =
  'data: {"choices":[{"delta":{"content":"好的"}}]}\n\n' +
  'data: {"choices":[{"delta":{}}],"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}\n\n' +
  'data: [DONE]\n\n';

async function drain(generator: AsyncGenerator<OrchestratorEvent>) {
  const events: OrchestratorEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

function writeSkill(skillsDir: string, manifest: Record<string, unknown>): void {
  const dir = join(skillsDir, String(manifest.name));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'skill.json'), JSON.stringify(manifest));
}

describe('对话编排：技能注入（v0.6 M3）', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;
  let skillsDir: string;
  let skills: SkillService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-t15skills-'));
    setDataRootForTest(tempRoot);
    skillsDir = join(tempRoot, 'skills');
    db = createDatabase(':memory:');
    cipher = createWebCipher();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const providers = createProviderRepository(db);
    const models = createModelRepository(db);
    const provider = providers.create({
      name: '测试供应',
      protocol: 'openai-compatible',
      baseUrl: 'https://api.example.com/v1',
      apiKeyCipher: '',
      enabled: true,
      sortOrder: 0,
    });
    const model = models.create({
      providerId: provider.id,
      modelId: 'gpt-test',
      displayName: '测试模型',
      capabilities: ['chat'],
      contextWindow: 4096,
    });
    createSettingsService({ db, cipher }).update({ defaultChatModelId: model.id });
    // 聚焦技能注入：关闭长期记忆，避免回合后提取额外占用 fetch mock 队列
    const assistants = createAssistantsService({ db, cipher });
    assistants.update(assistants.list()[0]!.id, { memoryEnabled: false });
    // 测试自己投放技能文件夹，不播种内置示例
    skills = createSkillService({ db }, { skillsDir, seedBuiltins: false });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    db.close();
    resetDataRootForTest();
  });

  function firstRequestBody() {
    return JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
  }

  it('启用技能：system 注入提示词模板，预绑定工具并入 tools 声明', async () => {
    writeSkill(skillsDir, {
      name: 'weekly-report',
      description: '周报生成',
      promptTemplates: [{ name: '流程', order: 0, content: '按四段结构输出周报' }],
      allowedTools: ['current_time'],
    });
    skills.reconcile();
    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    fetchMock.mockResolvedValue(
      new Response(ANSWER_SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );

    const events = await drain(
      createChatOrchestrator({ db, cipher, skills }).streamChat({
        assistantId: assistant.id,
        content: '帮我写周报',
      }),
    );
    expect(events.at(-1)!.event).toBe('done');

    const body = firstRequestBody();
    const system = body.messages[0]!;
    expect(system.role).toBe('system');
    expect(system.content).toContain('【技能：weekly-report】');
    expect(system.content).toContain('按四段结构输出周报');
    // 助手白名单为空，技能预绑定工具并入后仍下发声明
    expect(body.tools.map((t: { function: { name: string } }) => t.function.name)).toEqual([
      'current_time',
    ]);
  });

  it('停用技能后不再注入模板与工具；无技能服务时行为与旧版一致', async () => {
    writeSkill(skillsDir, {
      name: 'weekly-report',
      description: '周报生成',
      promptTemplates: [{ name: '流程', order: 0, content: '按四段结构输出周报' }],
      allowedTools: ['current_time'],
    });
    skills.reconcile();
    const target = skills.list()[0]!;
    skills.setEnabled(target.id, false);

    const assistant = createAssistantsService({ db, cipher }).list()[0]!;
    fetchMock.mockResolvedValue(
      new Response(ANSWER_SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    await drain(
      createChatOrchestrator({ db, cipher, skills }).streamChat({
        assistantId: assistant.id,
        content: 'hi',
      }),
    );
    let body = firstRequestBody();
    expect(body.messages[0]!.content).not.toContain('【技能：');
    expect(body.tools).toBeUndefined();

    // 无 skills 依赖（旧容器）：同样不注入
    fetchMock.mockResolvedValue(
      new Response(ANSWER_SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    );
    await drain(
      createChatOrchestrator({ db, cipher }).streamChat({
        assistantId: assistant.id,
        content: 'hi',
      }),
    );
    body = JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string);
    expect(body.messages[0]!.content).not.toContain('【技能：');
    expect(body.tools).toBeUndefined();
  });
});
