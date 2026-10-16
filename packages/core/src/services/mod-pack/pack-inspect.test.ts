import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { inspectPackBuffer } from './pack-inspect';

const ctx = { existingCardNames: new Set<string>(), existingSceneNames: new Set<string>() };
const utf8 = (s: string) => new TextEncoder().encode(s);

const VALID_CARD = `---
name: 测试卡
description: 单测用卡
defaultEmotion: neutral
---

## 我是谁

单测卡片正文。

## 性格特征

- 冷静

## 说话风格

- 简短

## 边界

- 不做坏事
`;

function baseManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'wbfm-pack',
    schemaVersion: 1,
    pack: {
      id: 'p_test-0000-0000',
      name: '测试包',
      description: '',
      author: { name: 'tester', url: null },
      createdAt: '2026-06-01T00:00:00.000Z',
      packVersion: '1.0.0',
    },
    contents: {
      characterCards: [],
      events: [],
      themes: [],
      personas: [],
      gestures: [],
      stageScenes: [],
      stageBackgrounds: [],
    },
    ...overrides,
  };
}

function packWith(
  files: Record<string, Uint8Array>,
  manifest: Record<string, unknown>,
): Uint8Array {
  return zipSync({ ...files, 'manifest.json': utf8(JSON.stringify(manifest, null, 2)) }, { level: 6 });
}

describe('pack-inspect 负例 eval（04 §8）', () => {
  it('扩展名是 .wbfm-pack 实际是纯文本：容器校验拒绝', () => {
    const preview = inspectPackBuffer(utf8('this is not a zip at all'), ctx);
    expect(preview.fatal?.code).toBe('unsafeZip');
    expect(preview.importable).toBe(false);
  });

  it('entry 路径穿越 ../../Windows/x 拒绝', () => {
    const files: Record<string, Uint8Array> = { '../../Windows/x': utf8('evil') };
    const buf = packWith(files, baseManifest());
    const preview = inspectPackBuffer(buf, ctx);
    expect(preview.fatal?.code).toBe('unsafeZip');
    expect(preview.fatal?.message).toMatch(/穿越/);
  });

  it('盘符路径与反斜杠拒绝', () => {
    const b1 = packWith({ 'C:\\\\evil': utf8('x') }, baseManifest());
    expect(inspectPackBuffer(b1, ctx).fatal?.message).toMatch(/路径/);
  });

  it('路径含空字节拒绝', () => {
    const b1 = packWith({ 'bad\u0000name.md': utf8('x') }, baseManifest());
    expect(inspectPackBuffer(b1, ctx).fatal?.code).toBe('unsafeZip');
  });

  it('内层嵌套 zip（改后缀 .png 魔数为 PK）拒绝', () => {
    const manifest = baseManifest({
      contents: {
        characterCards: [],
        events: [],
        themes: [],
        personas: [],
        gestures: [],
        stageScenes: [],
        stageBackgrounds: ['backgrounds/inner.png'],
      },
    });
    const inner = zipSync({ a: utf8('x') }, { level: 6 });
    const preview = inspectPackBuffer(packWith({ 'backgrounds/inner.png': inner }, manifest), ctx);
    expect(preview.fatal).toBeNull();
    const entry = preview.entries.find((e) => e.path === 'backgrounds/inner.png');
    expect(entry?.valid).toBe(false);
    expect(entry?.errors.join(' ')).toMatch(/压缩包|图片/);
    expect(preview.importable).toBe(false);
  });

  it('夹带 avatar.vrm / voice.wav / model.moc3：黑名单拒绝', () => {
    const b1 = packWith({ 'models/a.moc3': utf8('x') }, baseManifest());
    expect(inspectPackBuffer(b1, ctx).fatal?.message).toMatch(/moc3/);
    const b2 = packWith({ 'voice/a.wav': utf8('x') }, baseManifest());
    expect(inspectPackBuffer(b2, ctx).fatal?.message).toMatch(/wav/);
    const b3 = packWith({ 'avatar/a.vrm': utf8('x') }, baseManifest());
    expect(inspectPackBuffer(b3, ctx).fatal?.message).toMatch(/vrm/);
  });

  it('GLB 魔数伪装成 png：以魔数为准拒绝', () => {
    const manifest = baseManifest({
      contents: {
        characterCards: [],
        events: [],
        themes: [],
        personas: [],
        gestures: [],
        stageScenes: [],
        stageBackgrounds: ['backgrounds/fake.png'],
      },
    });
    const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x66, 2, 0, 0, 0]);
    const preview = inspectPackBuffer(packWith({ 'backgrounds/fake.png': glb }, manifest), ctx);
    expect(preview.entries[0]?.errors.join(' ')).toMatch(/模型|图片/);
    expect(preview.importable).toBe(false);
  });

  it('manifest 列了 cards/a.md 但包内缺失：整包拒绝', () => {
    const manifest = baseManifest({
      contents: {
        characterCards: ['cards/a.md'],
        events: [],
        themes: [],
        personas: [],
        gestures: [],
        stageScenes: [],
        stageBackgrounds: [],
      },
    });
    const preview = inspectPackBuffer(packWith({}, manifest), ctx);
    expect(preview.fatal?.code).toBe('entryMissing');
  });

  it('builtin.* 事件（events 内容类型本版不支持）：manifest 拒绝', () => {
    const eventJson = utf8(JSON.stringify({ id: 'builtin.event.goodnight' }));
    const manifest = baseManifest({
      contents: {
        characterCards: [],
        events: ['events/goodnight.json'],
        themes: [],
        personas: [],
        gestures: [],
        stageScenes: [],
        stageBackgrounds: [],
      },
    });
    const preview = inspectPackBuffer(packWith({ 'events/goodnight.json': eventJson }, manifest), ctx);
    expect(preview.fatal?.code).toBe('manifestInvalid');
  });

  it('主题/人格/动作预设内容类型本版不支持：非空声明拒绝', () => {
    const manifest = baseManifest({
      contents: {
        characterCards: [],
        events: [],
        themes: ['themes/x.json'],
        personas: [],
        gestures: [],
        stageScenes: [],
        stageBackgrounds: [],
      },
    });
    const preview = inspectPackBuffer(packWith({ 'themes/x.json': utf8('{}') }, manifest), ctx);
    expect(preview.fatal?.code).toBe('manifestInvalid');
  });

  it('schemaVersion=99：版本拒绝并提示升级', () => {
    const preview = inspectPackBuffer(packWith({}, baseManifest({ schemaVersion: 99 })), ctx);
    expect(preview.fatal?.code).toBe('unsupportedVersion');
    expect(preview.fatal?.message).toMatch(/升级/);
  });

  it('format 非 wbfm-pack 拒绝', () => {
    const preview = inspectPackBuffer(packWith({}, baseManifest({ format: 'something-else' })), ctx);
    expect(preview.fatal?.code).toBe('manifestInvalid');
  });

  it('缺少 manifest.json 拒绝', () => {
    const buf = zipSync({ 'cards/a.md': utf8(VALID_CARD) }, { level: 6 });
    expect(inspectPackBuffer(buf, ctx).fatal?.code).toBe('manifestMissing');
  });

  it('未声明条目（包内多文件）拒绝', () => {
    const preview = inspectPackBuffer(packWith({ 'cards/ghost.md': utf8(VALID_CARD) }, baseManifest()), ctx);
    expect(preview.fatal?.code).toBe('undeclaredEntry');
  });

  it('禁含 assistants/settings 路径拒绝', () => {
    expect(inspectPackBuffer(packWith({ 'assistants/a.json': utf8('{}') }, baseManifest()), ctx).fatal?.message).toMatch(/禁含/);
    expect(inspectPackBuffer(packWith({ 'settings/kv.json': utf8('{}') }, baseManifest()), ctx).fatal?.message).toMatch(/禁含/);
  });

  it('合法卡片条目通过并报可导入', () => {
    const manifest = baseManifest({
      contents: {
        characterCards: ['cards/card-1.md'],
        events: [],
        themes: [],
        personas: [],
        gestures: [],
        stageScenes: [],
        stageBackgrounds: [],
      },
    });
    const preview = inspectPackBuffer(packWith({ 'cards/card-1.md': utf8(VALID_CARD) }, manifest), ctx);
    expect(preview.fatal).toBeNull();
    expect(preview.importable).toBe(true);
    expect(preview.entries[0]?.name).toBe('测试卡');
  });

  it('卡片内容不合契约：条目标红但不报致命错误（聚合错误清单）', () => {
    const manifest = baseManifest({
      contents: {
        characterCards: ['cards/bad.md'],
        events: [],
        themes: [],
        personas: [],
        gestures: [],
        stageScenes: [],
        stageBackgrounds: [],
      },
    });
    const preview = inspectPackBuffer(packWith({ 'cards/bad.md': utf8('# 没有 frontmatter') }, manifest), ctx);
    expect(preview.fatal).toBeNull();
    expect(preview.entries[0]?.valid).toBe(false);
    expect(preview.importable).toBe(false);
  });
});
