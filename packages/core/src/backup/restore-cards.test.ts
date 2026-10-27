import { describe, expect, it } from 'vitest';
import {
  createAssistantRepository,
  createCharacterCardRepository,
  createDatabase,
  type DatabaseInstance,
} from '@wbfm/database';
import {
  BUILTIN_CARD_SEEDS,
  parseCharacterCard,
} from '@wbfm/shared/character-card';
import { createWebCipher } from '../secrets/cipher';
import { ensureSeedData } from '../services/seed';
import { exportBackup } from './export';
import { precheckBackup, restoreBackup } from './restore';
import { packTarGz } from './export-archive';
import { backupManifestSchema } from '@wbfm/shared/backup';
import { ApiError } from '@wbfm/shared/errors';
import type { ServiceDeps } from '../services/deps';

const CUSTOM_CARD_MD = `---
name: 备份测试卡
description: roundtrip 用
defaultEmotion: joy
---

## 我是谁

你是备份往返测试里的人格，恢复后要一字不差。

## 边界

- 不丢失任何章节
`;

function depsOf(db: DatabaseInstance): ServiceDeps {
  return { db, cipher: createWebCipher() } as unknown as ServiceDeps;
}

describe('备份角色卡轨（v1.8 schema v4）', () => {
  it('全卡 + 引用助手 roundtrip：卡原文/引用关系对上，内置卡跳过', async () => {
    const srcDb = createDatabase(':memory:');
    ensureSeedData(srcDb);

    // 一张自建卡 + 一个选了它的自定义助手（显式 cardId，不经迁移路径）
    const cards = createCharacterCardRepository(srcDb);
    const parsed = parseCharacterCard(CUSTOM_CARD_MD);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error('夹具卡解析失败');
    const card = cards.create({ source: 'custom', rawMarkdown: CUSTOM_CARD_MD, parsed: parsed.card });
    const assistants = createAssistantRepository(srcDb);
    const assistant = assistants.create({
      name: '带卡助手',
      emoji: null,
      color: null,
      systemPrompt: '',
      temperature: 1,
      topP: 1,
      maxTokens: null,
      modelId: null,
      knowledgeBaseIds: [],
      enabledTools: [],
      retrieveAlways: false,
      cardId: card.id,
      isBuiltin: false,
      sortOrder: 1,
    });

    const { archive, manifest } = await exportBackup(depsOf(srcDb), { tracks: ['events'] });
    // 6 内置 + 内置助手迁移卡 + 自建卡
    expect(manifest.backupSchemaVersion).toBe(7);
    expect(manifest.tracks.events?.cardCount).toBe(BUILTIN_CARD_SEEDS.length + 2);
    const pre = await precheckBackup(archive);
    expect(pre.tracks.cards).toBe(BUILTIN_CARD_SEEDS.length + 2);

    const dstDb = createDatabase(':memory:');
    const result = await restoreBackup(depsOf(dstDb), archive);
    // 目标库已播种 6 内置卡 → 全部跳过；2 张 custom 为新 id → 导入
    expect(result.skipped.cards).toBe(BUILTIN_CARD_SEEDS.length);
    expect(result.imported.cards).toBe(2);

    const dstCards = createCharacterCardRepository(dstDb);
    const restored = dstCards.findById(card.id);
    expect(restored).not.toBeNull();
    expect(restored!.rawMarkdown).toBe(CUSTOM_CARD_MD);
    expect(restored!.parsed.boundaries).toEqual(['不丢失任何章节']);

    const restoredAssistant = createAssistantRepository(dstDb).findById(assistant.id);
    expect(restoredAssistant).not.toBeNull();
    expect(restoredAssistant!.cardId).toBe(card.id);

    // 幂等：第二次恢复全部跳过
    const again = await restoreBackup(depsOf(dstDb), archive);
    expect(again.imported.cards).toBe(0);
    expect(again.skipped.cards).toBe(BUILTIN_CARD_SEEDS.length + 2);

    srcDb.close();
    dstDb.close();
  });

  it('v3 旧档（无 characterCards.json）恢复不报错；悬挂 card_id 回落并触发旧提示词迁移', async () => {
    const dstDb = createDatabase(':memory:');
    // v3 manifest：events 轨无 cardCount，负载里也没有 characterCards.json
    const manifest = backupManifestSchema.parse({
      backupSchemaVersion: 3,
      appVersion: '1.7.0',
      createdAt: new Date().toISOString(),
      tracks: {
        conversations: { files: 'conversations.json', entryCount: 0 },
        knowledge: { files: 'knowledge.json', knowledgeBaseCount: 0, documentCount: 0 },
        settings: { files: 'settings.json' },
        attachments: { files: 'attachments/', entryCount: 0, totalBytes: 0 },
        events: { files: 'events.json', scheduleCount: 0, usageCount: 0, assistantCount: 1, triggerCount: 0 },
      },
    });
    const eventsJson = JSON.stringify({
      assistants: [
        {
          id: 'legacy-a1',
          name: '旧版助手',
          systemPrompt: '旧版时代写下的提示词',
          cardId: 'ghost-card',
          knowledgeBaseIds: [],
          enabledTools: [],
        },
      ],
      schedules: [],
      usage: [],
      triggers: [],
    });
    const archive = await packTarGz({ 'events.json': eventsJson }, [], manifest);

    const pre = await precheckBackup(archive);
    expect(pre.compatible).toBe(true);
    expect(pre.tracks.cards).toBe(0);

    await expect(restoreBackup(depsOf(dstDb), archive)).resolves.toBeDefined();
    const restored = createAssistantRepository(dstDb).findById('legacy-a1');
    expect(restored).not.toBeNull();
    // 悬挂引用先置 NULL；force 迁移再把非空旧提示词包成 identity 卡
    expect(restored!.cardId).not.toBeNull();
    const migrated = createCharacterCardRepository(dstDb).findById(restored!.cardId!)!;
    expect(migrated.source).toBe('custom');
    expect(migrated.rawMarkdown).toContain('旧版时代写下的提示词');

    dstDb.close();
  });

  it('损坏 characterCards.json：抛出 VALIDATION_ERROR', async () => {
    const dstDb = createDatabase(':memory:');
    const manifest = backupManifestSchema.parse({
      backupSchemaVersion: 4,
      appVersion: '1.8.0',
      createdAt: new Date().toISOString(),
      tracks: {
        conversations: { files: 'conversations.json', entryCount: 0 },
        knowledge: { files: 'knowledge.json', knowledgeBaseCount: 0, documentCount: 0 },
        settings: { files: 'settings.json' },
        attachments: { files: 'attachments/', entryCount: 0, totalBytes: 0 },
        events: { files: 'events.json', scheduleCount: 0, usageCount: 0, assistantCount: 0, triggerCount: 0, cardCount: 1 },
      },
    });
    const archive = await packTarGz(
      { 'events.json': JSON.stringify({ assistants: [], schedules: [], usage: [], triggers: [] }), 'characterCards.json': 'not-json' },
      [],
      manifest,
    );
    await expect(restoreBackup(depsOf(dstDb), archive)).rejects.toBeInstanceOf(ApiError);
    dstDb.close();
  });
});
