import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { parseCapabilityZip } from '../manifest';

describe('能力包 ZIP 预算', () => {
  it('中央目录声明解压后体积超限：解压前拒绝（压缩炸弹）', () => {
    // 256KB 全零条目压缩后仅几百字节；预算压到 64KB 即可复现炸弹拒绝
    const bomb = zipSync({ 'payload/big.bin': new Uint8Array(256 * 1024) });
    expect(() => parseCapabilityZip(bomb, 64 * 1024)).toThrowError(/能力包解压后体积超过上限/);
  });

  it('正常体积的能力包不受影响（继续进入清单校验）', () => {
    const normal = zipSync({ 'wbfm-capability.json': new TextEncoder().encode('{}') });
    expect(() => parseCapabilityZip(normal)).toThrowError(/清单校验失败/);
  });
});
