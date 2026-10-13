import { describe, expect, it } from 'vitest';
import {
  CARD_FILE_MAX_BYTES,
  CARD_IDENTITY_MAX_CHARS,
  CARD_LIST_ITEMS_MAX,
  CARD_LIST_ITEM_MAX_CHARS,
  parsedCharacterCardSchema,
} from '../schemas/character-card';
import { parseCharacterCard } from './parser';

const FULL_CARD = `---
name: 干练同事
description: 高效直接的职场搭档
defaultEmotion: joy
voice: "azure:zh-CN-XiaoxiaoNeural"
---

## 我是谁

你是用户的资深同事，
擅长把模糊需求拆成步骤。

你说话简洁。

## 性格特征

- 先结论后依据
- 不堆套话
**加粗保留**
- 先结论后依据

## 说话风格

* 短句分点
+ 术语保留英文

## 边界

- 不可逆操作先确认
`;

describe('parseCharacterCard', () => {
  it('合法全字段卡：段落软换行合并/列表三种标记/去重/引号 frontmatter', () => {
    const r = parseCharacterCard(FULL_CARD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.card.name).toBe('干练同事');
    expect(r.card.description).toBe('高效直接的职场搭档');
    expect(r.card.defaultEmotion).toBe('joy');
    expect(r.card.voice).toBe('azure:zh-CN-XiaoxiaoNeural');
    // 软换行合并为空格，空行分段
    expect(r.card.identity).toBe('你是用户的资深同事， 擅长把模糊需求拆成步骤。\n\n你说话简洁。');
    // 去重保首次出现；非列表行（**加粗保留**）不入列表；内联 Markdown 原样保留
    expect(r.card.traits).toEqual(['先结论后依据', '不堆套话']);
    expect(r.card.speakingStyle).toEqual(['短句分点', '术语保留英文']);
    expect(r.card.boundaries).toEqual(['不可逆操作先确认']);
    expect(r.warnings).toEqual([]);
    // 输出必须满足持久化 zod 契约
    expect(parsedCharacterCardSchema.safeParse(r.card).success).toBe(true);
  });

  it('最小卡：只有 name，章节与字段全部走默认值', () => {
    const r = parseCharacterCard('---\nname: 测试卡\n---\n\n# 标题不算章节\n正文散落内容忽略。\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.card).toMatchObject({
      name: '测试卡',
      description: '',
      defaultEmotion: 'neutral',
      voice: null,
      identity: '',
      traits: [],
      speakingStyle: [],
      boundaries: [],
    });
  });

  it('章节别名与标题变体：###、尾部冒号、「身份」别名', () => {
    const md = `---
name: A
---

### 身份：

资深顾问

## 性格特征:
- 稳重
`;
    const r = parseCharacterCard(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.card.identity).toBe('资深顾问');
    expect(r.card.traits).toEqual(['稳重']);
  });

  it('CRLF 归一化与无结尾换行', () => {
    const r = parseCharacterCard('---\r\nname: B\r\n---\r\n\r\n## 我是谁\r\n一行');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.card.identity).toBe('一行');
  });

  it('未知 frontmatter 字段忽略（前向兼容），voice 空值为 null', () => {
    const r = parseCharacterCard('---\nname: C\nfutureField: xxx\nvoice:\n---\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.card.voice).toBeNull();
  });

  it('错误：缺少 frontmatter', () => {
    const r = parseCharacterCard('## 我是谁\n没有头');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.code).toBe('frontmatterMissing');
  });

  it('错误：frontmatter 未闭合', () => {
    const r = parseCharacterCard('---\nname: C\n## 我是谁\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.code).toBe('frontmatterUnclosed');
  });

  it('错误：非法 YAML 行 / 数组标量 / 重复键', () => {
    const r1 = parseCharacterCard('---\nname: C\n!!!bad\n---\n');
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.errors.some((e) => e.code === 'frontmatterInvalid')).toBe(true);

    const r2 = parseCharacterCard('---\nname: [a,b]\n---\n');
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.errors[0]?.code).toBe('frontmatterInvalid');

    const r3 = parseCharacterCard('---\nname: A\nname: B\n---\n');
    expect(r3.ok).toBe(false);
    if (r3.ok) return;
    expect(r3.errors[0]?.code).toBe('frontmatterInvalid');
  });

  it('错误：name 缺失与超长', () => {
    const r1 = parseCharacterCard('---\ndescription: 无名\n---\n');
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.errors[0]?.code).toBe('nameInvalid');

    const r2 = parseCharacterCard(`---\nname: ${'很'.repeat(31)}\n---\n`);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.errors[0]?.code).toBe('nameInvalid');
  });

  it('错误：defaultEmotion 不在词表（不静默回落）', () => {
    const r = parseCharacterCard('---\nname: C\ndefaultEmotion: happy\n---\n');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.code).toBe('emotionInvalid');
  });

  it('错误：description/voice 超长', () => {
    const r1 = parseCharacterCard(`---\nname: C\ndescription: ${'长'.repeat(121)}\n---\n`);
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.errors[0]?.code).toBe('frontmatterInvalid');

    const r2 = parseCharacterCard(`---\nname: C\nvoice: ${'v'.repeat(81)}\n---\n`);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.errors[0]?.code).toBe('frontmatterInvalid');
  });

  it('错误：文件超 16KB', () => {
    const r = parseCharacterCard(`---\nname: C\n---\n\n${'x'.repeat(CARD_FILE_MAX_BYTES)}`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]?.code).toBe('fileTooLarge');
  });

  it('告警：identity 超长截断', () => {
    const long = '字'.repeat(CARD_IDENTITY_MAX_CHARS + 50);
    const r = parseCharacterCard(`---\nname: C\n---\n\n## 我是谁\n${long}`);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.card.identity).toHaveLength(CARD_IDENTITY_MAX_CHARS);
    expect(r.warnings.some((w) => w.code === 'identityTruncated')).toBe(true);
  });

  it('告警：列表条目超长截断 + 超 8 条截断', () => {
    const longItem = `- ${'条'.repeat(CARD_LIST_ITEM_MAX_CHARS + 10)}`;
    const items = Array.from({ length: CARD_LIST_ITEMS_MAX + 3 }, (_, i) => `- 第${i}条`).join('\n');
    const r = parseCharacterCard(
      `---\nname: C\n---\n\n## 性格特征\n${longItem}\n${items}`,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.card.traits).toHaveLength(CARD_LIST_ITEMS_MAX);
    expect(r.card.traits[0]).toHaveLength(CARD_LIST_ITEM_MAX_CHARS);
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('listItemTruncated');
    expect(codes).toContain('listItemsTruncated');
  });

  it('告警：未识别章节忽略并给行号', () => {
    const md = `---
name: C
---

## 未知章节
内容

## 我是谁
正文`;
    const r = parseCharacterCard(md);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const w = r.warnings.find((x) => x.code === 'unsupportedSectionIgnored');
    expect(w?.line).toBe(5);
    expect(r.card.identity).toBe('正文');
  });

  it('结果集契约：诊断行号与可判别联合形态', () => {
    const ok = parseCharacterCard('---\nname: C\n---\n');
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(Array.isArray(ok.warnings)).toBe(true);
    const bad = parseCharacterCard('nope');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]?.line).toBe(1);
  });
});
