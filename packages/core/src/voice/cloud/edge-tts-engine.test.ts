import { describe, expect, it } from 'vitest';
import {
  EdgeTtsEngine,
  type EdgeSocket,
  type EdgeSocketFactory,
} from './edge-tts-engine';

type Listener = (...args: never[]) => void;

class FakeSocket {
  readonly sent: string[] = [];
  closed = false;
  private readonly listeners = new Map<string, Listener[]>();

  on(event: string, listener: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (...values: unknown[]) => void)(...args);
    }
  }
}

function audioFrame(payload: Buffer): Buffer {
  const header = Buffer.from('X-RequestId:test\r\nPath:audio\r\n\r\n', 'utf8');
  const length = Buffer.alloc(2);
  length.writeUInt16BE(header.length);
  return Buffer.concat([length, header, payload]);
}

function textFrame(path: string): Buffer {
  return Buffer.from(`X-RequestId:test\r\nPath:${path}\r\n\r\n{}`, 'utf8');
}

function makeEngine(
  run: (socket: FakeSocket) => void,
  options: { decode?: () => Promise<{ samples: Float32Array; sampleRate: number }> } = {},
) {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  const factory: EdgeSocketFactory = (url) => {
    const socket = new FakeSocket();
    sockets.push(socket);
    urls.push(url);
    setTimeout(() => {
      socket.emit('open');
      run(socket);
    }, 0);
    return socket as unknown as EdgeSocket;
  };
  const engine = new EdgeTtsEngine({
    voice: 'zh-CN-XiaoxiaoNeural',
    timeoutMs: 2000,
    socketFactory: factory,
    decodeMp3: options.decode ?? (async () => ({ samples: new Float32Array([0.5, -0.5]), sampleRate: 24_000 })),
  });
  return { engine, sockets, urls };
}

describe('EdgeTtsEngine（微软在线朗读）', () => {
  it('按协议发送 config/SSML，解码音频分片并关闭连接', async () => {
    const { engine, sockets, urls } = makeEngine((socket) => {
      socket.emit('message', audioFrame(Buffer.from([1, 2, 3])), true);
      socket.emit('message', audioFrame(Buffer.from([4, 5])), true);
      socket.emit('message', textFrame('turn.end'), false);
    });

    const result = await engine.synthesize('你好');

    expect(Array.from(result.samples)).toEqual([0.5, -0.5]);
    expect(result.sampleRate).toBe(24_000);
    expect(sockets[0]!.sent[0]).toContain('Path:speech.config');
    expect(sockets[0]!.sent[0]).toContain('audio-24khz-48kbitrate-mono-mp3');
    expect(sockets[0]!.sent[1]).toContain('Path:ssml');
    expect(sockets[0]!.sent[1]).toContain("name='zh-CN-XiaoxiaoNeural'");
    expect(sockets[0]!.sent[1]).toContain('你好');
    expect(sockets[0]!.closed).toBe(true);
    expect(urls[0]).toContain('Sec-MS-GEC=');
    expect(urls[0]).toContain('Sec-MS-GEC-Version=2-');
  });

  it('语速映射为 SSML rate 百分比并转义文本', async () => {
    const { engine, sockets } = makeEngine((socket) => {
      socket.emit('message', audioFrame(Buffer.from([1])), true);
      socket.emit('message', textFrame('turn.end'), false);
    });

    await engine.synthesize('a < b & c', { speed: 1.5 });

    const ssml = sockets[0]!.sent[1]!;
    expect(ssml).toContain("rate='+50%'");
    expect(ssml).toContain('a &lt; b &amp; c');
  });

  it('连接在 turn.end 前中断时报错', async () => {
    const { engine } = makeEngine((socket) => {
      socket.emit('close', 1006, Buffer.alloc(0));
    });
    await expect(engine.synthesize('你好')).rejects.toThrow(/连接中断/);
  });

  it('未返回音频时报错', async () => {
    const { engine } = makeEngine((socket) => {
      socket.emit('message', textFrame('turn.end'), false);
    });
    await expect(engine.synthesize('你好')).rejects.toThrow(/未返回音频/);
  });

  it('abort 取消进行中的合成', async () => {
    const controller = new AbortController();
    const { engine } = makeEngine(() => undefined);
    const pending = engine.synthesize('你好', { signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    await expect(pending).rejects.toThrow(/合成已取消/);
  });
});
