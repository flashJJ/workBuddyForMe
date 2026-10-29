import { createHash } from 'node:crypto';
import { unzipSync, strFromU8, strToU8, zipSync } from 'fflate';
import { ApiError } from '@wbfm/shared/errors';
import {
  CAPABILITY_REQUIRED_PERMISSION,
  CAPABILITY_SUPPORTED_KINDS,
  capabilityManifestSchema,
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
  if (manifest.kind === 'skill' && manifest.entry !== 'payload/skill.json') {
    throw ApiError.validation('skill 能力包的 entry 必须为 payload/skill.json');
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

  return { manifest, files };
}

/** 生成示例技能包（测试/下载示例共用） */
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
  const skillBytes = strToU8(JSON.stringify(skill, null, 2));
  const manifest = {
    id: 'com.wbfm.sample.capability-demo',
    version: '1.0.0',
    kind: 'skill',
    name: '能力包示例技能',
    description: '安装后出现一个可用 current_time 的示例技能；停用即移除。',
    permissions: ['skill:install'],
    entry: 'payload/skill.json',
    dependencies: [],
    checksums: { 'payload/skill.json': sha256(skillBytes) },
  };
  return zipSync({
    [CAPABILITY_MANIFEST_FILE]: strToU8(JSON.stringify(manifest, null, 2)),
    'payload/skill.json': skillBytes,
  });
}
