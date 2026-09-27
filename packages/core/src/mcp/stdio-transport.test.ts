import { describe, expect, it } from 'vitest';
import { LineDecoder, buildSpawnCommand } from './stdio-transport';

describe('LineDecoder 按行分帧', () => {
  it('处理 chunk 边界、CRLF 与结尾无换行的残留行', () => {
    const decoder = new LineDecoder();
    const part1 = decoder.push(Buffer.from('{"a":1}\n{"b":', 'utf8'));
    expect(part1).toEqual(['{"a":1}']);
    const part2 = decoder.push(Buffer.from('2}\r\n{"c":3}', 'utf8'));
    expect(part2).toEqual(['{"b":2}']);
    const part3 = decoder.end();
    expect(part3).toEqual(['{"c":3}']);
  });

  it('多字节 UTF-8 跨 chunk 不乱码', () => {
    const decoder = new LineDecoder();
    const bytes = Buffer.from('{"t":"你好世界"}\n', 'utf8');
    const cut = 5; // 切在多字节字符中间
    const lines = [...decoder.push(bytes.subarray(0, cut)), ...decoder.push(bytes.subarray(cut))];
    expect(lines).toEqual(['{"t":"你好世界"}']);
  });
});

describe('buildSpawnCommand Windows 包装', () => {
  it('非 Windows 直接返回原始命令', () => {
    if (process.platform === 'win32') return;
    expect(buildSpawnCommand('node', ['-y', 'x'])).toEqual({
      file: 'node',
      args: ['-y', 'x'],
      windowsVerbatimArguments: false,
    });
  });

  it('Windows：exe 直启；其余经 cmd /d /s /c 包装并加引号', () => {
    if (process.platform !== 'win32') return;
    const exe = buildSpawnCommand('C:/tools/server.exe', ['--port', '1']);
    expect(exe.file).toBe('C:/tools/server.exe');
    expect(exe.windowsVerbatimArguments).toBe(false);

    const wrapped = buildSpawnCommand('npx.cmd', ['-y', '@mcp/server', 'D:/my docs']);
    expect(wrapped.windowsVerbatimArguments).toBe(true);
    expect(wrapped.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    // 整条命令行被外层引号包裹（配合 /s 剥离）
    const cmdline = wrapped.args[3] ?? '';
    expect(cmdline.startsWith('"')).toBe(true);
    expect(cmdline.endsWith('"')).toBe(true);
    // 含空格的参数在内部仍保有自己的引号
    expect(cmdline).toContain('"D:/my docs"');
  });
});
