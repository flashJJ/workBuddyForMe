import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase } from '@wbfm/database';
import { setDataRootForTest, resetDataRootForTest } from '@wbfm/config';
import { parseCharacterCard } from '@wbfm/shared/character-card';
import type { DatabaseInstance } from '@wbfm/database';
import { createStageSceneService, type ServiceDeps } from './index';
import { createModPackService } from './mod-pack-service';

const CARD_MD = `---
name: 清冷搭档
description: 单测导出卡
defaultEmotion: neutral
---

## 我是谁

冷静克制的搭档。

## 性格特征

- 话少

## 说话风格

- 直接

## 边界

- 不做坏事
`;

/** 1x1 合法 PNG（魔数 + IHDR/IEND） */
const PNG_1X1 = Uint8Array.from(
  [
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
    0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
    0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60,
    0x00, 0x00, 0x02, 0x00, 0x01, 0x54, 0xa2, 0x4f, 0x9f, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ],
  (n) => n,
);

interface Harness {
  db: DatabaseInstance;
  service: ReturnType<typeof createModPackService>;
  root: string;
}

function setupHarness(): Harness {
  const root = mkdtempSync(join(tmpdir(), 'wbfm-pack-'));
  setDataRootForTest(root);
  const db = createDatabase(':memory:');
  const stageScenes = createStageSceneService({ db } as ServiceDeps);
  const service = createModPackService({ db, stageScenes });
  return { db, service, root };
}

describe('mod-pack-service 导出/导入往返', () => {
  beforeEach(() => {
    setDataRootForTest(mkdtempSync(join(tmpdir(), 'wbfm-pack-init-')));
  });
  afterEach(() => resetDataRootForTest());

  it('卡 + 场景(含背景图) 导出→预检→导入：背景换发引用、mod_installs 登记', () => {
    const a = setupHarness();
    const parsed = parseCharacterCard(CARD_MD);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const cardId = createCard(a.db, CARD_MD);
    // 场景带自定义背景
    const staged = setupBg(a, PNG_1X1, 'image/png');
    const sceneId = createScene(a.db, '黄昏书桌', staged.fileRef);

    const exported = a.service.exportPack({
      name: '搭档套装',
      authorName: 'tester',
      characterCardIds: [cardId],
      stageSceneIds: [sceneId],
    });
    expect(exported.filename).toBe('搭档套装.wbfm-pack');

    const previewA = a.service.inspect(exported.archive);
    expect(previewA.importable).toBe(true);
    // 同机预检：卡名/场景名冲突应标红
    expect(previewA.entries.find((e) => e.kind === 'characterCard')?.conflict).toBe(true);

    // 导入另一台「机器」（独立库 + 独立数据根）
    const b = setupHarness();
    const previewB = b.service.inspect(exported.archive);
    expect(previewB.fatal).toBeNull();
    expect(previewB.importable).toBe(true);
    const paths = previewB.entries.map((e) => e.path);
    const result = b.service.importPack(exported.archive, paths);

    expect(result.counts).toEqual({ characterCards: 1, stageScenes: 1, stageBackgrounds: 1 });
    const importedCards = b.db.prepare('SELECT name FROM character_cards').all() as Array<{ name: string }>;
    expect(importedCards.map((c) => c.name)).toEqual(['清冷搭档']);
    const scene = b.db
      .prepare('SELECT name, payload_json FROM stage_scenes')
      .get() as { name: string; payload_json: string };
    expect(scene.name).toBe('黄昏书桌');
    const payload = JSON.parse(scene.payload_json) as { background: { fileRef?: string } };
    const newRef = payload.background.fileRef ?? '';
    expect(newRef).toMatch(/^bg-/);
    expect(newRef).not.toBe(staged.fileRef);
    // mod_installs 一条，摘要带新 id
    const installs = b.db.prepare('SELECT pack_id, name, summary_json FROM mod_installs').all() as Array<{
      pack_id: string;
      name: string;
      summary_json: string;
    }>;
    expect(installs).toHaveLength(1);
    expect(installs[0]?.name).toBe('搭档套装');
    const summary = JSON.parse(installs[0]?.summary_json ?? '{}') as {
      stageBackgroundFileRefs: string[];
    };
    expect(summary.stageBackgroundFileRefs).toContain(newRef);

    a.db.close();
    b.db.close();
  });

  it('同名冲突自动转副本（卡/场景名加（导入副本）后缀），重复导入登记两条', () => {
    const a = setupHarness();
    const cardId = createCard(a.db, CARD_MD);
    const sceneId = createScene(a.db, '纯黑舞台');
    const exported = a.service.exportPack({
      name: '套装2',
      authorName: 't',
      characterCardIds: [cardId],
      stageSceneIds: [sceneId],
    });

    const result1 = a.service.importPack(exported.archive, [
      `cards/card-${cardId}.md`,
      `scenes/scene-${sceneId}.json`,
    ]);
    expect(result1.entries.every((e) => e.copied)).toBe(true);
    const result2 = a.service.importPack(exported.archive, [
      `cards/card-${cardId}.md`,
      `scenes/scene-${sceneId}.json`,
    ]);
    const names = result2.entries.map((e) => e.name);
    expect(names.some((n) => n.includes('（导入副本）'))).toBe(true);

    const rows = a.db.prepare('SELECT COUNT(*) AS n FROM mod_installs').get() as { n: number };
    expect(rows.n).toBe(2);
    a.db.close();
  });

  it('勾选场景但不勾选其背景：拒绝导入', () => {
    const a = setupHarness();
    const cardId = createCard(a.db, CARD_MD);
    const staged = setupBg(a, PNG_1X1, 'image/png');
    const sceneId = createScene(a.db, '带图场景', staged.fileRef);
    const exported = a.service.exportPack({
      name: '套装3',
      authorName: 't',
      characterCardIds: [cardId],
      stageSceneIds: [sceneId],
    });
    const b = setupHarness();
    expect(() =>
      b.service.importPack(exported.archive, [`scenes/scene-${sceneId}.json`, `cards/card-${cardId}.md`]),
    ).toThrow(/背景图未勾选/);
    a.db.close();
    b.db.close();
  });
});

function createCard(db: DatabaseInstance, md: string): string {
  const parsed = parseCharacterCard(md);
  if (!parsed.ok) throw new Error('fixture card invalid');
  const id = `card-test-${Math.random().toString(36).slice(2, 10)}`;
  db.prepare(
    `INSERT INTO character_cards(id, source, name, description, raw_markdown, parsed_json,
       default_emotion, voice, created_at, updated_at)
     VALUES (@id,'custom',@name,'',@raw,@parsed,'neutral',NULL,@ts,@ts)`,
  ).run({ id, name: parsed.card.name, raw: md, parsed: JSON.stringify(parsed.card), ts: new Date().toISOString() });
  return id;
}

function setupBg(h: Harness, buffer: Uint8Array, mimeType: string): { fileRef: string } {
  // 通过舞台服务落盘一张背景
  const stage = createStageSceneService({ db: h.db } as ServiceDeps);
  return stage.saveBackground({ buffer, mimeType });
}

function createScene(db: DatabaseInstance, name: string, fileRef?: string): string {
  const id = `scene-test-${Math.random().toString(36).slice(2, 10)}`;
  const payload = {
    background: fileRef
      ? { type: 'image', fileRef, brightness: 1, blur: 0 }
      : { type: 'solid', color: '#101820', brightness: 1, blur: 0 },
    slots: {},
    cast: {},
    sceneZoom: 1,
    showDialog: true,
    showNameplates: true,
    warmFilter: { color: '#e8b06b', opacity: 0 },
  };
  db.prepare(
    `INSERT INTO stage_scenes(id, name, is_builtin, payload_json, created_at, updated_at)
     VALUES (@id,@name,0,@json,@ts,@ts)`,
  ).run({ id, name, json: JSON.stringify(payload), ts: new Date().toISOString() });
  return id;
}
