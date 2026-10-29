import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveCommandPath, validateSubagentCwd } from './cli-command';

describe('v2.11 CLI 命令与工作目录校验', () => {
  it('绝对路径命令：存在才可解析', () => {
    expect(resolveCommandPath(process.execPath)).toBe(process.execPath);
    expect(resolveCommandPath(join(tmpdir(), 'wbfm-no-such-command'))).toBeNull();
    expect(resolveCommandPath('   ')).toBeNull();
  });

  it('PATH 解析（Windows 追加 PATHEXT）', () => {
    // 用临时目录里的伪可执行文件，避免依赖宿主是否恰好存在 node.exe（Linux CI 无 .EXE）
    const dir = mkdtempSync(join(tmpdir(), 'wbfm-cli-path-'));
    writeFileSync(join(dir, 'tool.exe'), '');
    const found = resolveCommandPath('tool', {
      platform: 'win32',
      pathEnv: dir,
      pathExt: '.EXE',
    });
    expect(found?.toLowerCase().endsWith('tool.exe')).toBe(true);
    expect(
      resolveCommandPath('wbfm-missing', { platform: 'win32', pathEnv: dir, pathExt: '.EXE' }),
    ).toBeNull();
  });

  it('工作目录：目录存在才通过，相对路径/根目录/UNC/数据目录拒绝', () => {
    const root = mkdtempSync(join(tmpdir(), 'wbfm-cli-cwd-'));
    expect(validateSubagentCwd(root)).toBe(root);

    expect(() => validateSubagentCwd(join(root, 'missing'))).toThrow(/不存在/);
    expect(() => validateSubagentCwd('relative/dir')).toThrow(/绝对路径/);
    expect(() => validateSubagentCwd('\\\\server\\share')).toThrow(/UNC/);
    expect(() => validateSubagentCwd(parse(process.cwd()).root, { platform: 'win32' })).toThrow(
      /根目录/,
    );
    expect(() => validateSubagentCwd(root, { dataRoot: root })).toThrow(/应用数据目录/);
  });
});
