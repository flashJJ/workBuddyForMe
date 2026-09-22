import { describe, expect, it } from 'vitest';
import {
  assistantCreateSchema,
  chatRequestSchema,
  knowledgeBaseCreateSchema,
  modelCreateSchema,
  providerCreateSchema,
  providerTestSchema,
  providerUpdateSchema,
  settingsUpdateSchema,
} from '../index';

describe('provider schemas', () => {
  it('合法输入通过并填默认值', () => {
    const parsed = providerCreateSchema.parse({
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
    });
    expect(parsed.protocol).toBe('openai-compatible');
    // apiKey 缺省允许（本地无鉴权服务），默认空串
    expect(providerCreateSchema.parse({ name: 'local', baseUrl: 'http://127.0.0.1:11434' }).apiKey).toBe('');
  });

  it('非法 URL 被拒；空 Key 允许', () => {
    expect(providerCreateSchema.safeParse({ name: 'x', baseUrl: 'ftp://x', apiKey: 'k' }).success).toBe(false);
    expect(providerCreateSchema.safeParse({ name: 'x', baseUrl: 'https://x', apiKey: '' }).success).toBe(true);
  });

  it('更新体不允许空对象；apiKey 可缺省', () => {
    expect(providerUpdateSchema.safeParse({}).success).toBe(false);
    expect(providerUpdateSchema.parse({ enabled: false }).enabled).toBe(false);
  });

  it('连接测试支持 id 与临时配置两种形态', () => {
    expect(providerTestSchema.safeParse({ id: 'p1' }).success).toBe(true);
    expect(
      providerTestSchema.safeParse({ protocol: 'openai-compatible', baseUrl: 'https://x', apiKey: 'k' })
        .success,
    ).toBe(true);
  });
});

describe('model / assistant / settings schemas', () => {
  it('模型能力至少一种', () => {
    expect(modelCreateSchema.safeParse({ modelId: 'gpt', capabilities: [] }).success).toBe(false);
    expect(modelCreateSchema.parse({ modelId: 'gpt' }).capabilities).toEqual(['chat']);
  });

  it('助手采样参数范围校验与默认值', () => {
    const a = assistantCreateSchema.parse({ name: '助手' });
    expect(a.temperature).toBe(1);
    expect(a.topP).toBe(1);
    expect(assistantCreateSchema.safeParse({ name: 'x', temperature: 3 }).success).toBe(false);
    expect(assistantCreateSchema.safeParse({ name: 'x', color: 'red' }).success).toBe(false);
  });

  it('设置仅接受 zh-CN 与枚举主题', () => {
    expect(settingsUpdateSchema.safeParse({ theme: 'purple' }).success).toBe(false);
    expect(settingsUpdateSchema.parse({ theme: 'dark' }).theme).toBe('dark');
  });
});

describe('chat / knowledge schemas', () => {
  it('对话内容不得为空白', () => {
    expect(chatRequestSchema.safeParse({ assistantId: 'a', content: '   ' }).success).toBe(false);
    expect(chatRequestSchema.parse({ assistantId: 'a', content: '你好' }).content).toBe('你好');
  });

  it('v0.3：允许纯图片消息，缺省 content 收敛为空串，附件上限 4', () => {
    const pureImage = chatRequestSchema.parse({ assistantId: 'a', attachments: ['att_1'] });
    expect(pureImage.content).toBe('');
    expect(pureImage.attachments).toEqual(['att_1']);
    expect(
      chatRequestSchema.safeParse({
        assistantId: 'a',
        attachments: ['1', '2', '3', '4', '5'],
      }).success,
    ).toBe(false);
  });

  it('v0.3：vision 可作为模型能力', () => {
    const model = modelCreateSchema.parse({
      modelId: 'qwen2.5-vl',
      capabilities: ['chat', 'vision'],
    });
    expect(model.capabilities).toEqual(['chat', 'vision']);
  });

  it('知识库分片范围校验与默认值', () => {
    const kb = knowledgeBaseCreateSchema.parse({ name: 'kb' });
    expect(kb.chunkSize).toBe(500);
    expect(kb.chunkOverlap).toBe(80);
    expect(knowledgeBaseCreateSchema.safeParse({ name: 'kb', chunkSize: 10 }).success).toBe(false);
  });
});
