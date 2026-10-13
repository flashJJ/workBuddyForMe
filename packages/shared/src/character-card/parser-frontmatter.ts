/**
 * v1.8 角色卡 frontmatter 极简解析（零三方依赖）。
 *
 * 仅支持 4 个已知标量字段；未知字段忽略（前向兼容）。
 * 数组/对象/多行块/重复键/非 key:value 行一律判 frontmatterInvalid。
 */
import {
  CARD_DESCRIPTION_MAX_CHARS,
  CARD_VOICE_MAX_CHARS,
  type CharacterCardDiagnostic,
} from '../schemas/character-card';

export interface RawFrontmatter {
  name?: string;
  description?: string;
  defaultEmotion?: string;
  voice?: string;
}

/** 规范字段名（白名单；其他字段一律忽略） */
const KNOWN_FM_KEYS = new Set(['name', 'description', 'defaultEmotion', 'voice']);

function err(
  code: CharacterCardDiagnostic['code'],
  message: string,
  line: number | null,
): CharacterCardDiagnostic {
  return { code, message, line };
}

function stripQuotes(v: string): string {
  const t = v.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * @param lines frontmatter 内容行（不含两条 --- 分隔线）
 * @param startLine 首行内容的物理行号（行号诊断用）
 */
export function parseFrontmatter(
  lines: string[],
  startLine: number,
): RawFrontmatter | CharacterCardDiagnostic[] {
  const out: RawFrontmatter = {};
  const seen = new Set<string>();
  const errors: CharacterCardDiagnostic[] = [];
  lines.forEach((line, i) => {
    const lineNo = startLine + i + 1;
    if (!line.trim()) return;
    const m = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (!m || m[1] === undefined || m[2] === undefined) {
      errors.push(err('frontmatterInvalid', `第 ${lineNo} 行不是合法的 key: value 标量`, lineNo));
      return;
    }
    const key = m[1].trim();
    const value = m[2].trim();
    if (!KNOWN_FM_KEYS.has(key)) return;
    if (seen.has(key)) {
      errors.push(err('frontmatterInvalid', `字段 ${key} 重复定义`, lineNo));
      return;
    }
    if (/^[[{]/.test(value) || /[|>]$/.test(value) || /^\s{2,}\S/.test(line)) {
      errors.push(err('frontmatterInvalid', `字段 ${key} 只支持标量值`, lineNo));
      return;
    }
    seen.add(key);
    out[key as keyof RawFrontmatter] = value ? stripQuotes(value) : '';
  });

  // 长度校验（name 非空/长度在主流程校验，此处只管描述与 voice 上限）
  if ((out.description ?? '').length > CARD_DESCRIPTION_MAX_CHARS) {
    errors.push(
      err('frontmatterInvalid', `description 不能超过 ${CARD_DESCRIPTION_MAX_CHARS} 字符`, null),
    );
  }
  if (out.voice && out.voice.length > CARD_VOICE_MAX_CHARS) {
    errors.push(err('frontmatterInvalid', `voice 不能超过 ${CARD_VOICE_MAX_CHARS} 字符`, null));
  }
  return errors.length ? errors : out;
}
