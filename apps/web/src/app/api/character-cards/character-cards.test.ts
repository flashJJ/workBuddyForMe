import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDatabase, type DatabaseInstance } from '@wbfm/database';
import { BUILTIN_CARD_SEEDS } from '@wbfm/shared/character-card';
import { resetDataRootForTest, setDataRootForTest } from '@wbfm/config';
import { createWebCipher } from '@wbfm/core/secrets';
import { assistantCreateSchema } from '@wbfm/shared/schemas';
import { __buildContainerForTest, __setContainerForTest, getServices } from '@/lib/server/container';
import { GET as listCards, POST as createCard } from './route';
import { GET as getCard, PUT as updateCard, DELETE as deleteCard } from './[id]/route';
import { POST as duplicateCard } from './[id]/duplicate/route';
import { GET as getRaw } from './[id]/raw/route';
import { PUT as assignCard } from '../assistants/[id]/card/route';
import { POST as createAssistant } from '../assistants/route';

const jsonRequest = (body: unknown, method = 'POST') =>
  new Request('http://127.0.0.1/x', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const CARD_MD = `---
name: 测试角色
description: 路由测试
defaultEmotion: joy
---

## 我是谁

你是一位严谨的测试专家。

## 边界

- 不编造数据
`;

describe('v1.8 角色卡路由', () => {
  let db: DatabaseInstance;

  beforeEach(() => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'wbfm-web-cards-'));
    setDataRootForTest(tempRoot);
    db = createDatabase(':memory:');
    __buildContainerForTest(db, createWebCipher());
  });

  afterEach(() => {
    __setContainerForTest(null);
    db.close();
    resetDataRootForTest();
  });

  const routeParams = (id: string) => ({ params: Promise.resolve({ id }) });

  it('列表：启动即播种全部内置卡；?source= 过滤生效', async () => {
    const all = (await (await listCards(new Request('http://x?source=builtin'))).json()).data;
    expect(all).toHaveLength(BUILTIN_CARD_SEEDS.length);
    expect(all.every((c: { source: string }) => c.source === 'builtin')).toBe(true);
  });

  it('建卡 201（原文+解析双份）；坏 Markdown 422 且 details 带诊断', async () => {
    const ok = await createCard(jsonRequest({ rawMarkdown: CARD_MD }));
    expect(ok.status).toBe(201);
    const card = (await ok.json()).data;
    expect(card.source).toBe('custom');
    expect(card.parsed.defaultEmotion).toBe('joy');
    expect(card.parsed.boundaries).toEqual(['不编造数据']);

    const bad = await createCard(jsonRequest({ rawMarkdown: '没有 frontmatter' }));
    expect(bad.status).toBe(422);
    const body = await bad.json();
    expect(body.error.details[0]).toMatchObject({ code: 'frontmatterMissing' });
  });

  it('内置卡只读：PUT/DELETE 均 403；可复制为自建卡并再编辑', async () => {
    const dup = await duplicateCard(new Request('http://x', { method: 'POST' }), routeParams('calm-advisor'));
    expect(dup.status).toBe(201);
    const copy = (await dup.json()).data;
    expect(copy.source).toBe('custom');

    const updated = await updateCard(jsonRequest({ rawMarkdown: CARD_MD }, 'PUT'), routeParams(copy.id));
    expect(updated.status).toBe(200);
    expect((await updated.json()).data.name).toBe('测试角色');

    expect((await updateCard(jsonRequest({ rawMarkdown: CARD_MD }, 'PUT'), routeParams('calm-advisor'))).status)
      .toBe(403);
    expect((await deleteCard(new Request('http://x', { method: 'DELETE' }), routeParams('calm-advisor'))).status)
      .toBe(403);
  });

  it('删自定义卡后 404；GET 不存在同样 404', async () => {
    const created = (await (await createCard(jsonRequest({ rawMarkdown: CARD_MD }))).json()).data;
    const removed = await deleteCard(new Request('http://x', { method: 'DELETE' }), routeParams(created.id));
    expect(removed.status).toBe(200);
    expect((await getCard(new Request('http://x'), routeParams(created.id))).status).toBe(404);
  });

  it('原文导出：text/markdown 附件，正文即 rawMarkdown', async () => {
    const res = await getRaw(new Request('http://x'), routeParams('capable-colleague'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/markdown');
    expect(res.headers.get('content-disposition')).toContain('attachment');
    expect(await res.text()).toContain('## 我是谁');
  });

  it('助手选卡：不存在卡 422；选中内置卡/回到默认卡 200', async () => {
    const created = await createAssistant(jsonRequest({ name: '小测', systemPrompt: '你是小测助手。' }));
    const assistant = (await created.json()).data;
    // 创建时走原文模式：自动包成 identity 卡
    expect(assistant.cardId).not.toBeNull();

    const bad = await assignCard(jsonRequest({ cardId: 'ghost' }, 'PUT'), routeParams(assistant.id));
    expect(bad.status).toBe(422);

    const picked = await assignCard(jsonRequest({ cardId: 'cheerful-buddy' }, 'PUT'), routeParams(assistant.id));
    expect((await picked.json()).data.cardId).toBe('cheerful-buddy');

    const reset = await assignCard(jsonRequest({ cardId: null }, 'PUT'), routeParams(assistant.id));
    expect((await reset.json()).data.cardId).toBeNull();
  });

  it('原文模式二次保存：更新同一张 custom 卡；内置卡→原文时新建且不改内置卡', () => {
    const services = getServices();
    const created = services.assistants.create(
      assistantCreateSchema.parse({ name: '小测', systemPrompt: '第一版人格。' }),
    );
    const firstCardId = created.cardId!;
    const updated = services.assistants.update(created.id, { systemPrompt: '第二版人格。' });
    expect(updated.cardId).toBe(firstCardId);
    expect(services.characterCards.get(firstCardId).rawMarkdown).toContain('第二版人格');

    const picked = services.characterCards.assignCard(created.id, 'calm-advisor');
    expect(picked.cardId).toBe('calm-advisor');
    const switched = services.assistants.update(created.id, { systemPrompt: '第三版。' });
    expect(switched.cardId).not.toBe('calm-advisor');
    // 内置卡原文纹丝不动
    expect(services.characterCards.get('calm-advisor').rawMarkdown).toContain('沉稳顾问');
  });
});
