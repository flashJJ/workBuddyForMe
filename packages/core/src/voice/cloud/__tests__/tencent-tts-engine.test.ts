import { describe, expect, it, vi } from 'vitest';
import {
  buildTencentAuthorization,
  decodePcm16,
  mapTencentSpeed,
  TencentTtsEngine,
} from '../tencent-tts-engine';

describe('TencentTtsEngine', () => {
  it('decodePcm16：16bit LE → [-1,1] float32', () => {
    const buffer = Buffer.alloc(6);
    buffer.writeInt16LE(0, 0);
    buffer.writeInt16LE(16384, 2);
    buffer.writeInt16LE(-16384, 4);
    const samples = decodePcm16(buffer);
    expect(samples).toHaveLength(3);
    expect(samples[0]).toBe(0);
    expect(samples[1]).toBeCloseTo(0.5);
    expect(samples[2]).toBeCloseTo(-0.5);
  });

  it('mapTencentSpeed：应用语速映射到官方档位', () => {
    expect(mapTencentSpeed(0.5)).toBe(-2);
    expect(mapTencentSpeed(0.8)).toBe(-1);
    expect(mapTencentSpeed(1)).toBe(0);
    expect(mapTencentSpeed(1.2)).toBe(1);
    expect(mapTencentSpeed(1.5)).toBe(2);
    expect(mapTencentSpeed(2)).toBe(4);
    expect(mapTencentSpeed(3)).toBe(6);
  });

  it('authorization：TC3 头结构完整且签名稳定', () => {
    const input = {
      secretId: 'AKIDexample',
      secretKey: 'secret',
      timestamp: 1_700_000_000,
      body: '{"Text":"你好"}',
    };
    const first = buildTencentAuthorization(input);
    const second = buildTencentAuthorization(input);
    expect(first).toBe(second);
    expect(first).toMatch(
      /^TC3-HMAC-SHA256 Credential=AKIDexample\/\d{4}-\d{2}-\d{2}\/tts\/tc3_request, SignedHeaders=content-type;host, Signature=[0-9a-f]{64}$/,
    );
  });

  it('synthesize：请求 PCM 直出并按 16bit 解码', async () => {
    const pcm = Buffer.alloc(4);
    pcm.writeInt16LE(16384, 0);
    pcm.writeInt16LE(-16384, 2);
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ Response: { Audio: pcm.toString('base64') } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const engine = new TencentTtsEngine({
      secretId: 'id',
      secretKey: 'key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await engine.synthesize('你好。');
    expect(result.sampleRate).toBe(16000);
    expect(Array.from(result.samples).map((n) => Math.round(n * 100) / 100)).toEqual([
      0.5, -0.5,
    ]);

    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://tts.tencentcloudapi.com');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      Text: '你好。',
      Codec: 'pcm',
      SampleRate: 16000,
      VoiceType: 101001,
      ModelType: 1,
      PrimaryLanguage: 1,
    });
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^TC3-HMAC-SHA256 /);
    expect(headers['x-tc-action']).toBe('TextToVoice');
    expect(headers['x-tc-version']).toBe('2019-08-23');
  });

  it('API 错误转为 VoiceEngineError（由运行时回退本地）', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            Response: { Error: { Code: 'AuthFailure', Message: 'bad key' } },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    );
    const engine = new TencentTtsEngine({
      secretId: 'id',
      secretKey: 'key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(engine.synthesize('你好')).rejects.toMatchObject({
      name: 'VoiceEngineError',
    });
  });
});
