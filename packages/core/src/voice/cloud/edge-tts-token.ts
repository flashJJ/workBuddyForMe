import { createHash } from 'node:crypto';

/**
 * 微软 Edge 在线朗读（Read Aloud）的 DRM 令牌。
 *
 * 该服务免用户密钥，但 2025 起要求 Sec-MS-GEC v2：
 * `CS64(逐字版权声明 + Windows 时间戳 + 内置客户端令牌) + "-" + SHA256(同一输入)`。
 * 时间戳按 5 分钟取整，因此令牌在窗口内稳定可用。
 * 算法来源：edge-tts / MsEdgeTTS 社区逆向实现（仅供本机免密钥朗读）。
 */

export const EDGE_TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
export const EDGE_SEC_MS_GEC_VERSION = '2-143.0.3650.75';

const EDGE_COPYRIGHT = 'Copyright (C) Microsoft Corporation. All rights reserved.';
const WIN_EPOCH_SECONDS = 11_644_473_600;

interface SwapMultipliers {
  swappedWord: number;
  swappedSum: number;
  swappedProduct: number;
}

const SWAP_FIRST_WORD: SwapMultipliers = {
  swappedWord: 0xef0569fb,
  swappedSum: 0x76f50f34,
  swappedProduct: 0xc3efea97,
};
const SWAP_SECOND_WORD: SwapMultipliers = {
  swappedWord: 0xc31713db,
  swappedSum: 0x1881ce3c,
  swappedProduct: 0x35bd1ec9,
};
const MIX_FIRST_WORD = [0xcf98b111, 0x87085b9f, 0x12ceb96d, 0x257e1d83];
const MIX_SECOND_WORD = [0xa27416f5, 0xd38396ff, 0x7c932b89, 0xbfa49f69];

/** 生成当前 5 分钟窗口的 Sec-MS-GEC 令牌（大写下划线无关的 16-64 hex） */
export function generateEdgeSecMsGec(nowMs = Date.now()): string {
  const bucket = Math.floor(nowMs / 1000 + WIN_EPOCH_SECONDS);
  const ticks = Math.floor(bucket - (bucket % 300)) * 10_000_000;
  const input = Buffer.from(`${ticks}${EDGE_TRUSTED_CLIENT_TOKEN}`, 'ascii');
  const message = Buffer.concat([Buffer.from(EDGE_COPYRIGHT, 'ascii'), input]);
  const digest = createHash('sha256').update(message).digest();
  return `${toUpperHex(cs64(message, digest))}-${toUpperHex(digest)}`;
}

function cs64(message: Buffer, digest: Buffer): Buffer {
  const firstKey = (digest.readUInt32LE(0) | 1) >>> 0;
  const secondKey = (digest.readUInt32LE(4) | 1) >>> 0;
  const paddedLength = Math.ceil(message.length / 8) * 8;
  const padded = Buffer.alloc(paddedLength);
  message.copy(padded);

  let swapSum = 0;
  let lastSwap = 0;
  let mix = 0;
  let mixSum = 0;
  for (let offset = 0; offset < padded.length; offset += 8) {
    const firstWord = padded.readUInt32LE(offset);
    const secondWord = padded.readUInt32LE(offset + 4);
    lastSwap = swapTerm(secondWord, secondKey, SWAP_SECOND_WORD);
    swapSum = (swapSum + swapTerm(firstWord, firstKey, SWAP_FIRST_WORD) + lastSwap) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + firstWord, firstKey), MIX_FIRST_WORD);
    mixSum = (mixSum + mix) >>> 0;
    mix = swapAndMultiply(Math.imul(mix + secondWord, secondKey), MIX_SECOND_WORD);
    mixSum = (mixSum + mix) >>> 0;
  }
  const output = Buffer.alloc(8);
  output.writeUInt32LE((lastSwap ^ mix) >>> 0, 0);
  output.writeUInt32LE((swapSum ^ mixSum) >>> 0, 4);
  return output;
}

function swapTerm(word: number, key: number, multipliers: SwapMultipliers): number {
  const sum = Math.imul(word, key) + Math.imul(swapHalves(word), multipliers.swappedWord);
  const product = Math.imul(swapHalves(sum), multipliers.swappedSum) >>> 0;
  return (Math.imul(swapHalves(product), multipliers.swappedProduct) + product) >>> 0;
}

function swapAndMultiply(value: number, multipliers: number[]): number {
  let next = value;
  for (const multiplier of multipliers) {
    next = Math.imul(swapHalves(next), multiplier) >>> 0;
  }
  return next;
}

function swapHalves(value: number): number {
  return ((value << 16) | (value >>> 16)) >>> 0;
}

function toUpperHex(buffer: Buffer): string {
  return buffer.toString('hex').toUpperCase();
}
