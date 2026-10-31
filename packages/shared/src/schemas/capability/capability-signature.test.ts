import { describe, expect, it } from 'vitest';
import { capabilityManifestSchema } from './capability';
import { canonicalizeCapabilityManifest, capabilitySignaturePayload } from './capability-signature';

function parse(raw: Record<string, unknown>) {
  return capabilityManifestSchema.parse(raw);
}

const FULL = {
  id: 'com.example.sign',
  version: '1.2.3',
  kind: 'skill',
  name: '签名技能',
  description: '用于 canonical 测试',
  permissions: ['skill:install'],
  entry: 'payload/skill.json',
  dependencies: [{ id: 'com.example.base', version: '1.0.0' }],
  checksums: { 'payload/skill.json': 'a'.repeat(64) },
};

describe('v2.12 能力包清单 canonical 序列化', () => {
  it('键顺序不同的等价清单，规范化结果一致', () => {
    const reordered = {
      checksums: FULL.checksums,
      entry: FULL.entry,
      kind: FULL.kind,
      name: FULL.name,
      permissions: FULL.permissions,
      dependencies: FULL.dependencies,
      description: FULL.description,
      version: FULL.version,
      id: FULL.id,
    };
    expect(canonicalizeCapabilityManifest(parse(reordered))).toBe(
      canonicalizeCapabilityManifest(parse(FULL)),
    );
  });

  it('schema 默认值在签名前已补齐：省略字段与显式空值一致', () => {
    const minimal = {
      id: 'com.example.sign',
      version: '1.2.3',
      kind: 'skill',
      name: '签名技能',
      entry: 'payload/skill.json',
    };
    const explicit = {
      ...minimal,
      description: '',
      permissions: [],
      dependencies: [],
      checksums: {},
    };
    expect(canonicalizeCapabilityManifest(parse(minimal))).toBe(
      canonicalizeCapabilityManifest(parse(explicit)),
    );
  });

  it('signature 不参与规范化，signatureKeyId 参与', () => {
    const base = canonicalizeCapabilityManifest(parse(FULL));
    const signed = canonicalizeCapabilityManifest(
      parse({ ...FULL, signature: 'c2l4dHk=', signatureKeyId: 'local-dev' }),
    );
    expect(signed).not.toBe(base);
    const signedAgain = canonicalizeCapabilityManifest(
      parse({ ...FULL, signature: 'b3RoZXI=', signatureKeyId: 'local-dev' }),
    );
    expect(signedAgain).toBe(signed);
  });

  it('Unicode、引号与反斜杠保持 JSON 转义', () => {
    const manifest = parse({ ...FULL, description: '中文 "引号" \\ 反斜杠 🙃' });
    const canonical = canonicalizeCapabilityManifest(manifest);
    expect(canonical).toContain('中文 \\"引号\\" \\\\ 反斜杠 🙃');
  });

  it('签名输入带固定域前缀', () => {
    const manifest = parse(FULL);
    expect(capabilitySignaturePayload(manifest)).toBe(
      `capability-manifest-v1\n${canonicalizeCapabilityManifest(manifest)}`,
    );
  });

  it('改任一业务字段都会改变规范化结果', () => {
    const base = canonicalizeCapabilityManifest(parse(FULL));
    expect(canonicalizeCapabilityManifest(parse({ ...FULL, version: '1.2.4' }))).not.toBe(base);
    expect(canonicalizeCapabilityManifest(parse({ ...FULL, name: '另一个名字' }))).not.toBe(base);
    expect(
      canonicalizeCapabilityManifest(parse({ ...FULL, checksums: { 'payload/skill.json': 'b'.repeat(64) } })),
    ).not.toBe(base);
  });
});
