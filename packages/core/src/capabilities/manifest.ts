import { createHash } from 'node:crypto';
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import { ApiError } from '@wbfm/shared/errors';
import {
  CAPABILITY_ENTRY_BY_KIND,
  CAPABILITY_REQUIRED_PERMISSION,
  CAPABILITY_SUPPORTED_KINDS,
  capabilityManifestSchema,
  type CapabilityKind,
  type CapabilityManifest,
} from '@wbfm/shared/schemas';

/** v2.10 能力包 ZIP 解析与校验（纯函数，服务层只做落盘与 effect） */

export const CAPABILITY_MANIFEST_FILE = 'wbfm-capability.json';

export interface ParsedCapability {
  manifest: CapabilityManifest;
  files: Record<string, Uint8Array>;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertSafePath(path: string): void {
  if (
    path.includes('\\') ||
    path.includes('\0') ||
    path.includes(':') ||
    path.startsWith('/') ||
    path.split('/').includes('..')
  ) {
    throw ApiError.validation(`能力包包含非法路径：${path}`);
  }
}

export function parseCapabilityZip(buffer: Uint8Array): ParsedCapability {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer);
  } catch {
    throw ApiError.validation('能力包不是有效的 ZIP');
  }

  const manifestRaw = files[CAPABILITY_MANIFEST_FILE];
  if (!manifestRaw) throw ApiError.validation(`缺少 ${CAPABILITY_MANIFEST_FILE}`);

  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(manifestRaw));
  } catch {
    throw ApiError.validation(`${CAPABILITY_MANIFEST_FILE} 不是合法 JSON`);
  }
  const parsed = capabilityManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `能力包清单校验失败：${parsed.error.issues.map((i) => i.message).join('；')}`,
    );
  }
  const manifest = parsed.data;

  if (!CAPABILITY_SUPPORTED_KINDS.includes(manifest.kind)) {
    throw ApiError.validation(`该能力类型尚未接入：${manifest.kind}`);
  }
  const required = CAPABILITY_REQUIRED_PERMISSION[manifest.kind];
  if (!manifest.permissions.includes(required)) {
    throw ApiError.validation(`缺少必需权限：${required}`);
  }
  if (manifest.entry !== CAPABILITY_ENTRY_BY_KIND[manifest.kind]) {
    throw ApiError.validation(
      `${manifest.kind} 能力包的 entry 必须为 ${CAPABILITY_ENTRY_BY_KIND[manifest.kind]}`,
    );
  }

  for (const key of Object.keys(files)) {
    if (key === CAPABILITY_MANIFEST_FILE) continue;
    assertSafePath(key);
    if (!key.startsWith('payload/')) {
      throw ApiError.validation(`能力包根目录只允许 ${CAPABILITY_MANIFEST_FILE} 与 payload/**`);
    }
  }

  const payloadFiles = Object.keys(files).filter(
    (key) => key.startsWith('payload/') && !key.endsWith('/'),
  );
  if (!payloadFiles.includes(manifest.entry)) {
    throw ApiError.validation(`entry 指向的文件不存在：${manifest.entry}`);
  }
  for (const file of payloadFiles) {
    const expected = manifest.checksums[file];
    if (!expected) throw ApiError.validation(`checksums 缺少文件：${file}`);
    if (sha256(files[file]!) !== expected) {
      throw ApiError.validation(`校验和不匹配：${file}`);
    }
  }
  const extra = Object.keys(manifest.checksums).filter((file) => !payloadFiles.includes(file));
  if (extra.length > 0) throw ApiError.validation(`checksums 声明了不存在的文件：${extra.join(', ')}`);

  const entryLimit = ENTRY_SIZE_LIMITS[manifest.kind];
  if (entryLimit && files[manifest.entry]!.byteLength > entryLimit) {
    throw ApiError.validation(`entry 文件超过大小上限：${manifest.entry}`);
  }
  if (manifest.kind === 'pet-action') {
    for (const file of payloadFiles) {
      if (file.toLowerCase().endsWith('.vrma') && files[file]!.byteLength > MOTION_MAX_BYTES) {
        throw ApiError.validation(`动作文件超过 10MB 上限：${file}`);
      }
    }
  }

  return { manifest, files };
}

/** 每类 payload 主文件的体积上限（VRMA 单独按动作文件上限） */
const ENTRY_SIZE_LIMITS: Partial<Record<CapabilityKind, number>> = {
  workflow: 256 * 1024,
  'pet-action': 32 * 1024,
};

const MOTION_MAX_BYTES = 10 * 1024 * 1024;

interface SamplePackFile {
  path: string;
  bytes: Uint8Array;
}

function buildPack(
  manifest: Omit<CapabilityManifest, 'checksums'>,
  files: SamplePackFile[],
): Uint8Array {
  const zipFiles: Record<string, Uint8Array> = {
    [CAPABILITY_MANIFEST_FILE]: strToU8(JSON.stringify(manifest, null, 2)),
  };
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

/** 生成示例技能包（测试/下载示例共用；保留旧名） */
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

/**
 * 生成示例包：v2.11 M1 支持 skill / workflow / pet-action。
 * 其余 kind 在各自里程碑接入；提前请求返回 422 而不是伪造可用示例。
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
  throw ApiError.validation(`该能力类型的示例尚未提供：${kind}`);
}
