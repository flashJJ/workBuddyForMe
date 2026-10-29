import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { ApiError } from '@wbfm/shared/errors';
import type { CapabilityKind, CapabilityManifest } from '@wbfm/shared/schemas';
import { CAPABILITY_MANIFEST_FILE } from './manifest';

/** v2.11：六类示例/模板包（下载与测试共用） */

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface SamplePackFile {
  path: string;
  bytes: Uint8Array;
}

function buildPack(
  manifest: Omit<CapabilityManifest, 'checksums'>,
  files: SamplePackFile[],
): Uint8Array {
  const zipFiles: Record<string, Uint8Array> = {};
  const checksums: Record<string, string> = {};
  for (const file of files) {
    zipFiles[file.path] = file.bytes;
    checksums[file.path] = sha256(file.bytes);
  }
  zipFiles[CAPABILITY_MANIFEST_FILE] = strToU8(
    JSON.stringify({ ...manifest, checksums }, null, 2),
  );
  return zipSync(zipFiles);
}

/** 生成示例技能包（保留旧名，兼容既有测试/下载） */
export function buildSampleSkillPack(): Uint8Array {
  const skill = {
    name: 'capability-demo',
    description: '能力包示例技能：需要当前时间时先查本机时钟',
    version: '1.0.0',
    permissions: ['read'],
    promptTemplates: [
      {
        name: 'demo',
        order: 0,
        content: '当用户询问当前时间或日期时，先调用 current_time，再给出本地时间。',
      },
    ],
    allowedTools: ['current_time'],
    examples: [
      { title: '现在几点', userQuery: '现在几点？', expectedBehavior: '调用 current_time 后回答' },
    ],
  };
  return buildPack(
    {
      id: 'com.wbfm.sample.capability-demo',
      version: '1.0.0',
      kind: 'skill',
      name: '能力包示例技能',
      description: '安装后出现一个可用 current_time 的示例技能；停用即移除。',
      permissions: ['skill:install'],
      entry: 'payload/skill.json',
      dependencies: [],
    },
    [{ path: 'payload/skill.json', bytes: strToU8(JSON.stringify(skill, null, 2)) }],
  );
}

function sampleWorkflowPayload(): Uint8Array {
  return strToU8(
    JSON.stringify(
      {
        name: '示例：一页摘要',
        description: '输入一个主题，生成一段简短摘要后输出。',
        icon: 'sparkles',
        color: 'indigo',
        graph: {
          nodes: [
            {
              id: 'start',
              type: 'start',
              position: { x: 0, y: 0 },
              config: {
                label: '开始',
                inputs: [
                  { name: 'topic', type: 'string', required: true, description: '要总结的主题' },
                ],
              },
            },
            {
              id: 'draft',
              type: 'llm',
              position: { x: 280, y: 0 },
              config: {
                label: '生成摘要',
                modelId: '',
                system: '你是简洁的写作助手，只输出摘要正文。',
                user: '请用三句话总结：{{$nodes.start.params.topic}}',
              },
            },
            {
              id: 'end',
              type: 'end',
              position: { x: 560, y: 0 },
              config: { label: '输出', output: '{{$nodes.draft.outputs.text}}' },
            },
          ],
          edges: [
            { id: 'e_start_draft', source: 'start', target: 'draft' },
            { id: 'e_draft_end', source: 'draft', target: 'end' },
          ],
        },
      },
      null,
      2,
    ),
  );
}

function samplePetActionPayload(motionAsset: Uint8Array | undefined): SamplePackFile[] {
  if (!motionAsset) throw ApiError.validation('示例动作素材缺失');
  const action = {
    name: '示例：打招呼',
    file: 'payload/sample.vrma',
    segment: 'single',
    mood: 'good',
  };
  return [
    { path: 'payload/action.json', bytes: strToU8(JSON.stringify(action, null, 2)) },
    { path: 'payload/sample.vrma', bytes: motionAsset },
  ];
}

function sampleEventScriptPayload(): Uint8Array {
  return strToU8(
    JSON.stringify(
      {
        definition: {
          id: 'usr.goodnight',
          title: '晚安小仪式',
          priority: 1,
          interruptPolicy: 'ignore',
          cooldownMs: 3600000,
          maxPerDay: 2,
          speechLock: 'queue',
          steps: [
            { kind: 'expression', tag: 'joy' },
            { kind: 'speech', text: '今天也辛苦了，早点休息。' },
            { kind: 'fx', id: 'sparkle' },
          ],
        },
        trigger: { kind: 'phrase', phrases: ['晚安', '睡觉了'] },
      },
      null,
      2,
    ),
  );
}

function sampleReportWidgetPayload(): Uint8Array {
  return strToU8(
    JSON.stringify(
      {
        title: '近 30 天任务成功率',
        chain: 'task',
        metric: 'success_rate',
        windowDays: 30,
      },
      null,
      2,
    ),
  );
}

function sampleMcpTemplate(): Uint8Array {
  const server = {
    name: '示例 MCP（模板）',
    transport: 'http',
    url: '',
  };
  const readme = [
    '# MCP 能力包模板',
    '',
    '请把 payload/server.json 中的 url 替换为可用的 MCP HTTP 端点，',
    '补齐清单 checksums 后重新打包安装。',
    '模板包不会自动连接，直接安装会因端点缺失被拒绝（422）。',
  ].join('\n');
  return buildPack(
    {
      id: 'com.example.sample.mcp-template',
      version: '1.0.0',
      kind: 'mcp',
      name: '示例 MCP（模板）',
      description: '模板包：需替换端点后重新打包，不宣称可连。',
      permissions: ['mcp:connect'],
      entry: 'payload/server.json',
      dependencies: [],
    },
    [
      { path: 'payload/server.json', bytes: strToU8(JSON.stringify(server, null, 2)) },
      { path: 'payload/README.md', bytes: strToU8(readme) },
    ],
  );
}

/**
 * 生成示例包：六类均返回 ZIP；mcp 为模板包。
 * pet-action 需要注入内置 VRMA；缺失时返回 422。
 */
export function buildSamplePack(
  kind: CapabilityKind,
  options: { motionAsset?: Uint8Array } = {},
): Uint8Array {
  if (kind === 'skill') return buildSampleSkillPack();
  if (kind === 'workflow') {
    return buildPack(
      {
        id: 'com.example.sample.workflow',
        version: '1.0.0',
        kind: 'workflow',
        name: '示例工作流：一页摘要',
        description: '安装后立即发布，可在工作流列表试运行；停用后保留运行历史。',
        permissions: ['workflow:install'],
        entry: 'payload/workflow.json',
        dependencies: [],
      },
      [{ path: 'payload/workflow.json', bytes: sampleWorkflowPayload() }],
    );
  }
  if (kind === 'pet-action') {
    return buildPack(
      {
        id: 'com.example.sample.pet-action',
        version: '1.0.0',
        kind: 'pet-action',
        name: '示例动作：打招呼',
        description: '安装后进入动作池；停用即移除。',
        permissions: ['pet:action'],
        entry: 'payload/action.json',
        dependencies: [],
      },
      samplePetActionPayload(options.motionAsset),
    );
  }
  if (kind === 'event-script') {
    return buildPack(
      {
        id: 'com.example.sample.event-script',
        version: '1.0.0',
        kind: 'event-script',
        name: '示例剧本：晚安小仪式',
        description: '安装后短语触发剧本；停用后不再触发。',
        permissions: ['events:write'],
        entry: 'payload/script.json',
        dependencies: [],
      },
      [{ path: 'payload/script.json', bytes: sampleEventScriptPayload() }],
    );
  }
  if (kind === 'report-widget') {
    return buildPack(
      {
        id: 'com.example.sample.report-widget',
        version: '1.0.0',
        kind: 'report-widget',
        name: '示例卡片：任务成功率',
        description: '安装后报告页出现卡片；停用即移除。',
        permissions: ['report:widget'],
        entry: 'payload/widget.json',
        dependencies: [],
      },
      [{ path: 'payload/widget.json', bytes: sampleReportWidgetPayload() }],
    );
  }
  return sampleMcpTemplate();
}
