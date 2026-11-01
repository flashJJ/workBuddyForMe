import { describe, expect, it } from 'vitest';
import {
  STAGE_BACKGROUND_MAX_BYTES,
  stageDirectionSchema,
  stageSceneCreateSchema,
  stageScenePayloadSchema,
  stageSceneUpdateSchema,
} from './stage';

function validPayload() {
  return {
    background: { type: 'solid' as const, color: '#101418', brightness: 1, blur: 0 },
    slots: {},
    cast: {},
    sceneZoom: 1,
    showDialog: true,
    showNameplates: true,
    warmFilter: { color: '#e8b06b', opacity: 0 },
  };
}

describe('v1.9 舞台 schema', () => {
  it('合法场景 payload 通过并补默认值', () => {
    const parsed = stageScenePayloadSchema.parse(validPayload());
    expect(parsed.background.brightness).toBe(1);
    expect(parsed.sceneZoom).toBe(1);
  });

  it('颜色必须是 #rrggbb；越界亮度/缩放/暖光被拒', () => {
    expect(() =>
      stageScenePayloadSchema.parse({ ...validPayload(), background: { type: 'solid', color: 'red', brightness: 1, blur: 0 } }),
    ).toThrow();
    expect(() =>
      stageScenePayloadSchema.parse({ ...validPayload(), sceneZoom: 2 }),
    ).toThrow();
    expect(() =>
      stageScenePayloadSchema.parse({ ...validPayload(), warmFilter: { color: '#e8b06b', opacity: 0.9 } }),
    ).toThrow();
  });

  it('strict 模式拒绝未声明字段（防备份/客户端夹带）', () => {
    expect(() =>
      stageScenePayloadSchema.parse({ ...validPayload(), evil: 1 } as never),
    ).toThrow();
  });

  it('场景名长度 1–30', () => {
    expect(() => stageSceneCreateSchema.parse({ name: '', payload: validPayload() })).toThrow();
    expect(() =>
      stageSceneCreateSchema.parse({ name: 'x'.repeat(31), payload: validPayload() }),
    ).toThrow();
  });

  it('更新空对象被拒', () => {
    const result = stageSceneUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('舞台指令：focus 允许 null（散焦），speech 文本限长', () => {
    expect(stageDirectionSchema.parse({ t: 'focus', slot: null })).toEqual({ t: 'focus', slot: null });
    expect(() =>
      stageDirectionSchema.parse({ t: 'speech', slot: 'center', text: 'x'.repeat(2001), seq: 0 }),
    ).toThrow();
    expect(() => stageDirectionSchema.parse({ t: 'exit', slot: 'balcony' })).toThrow();
  });

  it('背景常量：20MB 上限', () => {
    expect(STAGE_BACKGROUND_MAX_BYTES).toBe(20 * 1024 * 1024);
  });
});
