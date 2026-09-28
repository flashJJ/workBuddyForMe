import { describe, expect, it } from 'vitest';
import {
  assistantCreateSchema,
  buildMcpToolName,
  chatRequestSchema,
  isMcpToolName,
  knowledgeBaseCreateSchema,
  mcpServerCreateSchema,
  mcpServerUpdateSchema,
  modelCreateSchema,
  parseMcpToolName,
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

describe('mcp server schemas (v0.6)', () => {
  it('stdio 创建：args/env 填默认值，enabled 可选', () => {
    const parsed = mcpServerCreateSchema.parse({
      transport: 'stdio',
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', 'D:/docs'],
    });
    if (parsed.transport !== 'stdio') throw new Error('unreachable');
    expect(parsed.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', 'D:/docs']);
    expect(parsed.env).toEqual({});
    expect(parsed.enabled).toBeUndefined();
  });

  it('服务器名即命名空间：必须标识符安全', () => {
    expect(mcpServerCreateSchema.safeParse({ transport: 'stdio', name: 'fs1', command: 'x' }).success).toBe(true);
    expect(mcpServerCreateSchema.safeParse({ transport: 'stdio', name: 'my_fs-2', command: 'x' }).success).toBe(true);
    // 中文/空格/点号会破坏 mcp:<server>:<tool> 命名空间，拒绝
    expect(mcpServerCreateSchema.safeParse({ transport: 'stdio', name: '文件系统', command: 'x' }).success).toBe(false);
    expect(mcpServerCreateSchema.safeParse({ transport: 'stdio', name: 'a b', command: 'x' }).success).toBe(false);
    expect(mcpServerCreateSchema.safeParse({ transport: 'stdio', name: '-lead', command: 'x' }).success).toBe(false);
  });

  it('stdio 必须带 command；http 分支校验 url（M2 预留）', () => {
    expect(mcpServerCreateSchema.safeParse({ transport: 'stdio', name: 'fs' }).success).toBe(false);
    const http = mcpServerCreateSchema.safeParse({
      transport: 'http',
      name: 'remote',
      url: 'https://mcp.example.com/mcp',
    });
    expect(http.success).toBe(true);
    expect(
      mcpServerCreateSchema.safeParse({ transport: 'http', name: 'remote', url: 'ftp://x' }).success,
    ).toBe(false);
  });

  it('更新体必须带 transport 且至少一个更新字段', () => {
    expect(mcpServerUpdateSchema.safeParse({}).success).toBe(false);
    expect(mcpServerUpdateSchema.safeParse({ transport: 'stdio' }).success).toBe(false);
    const parsed = mcpServerUpdateSchema.parse({ transport: 'stdio', enabled: false });
    expect(parsed.enabled).toBe(false);
    // 允许跨 transport 改配（如 stdio 改 http）
    expect(
      mcpServerUpdateSchema.safeParse({ transport: 'http', url: 'http://127.0.0.1:9000/mcp' }).success,
    ).toBe(true);
  });

  it('助手 enabledTools 接受 MCP 限定名，拒绝非法格式', () => {
    const withMcp = assistantCreateSchema.parse({
      name: 'a',
      enabledTools: ['current_time', 'mcp:filesystem:search_files'],
    });
    expect(withMcp.enabledTools).toContain('mcp:filesystem:search_files');
    expect(assistantCreateSchema.safeParse({ name: 'a', enabledTools: ['mcp:fs'] }).success).toBe(false);
    expect(assistantCreateSchema.safeParse({ name: 'a', enabledTools: ['bad name!'] }).success).toBe(false);
    // 上限仍为 10
    expect(
      assistantCreateSchema.safeParse({ name: 'a', enabledTools: Array.from({ length: 11 }, (_, i) => `t${i}`) })
        .success,
    ).toBe(false);
  });

  it('命名空间工具名构建与解析往返', () => {
    const qualified = buildMcpToolName('filesystem', 'search_files');
    expect(qualified).toBe('mcp:filesystem:search_files');
    expect(isMcpToolName(qualified)).toBe(true);
    expect(isMcpToolName('current_time')).toBe(false);
    expect(parseMcpToolName(qualified)).toEqual({ serverName: 'filesystem', toolName: 'search_files' });
    // 非 mcp 前缀 / 段数不符 / 空段均不可解析
    expect(parseMcpToolName('current_time')).toBeNull();
    expect(parseMcpToolName('mcp:only-server')).toBeNull();
    expect(parseMcpToolName('mcp:fs:too:many')).toBeNull();
  });
});
