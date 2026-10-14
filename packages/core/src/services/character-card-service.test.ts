import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@wbfm/shared/errors';
import { BUILTIN_CARD_SEEDS } from '@wbfm/shared/character-card';
import {
  createAssistantRepository,
  createCharacterCardRepository,
  createDatabase,
  getMeta,
  type DatabaseInstance,
} from '@wbfm/database';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher, type SecretCipher } from '../secrets/cipher';
import {
  BUILTIN_ASSISTANT,
  LEGACY_CARD_MIGRATION_KEY,
  ensureSeedData,
  migrateLegacySystemPrompts,
} from './seed';
import { createCharacterCardService } from './character-card-service';

const VALID_CARD = `---
name: 测试卡
description: 单测用
defaultEmotion: joy
---

## 我是谁

你是一位严谨的测试专家。

## 性格特征

- 关注边界条件
- 先跑测试再下结论

## 说话风格

- 简洁、给证据
`;

describe('v1.8 角色卡服务 / 播种 / 旧提示词迁移', () => {
  let db: DatabaseInstance;
  let cipher: SecretCipher;
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-card-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    cipher = createWebCipher();
  });

  afterEach(() => {
    db.close();
    resetDataRootForTest();
  });

  const service = () => createCharacterCardService({ db, cipher });

  /** 以仓储直插一个 v1.8 之前的助手行（cardId 缺省 null） */
  const insertLegacyAssistant = (id: string, systemPrompt: string, isBuiltin = false) => {
    createAssistantRepository(db).create({
      id,
      name: id,
      emoji: null,
      color: null,
      systemPrompt,
      temperature: 1,
      topP: 1,
      maxTokens: null,
      modelId: null,
      knowledgeBaseIds: [],
      enabledTools: [],
      retrieveAlways: false,
      isBuiltin,
      sortOrder: 0,
    });
  };

  it('播种：3 张内置卡固定 id 落库，重复播种幂等', () => {
    ensureSeedData(db);
    ensureSeedData(db);
    const cards = service().list('builtin');
    expect(cards.map((c) => c.id).sort()).toEqual(BUILTIN_CARD_SEEDS.map((s) => s.id).sort());
    expect(cards.every((c) => c.source === 'builtin')).toBe(true);
    // 内置通用助手的非空提示词同步迁为一张 custom 卡
    expect(service().list()).toHaveLength(BUILTIN_CARD_SEEDS.length + 1);
    expect(service().list('custom')).toHaveLength(1);
  });

  it('内置卡只读：改/删均 403，但可复制为可编辑自建卡', () => {
    ensureSeedData(db);
    const svc = service();
    expect(() => svc.update('capable-colleague', VALID_CARD)).toThrow(/只读/);
    expect(() => svc.delete('calm-advisor')).toThrow(ApiError);
    const copy = svc.duplicate('capable-colleague');
    expect(copy.source).toBe('custom');
    expect(copy.id).not.toBe('capable-colleague');
    expect(copy.rawMarkdown).toBe(svc.get('capable-colleague').rawMarkdown);
    const updated = svc.update(copy.id, VALID_CARD);
    expect(updated.name).toBe('测试卡');
  });

  it('自建卡 CRUD：解析失败带诊断拒绝；不存在资源 404', () => {
    ensureSeedData(db);
    const svc = service();
    const card = svc.create(VALID_CARD);
    expect(card.source).toBe('custom');
    expect(card.parsed.traits).toEqual(['关注边界条件', '先跑测试再下结论']);
    expect(card.parsed.defaultEmotion).toBe('joy');

    const bad = svc.create.bind(svc, '没有 frontmatter 的正文');
    expect(bad).toThrow(ApiError);
    try {
      svc.create('name: 漏分隔符\n');
      throw new Error('应当抛错');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).details).toBeDefined();
    }
    expect(() => svc.get('ghost')).toThrow(/角色卡不存在/);
  });

  it('删卡：引用该卡的助手回落默认卡（cardId 置空，不删助手）', () => {
    ensureSeedData(db);
    const svc = service();
    const assistants = createAssistantRepository(db);
    const card = svc.create(VALID_CARD);
    insertLegacyAssistant('a-keep', '另一个提示词');
    migrateLegacySystemPrompts(db, { force: true });
    svc.assignCard('a-keep', card.id);
    expect(assistants.findById('a-keep')!.cardId).toBe(card.id);

    svc.delete(card.id);
    expect(assistants.findById('a-keep')!.cardId).toBeNull();
    expect(assistants.findById('a-keep')).not.toBeNull();
  });

  it('选卡：助手/卡不存在分别 404；null 回到默认卡', () => {
    ensureSeedData(db);
    const svc = service();
    insertLegacyAssistant('a1', '旧人格');
    expect(() => svc.assignCard('ghost', null)).toThrow(/助手不存在/);
    expect(() => svc.assignCard('a1', 'no-card')).toThrow(/角色卡不存在/);
    const updated = svc.assignCard('a1', null);
    expect(updated.cardId).toBeNull();
    expect(svc.assignCard('a1', 'cheerful-buddy').cardId).toBe('cheerful-buddy');
  });

  it('旧提示词迁移：原文逐字入卡并回写 cardId；空提示词跳过；守卫防重复', () => {
    const prompt = '你是一条逐字保留的提示词\n换行也不动。';
    insertLegacyAssistant('a-old', prompt);
    insertLegacyAssistant('a-empty', '   ');
    ensureSeedData(db);

    const cards = createCharacterCardRepository(db);
    const assistants = createAssistantRepository(db);
    const migrated = assistants.findById('a-old')!;
    expect(migrated.cardId).not.toBeNull();
    const card = cards.findById(migrated.cardId!)!;
    expect(card.source).toBe('custom');
    expect(card.rawMarkdown).toContain(prompt);
    expect(card.parsed.identity).toContain('逐字保留');
    expect(assistants.findById('a-empty')!.cardId).toBeNull();
    // 内置助手自身也完成迁移
    expect(assistants.findById(BUILTIN_ASSISTANT.id)!.cardId).not.toBeNull();

    const customCountAfter = cards.list('custom').length;
    ensureSeedData(db);
    expect(cards.list('custom').length).toBe(customCountAfter);
  });

  it('force 重跑：恢复旧档新出现的未迁移助手补迁，既有 cardId 不动', () => {
    insertLegacyAssistant('a1', '第一版人格');
    ensureSeedData(db);
    const firstCardId = createAssistantRepository(db).findById('a1')!.cardId;
    // 守卫已置位，普通调用不再处理新行；force 补跑（模拟备份恢复后）
    insertLegacyAssistant('a2', '第二版人格');
    migrateLegacySystemPrompts(db);
    expect(createAssistantRepository(db).findById('a2')!.cardId).toBeNull();
    migrateLegacySystemPrompts(db, { force: true });
    const assistants = createAssistantRepository(db);
    expect(assistants.findById('a2')!.cardId).not.toBeNull();
    expect(assistants.findById('a1')!.cardId).toBe(firstCardId);
    expect(getMeta(db, LEGACY_CARD_MIGRATION_KEY)).toBe('1');
  });
});
