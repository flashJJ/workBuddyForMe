import { createHash, generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import {
  capabilityManifestSchema,
  capabilitySignaturePayload,
  type CapabilityTrustedKey,
} from '@wbfm/shared/schemas';

/** capability-service 单测共用的 ZIP / GLB 构造器 */

export function buildTestPack(
  manifest: Record<string, unknown>,
  files: Record<string, string>,
): Uint8Array {
  const zipFiles: Record<string, Uint8Array> = {
    'wbfm-capability.json': strToU8(JSON.stringify(manifest, null, 2)),
  };
  for (const [path, content] of Object.entries(files)) zipFiles[path] = strToU8(content);
  return zipSync(zipFiles);
}

export function buildTestMcpPack(): Uint8Array {
  const server = JSON.stringify({
    name: 'pack-mcp',
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
  });
  return buildTestPack(
    {
      id: 'com.test.mcp',
      version: '1.0.0',
      kind: 'mcp',
      name: '测试 MCP',
      description: '测试用 MCP 服务器',
      permissions: ['mcp:connect'],
      entry: 'payload/server.json',
      dependencies: [],
      checksums: { 'payload/server.json': hashOf(server) },
    },
    { 'payload/server.json': server },
  );
}

export function hashOf(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function ed25519Pair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return { privateKey, publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
}

export function trustedKey(id: string, publicKey: string): CapabilityTrustedKey {
  return { id, label: id, publicKey, createdAt: '2026-10-30T00:00:00.000Z' };
}

/** v2.12：带有效签名的技能包（清单按 schema 规范化后签名） */
export function buildSignedSkillPack(
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  keyId = 'local-dev',
): Uint8Array {
  const skill = JSON.stringify({ name: 'signed-demo', description: '签名技能' });
  const raw = {
    id: 'com.test.signed',
    version: '1.0.0',
    kind: 'skill',
    name: '签名技能',
    description: '验签测试包',
    permissions: ['skill:install'],
    entry: 'payload/skill.json',
    dependencies: [],
    checksums: { 'payload/skill.json': hashOf(skill) },
    signatureKeyId: keyId,
  };
  const manifest = capabilityManifestSchema.parse(raw);
  const signature = cryptoSign(
    null,
    Buffer.from(capabilitySignaturePayload(manifest)),
    privateKey,
  ).toString('base64');
  return buildTestPack({ ...raw, signature }, { 'payload/skill.json': skill });
}

export function buildFakeVrma(): Uint8Array {
  return buildFakeGlb({
    extensionsUsed: ['VRMC_vrm_animation'],
    extensions: { VRMC_vrm_animation: { specVersion: '1.0' } },
  });
}

function buildFakeGlb(extra: { extensionsUsed?: string[]; extensions?: unknown }): Uint8Array {
  const json = JSON.stringify({ asset: { version: '2.0' }, ...extra });
  const jsonBytes = new TextEncoder().encode(json);
  const total = 20 + jsonBytes.length;
  const buf = new ArrayBuffer(total);
  const dv = new DataView(buf);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonBytes.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(buf).set(jsonBytes, 20);
  return new Uint8Array(buf);
}
