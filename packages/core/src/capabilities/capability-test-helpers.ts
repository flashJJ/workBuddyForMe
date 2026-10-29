import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';

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
