import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * v2.12 能力包清单签名工具（作者侧，不参与运行时）。
 *
 * 用法：
 *   node scripts/sign-capability.mjs --manifest <path> --key <private.pem> [--key-id <id>] [--write]
 *
 * 约束：canonical 实现只来自 @wbfm/shared 构建产物，禁止在此复制第二份逻辑。
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sharedDist = resolve(repoRoot, 'packages/shared/dist/index.mjs');

function fail(message) {
  console.error(`[sign-capability] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--write') {
      args.write = true;
    } else if (item === '--manifest' || item === '--key' || item === '--key-id') {
      const value = argv[index + 1];
      if (!value) fail(`缺少 ${item} 的值`);
      args[item === '--manifest' ? 'manifest' : item === '--key' ? 'key' : 'keyId'] = value;
      index += 1;
    } else {
      fail(`未知参数：${item}`);
    }
  }
  if (!args.manifest) fail('缺少 --manifest');
  if (!args.key) fail('缺少 --key');
  return args;
}

if (!existsSync(sharedDist)) {
  fail('缺少 packages/shared/dist，请先执行 pnpm --filter @wbfm/shared build');
}
const shared = await import(pathToFileURL(sharedDist).href);
if (
  typeof shared.capabilityManifestSchema?.parse !== 'function' ||
  typeof shared.capabilitySignaturePayload !== 'function'
) {
  fail('shared 构建产物过旧，请先执行 pnpm --filter @wbfm/shared build');
}

const args = parseArgs(process.argv.slice(2));

let raw;
try {
  raw = JSON.parse(readFileSync(args.manifest, 'utf8'));
} catch (error) {
  fail(`清单不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
}

const withKeyId = args.keyId ? { ...raw, signatureKeyId: args.keyId } : raw;
const parsed = shared.capabilityManifestSchema.safeParse(withKeyId);
if (!parsed.success) {
  fail(
    `清单校验失败：${parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'} ${issue.message}`)
      .join('；')}`,
  );
}

let privateKey;
try {
  privateKey = createPrivateKey(readFileSync(args.key, 'utf8'));
} catch (error) {
  fail(`私钥不可用：${error instanceof Error ? error.message : String(error)}`);
}
if (privateKey.asymmetricKeyType !== 'ed25519') {
  fail('私钥必须是 Ed25519（生成的签名需与信任库中的 Ed25519 公钥配对）');
}

const payload = shared.capabilitySignaturePayload(parsed.data);
const signature = sign(null, Buffer.from(payload, 'utf8'), privateKey).toString('base64');
const signed = {
  ...withKeyId,
  ...(args.keyId ? { signatureKeyId: args.keyId } : {}),
  signature,
};

if (args.write) {
  writeFileSync(args.manifest, `${JSON.stringify(signed, null, 2)}\n`, 'utf8');
  console.log(`[sign-capability] 已写入 signature${args.keyId ? `（keyId=${args.keyId}）` : ''}`);
} else {
  console.log(JSON.stringify({ signatureKeyId: signed.signatureKeyId, signature }, null, 2));
}
