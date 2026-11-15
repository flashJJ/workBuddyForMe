#!/usr/bin/env node
/**
 * 统一内置 VRM 的 VRM0 meta 许可字段。
 *
 * 只重写 GLB 的 JSON chunk，BIN chunk 原样保留；写入前备份到 .tmp/vrm-meta-backup/。
 * 用法：
 *   node scripts/avatar/normalize-vrm-meta.mjs --check
 *   node scripts/avatar/normalize-vrm-meta.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const MODELS = ['xuetuan', 'rankaluli', 'feibi'];
const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
const MAGIC = 0x46546c67;
const JSON_TYPE = 0x4e4f534a;

function readChunks(buf, name) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== MAGIC) throw new Error(`${name}: 不是 GLB`);
  const total = buf.readUInt32LE(8);
  if (total !== buf.length) throw new Error(`${name}: header length ${total} != file ${buf.length}`);
  const chunks = [];
  let offset = 12;
  while (offset < buf.length) {
    if (offset + 8 > buf.length) throw new Error(`${name}: chunk header 越界`);
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (data.length !== length) throw new Error(`${name}: chunk 数据越界`);
    chunks.push({ type, data });
    offset += 8 + length;
  }
  if (offset !== buf.length) throw new Error(`${name}: 尾随字节 ${buf.length - offset}`);
  return chunks;
}

function rebuild(chunks, json) {
  const parts = [];
  let total = 12;
  for (const chunk of chunks) {
    let data = chunk.data;
    if (chunk.type === JSON_TYPE) {
      data = Buffer.from(JSON.stringify(json), 'utf8');
      const pad = (4 - (data.length % 4)) % 4;
      if (pad) data = Buffer.concat([data, Buffer.alloc(pad, 0x20)]);
    } else if (data.length % 4 !== 0) {
      throw new Error(`chunk 0x${chunk.type.toString(16)} 未按 4 字节对齐，拒绝重写`);
    }
    const head = Buffer.alloc(8);
    head.writeUInt32LE(data.length, 0);
    head.writeUInt32LE(chunk.type, 4);
    parts.push(head, data);
    total += 8 + data.length;
  }
  const header = Buffer.alloc(12);
  header.writeUInt32LE(MAGIC, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(total, 8);
  return Buffer.concat([header, ...parts]);
}

function normalizeMeta(meta) {
  const next = { ...meta };
  next.licenseName = 'CC_BY_NC_SA';
  next.otherLicenseUrl = next.otherLicenseUrl || LICENSE_URL;
  next.reference = next.reference || LICENSE_URL;
  next.version = next.version || '1';
  next.allowedUserName = next.allowedUserName || 'Everyone';
  next.commercialUssageName = 'Disallow';
  next.sexualUssageName = 'Disallow';
  next.violentUssageName = 'Disallow';
  return next;
}

function diff(before, after) {
  return Object.keys(after)
    .filter((key) => before[key] !== after[key])
    .map((key) => `${key}: ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`);
}

const write = process.argv.includes('--write');
const checkOnly = process.argv.includes('--check') || !write;
const backupDir = path.join(ROOT, '.tmp', 'vrm-meta-backup');
if (write) fs.mkdirSync(backupDir, { recursive: true });

for (const name of MODELS) {
  const file = path.join(ROOT, 'apps', 'web', 'public', 'vrm', 'models', `${name}.vrm`);
  const buf = fs.readFileSync(file);
  const chunks = readChunks(buf, name);
  const jsonChunk = chunks.find((chunk) => chunk.type === JSON_TYPE);
  if (!jsonChunk) throw new Error(`${name}: 缺少 JSON chunk`);
  const json = JSON.parse(jsonChunk.data.toString('utf8'));
  const vrm0 = json.extensions?.VRM;
  if (!vrm0?.meta) throw new Error(`${name}: 不是 VRM0 或缺少 meta`);

  const before = vrm0.meta;
  const after = normalizeMeta(before);
  const changes = diff(before, after);
  console.log(`\n${name}: ${changes.length ? changes.join('; ') : '无需修改'}`);
  if (checkOnly || changes.length === 0) continue;

  const binBefore = crypto.createHash('sha256').update(chunks.find((c) => c.type !== JSON_TYPE)?.data ?? Buffer.alloc(0)).digest('hex');
  vrm0.meta = after;
  const out = rebuild(chunks, json);
  const reparsed = readChunks(out, name);
  const jsonAfter = JSON.parse(reparsed.find((c) => c.type === JSON_TYPE).data.toString('utf8'));
  const binAfter = crypto.createHash('sha256').update(reparsed.find((c) => c.type !== JSON_TYPE)?.data ?? Buffer.alloc(0)).digest('hex');
  if (binAfter !== binBefore) throw new Error(`${name}: BIN chunk 被意外修改`);
  if (jsonAfter.extensions?.VRM?.meta?.licenseName !== 'CC_BY_NC_SA') throw new Error(`${name}: 回读失败`);

  fs.copyFileSync(file, path.join(backupDir, `${name}.vrm`));
  fs.writeFileSync(file, out);
  console.log(`${name}: 已写入（${buf.length} -> ${out.length} bytes），备份 .tmp/vrm-meta-backup/${name}.vrm`);
}
