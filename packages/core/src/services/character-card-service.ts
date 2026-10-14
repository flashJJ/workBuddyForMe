import { ApiError } from '@wbfm/shared/errors';
import {
  parseCharacterCard,
  type CharacterCardRecord,
  type CharacterCardSource,
  type ParsedCharacterCard,
} from '@wbfm/shared/character-card';
import {
  createAssistantRepository,
  createCharacterCardRepository,
} from '@wbfm/database';
import type { ServiceDeps } from './deps';

/** 解析卡文；失败抛 422 并携带行号诊断（UI 可定位），告警不阻断（粘贴的卡尽量可用） */
function parseOrThrow(rawMarkdown: string): ParsedCharacterCard {
  const result = parseCharacterCard(rawMarkdown);
  if (!result.ok) {
    throw ApiError.validation('角色卡解析失败，请按诊断修改后重试', result.errors);
  }
  return result.card;
}

export function createCharacterCardService({ db }: ServiceDeps) {
  const cards = createCharacterCardRepository(db);
  const assistants = createAssistantRepository(db);

  const requireCard = (id: string): CharacterCardRecord => {
    const card = cards.findById(id);
    if (!card) throw ApiError.notFound('角色卡', id);
    return card;
  };

  /** 内置卡只读：改/删一律 403（可走「复制为自建卡」） */
  const requireCustom = (id: string): CharacterCardRecord => {
    const card = requireCard(id);
    if (card.source === 'builtin') {
      throw new ApiError('FORBIDDEN', '内置角色卡为只读卡片，不可修改或删除');
    }
    return card;
  };

  return {
    list(source?: CharacterCardSource): CharacterCardRecord[] {
      return cards.list(source);
    },

    get(id: string): CharacterCardRecord {
      return requireCard(id);
    },

    /** 新建自建卡：提交 Markdown 原文，服务端解析后原文/解析双份落库 */
    create(rawMarkdown: string): CharacterCardRecord {
      const parsed = parseOrThrow(rawMarkdown);
      return cards.create({ source: 'custom', rawMarkdown, parsed });
    },

    /** 更新卡原文（重新解析；内置卡由仓储 SQL 与服务层双重拦截） */
    update(id: string, rawMarkdown: string): CharacterCardRecord {
      requireCustom(id);
      const parsed = parseOrThrow(rawMarkdown);
      return cards.updateContent(id, rawMarkdown, parsed)!;
    },

    /** 删卡不级联删助手：所有引用助手回落默认卡（card_id 置空） */
    delete(id: string): void {
      requireCustom(id);
      db.transaction(() => {
        db.prepare(`UPDATE assistants SET card_id = NULL WHERE card_id = ?`).run(id);
        cards.delete(id);
      })();
    },

    /** 复制为自建卡：原文逐字复制（含内置卡），新卡可自由编辑 */
    duplicate(id: string): CharacterCardRecord {
      const card = requireCard(id);
      const parsed = parseOrThrow(card.rawMarkdown);
      return cards.create({ source: 'custom', rawMarkdown: card.rawMarkdown, parsed });
    },

    /** 助手选卡：cardId=null 表示回到默认卡 */
    assignCard(assistantId: string, cardId: string | null) {
      const assistant = assistants.findById(assistantId);
      if (!assistant) throw ApiError.notFound('助手', assistantId);
      if (cardId !== null && !cards.findById(cardId)) {
        throw ApiError.validation(`角色卡不存在：${cardId}`);
      }
      return assistants.update(assistantId, { cardId })!;
    },
  };
}

export type CharacterCardService = ReturnType<typeof createCharacterCardService>;
