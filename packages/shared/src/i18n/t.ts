import type {
  MessageNode,
  MessageVars,
  MissingContext,
  MissingReason,
  PluralRule,
} from './types';

/**
 * t() 纯函数内核（无 React/无副作用，可在任意端使用）：
 *
 *   translate(dict, 'common.actions.save')
 *   translate(dict, 'x.welcome', { name: 'Ada' })          // {name} 插值
 *   translate(dict, 'x.items', { count: 2 })               // ICU-lite 复数
 *
 * 缺键回退：主字典 → fallback 字典 → key 本身（保底不显示空白）。
 * 缺键/缺变量通过 onMissing 上报（dev console.warn、测试 fail 模式）。
 */

/** 普通插值 {name}（复数块在前置扫描环节已被消费） */
const VAR_RE = /\{(\w+)\}/g;
const IDENT_RE = /[A-Za-z0-9_]/;

/** 点路径寻址；中途遇到叶子（string）或缺失返回 undefined */
export function lookup(dict: MessageNode | undefined, key: string): string | undefined {
  if (!dict) return undefined;
  let cur: string | MessageNode | undefined = dict;
  for (const seg of key.split('.')) {
    if (cur === undefined || typeof cur === 'string') return undefined;
    cur = cur[seg];
  }
  return typeof cur === 'string' ? cur : undefined;
}

interface PluralBlock {
  /** 计数变量名 */
  name: string;
  /** 选项原文（one/other），可能再含 {var} 与 # */
  options: Partial<Record<'one' | 'other', string>>;
  /** 整块在源串中的结束下标（不含） */
  end: number;
}

function skipWs(s: string, i: number): number {
  while (i < s.length && (s[i] === ' ' || s[i] === '\t')) i += 1;
  return i;
}

function readIdent(s: string, i: number): [string, number] | null {
  let j = i;
  while (j < s.length && IDENT_RE.test(s[j]!)) j += 1;
  return j > i ? [s.slice(i, j), j] : null;
}

function expectChar(s: string, i: number, ch: string): number | null {
  const j = skipWs(s, i);
  return s[j] === ch ? j + 1 : null;
}

/**
 * 从 start（指向 '{'）尝试解析一个复数块：
 *   { count , plural , one {…} other {…} }
 * 选项文本允许再嵌套一层花括号（{var} 插值）；任何一步不符则返回 null，
 * 调用方把该 '{' 当普通文本交给后续插值环节。
 */
function parsePluralBlock(s: string, start: number): PluralBlock | null {
  if (s[start] !== '{') return null;
  let i = skipWs(s, start + 1);

  const nameRead = readIdent(s, i);
  if (!nameRead) return null;
  const [name, afterName] = nameRead;

  let j = expectChar(s, afterName, ',');
  if (j === null) return null;
  i = skipWs(s, j);

  const kw = readIdent(s, i);
  if (!kw || kw[0] !== 'plural') return null;
  j = expectChar(s, kw[1], ',');
  if (j === null) return null;
  i = j;

  const options: PluralBlock['options'] = {};
  while (i < s.length) {
    i = skipWs(s, i);
    if (s[i] === '}') break; // 整块结束
    const opt = readIdent(s, i);
    if (
      !opt ||
      (opt[0] !== 'one' && opt[0] !== 'other') ||
      options[opt[0] as 'one' | 'other'] !== undefined
    ) {
      return null;
    }
    const form = opt[0] as 'one' | 'other';
    if (s[skipWs(s, opt[1])] !== '{') return null;
    // 花括号配平扫描选项体（允许内嵌一层 {var}）
    let depth = 1;
    let k = skipWs(s, opt[1]) + 1;
    const bodyStart = k;
    for (; k < s.length; k += 1) {
      if (s[k] === '{') depth += 1;
      else if (s[k] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) return null;
    options[form] = s.slice(bodyStart, k);
    i = k + 1;
  }

  // 循环正常结束必须停在整块闭合 '}' 上；other 必须存在
  if (s[i] !== '}' || options.other === undefined) return null;
  return { name, options, end: i + 1 };
}

export interface TranslateOptions {
  /** 主字典缺键时的回退字典（前端场景固定传 zh-CN） */
  fallbackDict?: MessageNode;
  /** 复数选择规则；不传恒 other（中文行为） */
  pluralRule?: PluralRule;
  /** 缺键/缺变量上报；同一次翻译内主、备字典都缺键只上报一次 */
  onMissing?: (reason: MissingReason, ctx: MissingContext) => void;
}

interface FormatCtx {
  key: string;
  pluralRule: PluralRule;
  onMissing?: TranslateOptions['onMissing'];
}

function report(ctx: FormatCtx, reason: MissingReason, varName?: string) {
  ctx.onMissing?.(reason, { key: ctx.key, ...(varName ? { varName } : {}) });
}

/**
 * 模板渲染：
 * 1. 扫描并替换复数块（# 在此替换；选项内 {var} 保留给第 2 步统一插值）
 * 2. 全文本做普通 {name} 插值（含复数选项内的变量）
 */
function format(template: string, vars: MessageVars | undefined, ctx: FormatCtx): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const nextBrace = template.indexOf('{', i);
    if (nextBrace === -1) {
      out += template.slice(i);
      break;
    }
    const block = parsePluralBlock(template, nextBrace);
    if (!block) {
      // 非复数块：原样保留到插值环节
      out += template.slice(i, nextBrace + 1);
      i = nextBrace + 1;
      continue;
    }
    out += template.slice(i, nextBrace);
    const raw = vars?.[block.name];
    const n = typeof raw === 'number' ? raw : Number(raw);
    let chosen: string;
    if (raw === undefined || !Number.isFinite(n)) {
      report(ctx, 'missingVar', block.name);
      chosen = block.options.other!.replace(/#/g, '0');
    } else {
      const form = ctx.pluralRule(n);
      const body = block.options[form] ?? block.options.other!;
      chosen = body.replace(/#/g, String(raw));
    }
    out += chosen;
    i = block.end;
  }

  return out.replace(VAR_RE, (whole, vname: string) => {
    const v = vars?.[vname];
    if (v === undefined) {
      report(ctx, 'missingVar', vname);
      return whole;
    }
    return String(v);
  });
}

export function translate(
  dict: MessageNode,
  key: string,
  vars?: MessageVars,
  options: TranslateOptions = {},
): string {
  const ctx: FormatCtx = {
    key,
    pluralRule: options.pluralRule ?? (() => 'other'),
    onMissing: options.onMissing,
  };

  let template = lookup(dict, key);
  if (template === undefined) {
    report(ctx, 'missingKey');
    template = options.fallbackDict ? lookup(options.fallbackDict, key) : undefined;
    if (template === undefined) return key;
  }
  return format(template, vars, ctx);
}

/** 绑定字典与选项的翻译器（Provider/hook 与非 React 场景共用） */
export function createTranslator(
  dict: MessageNode,
  options: TranslateOptions = {},
): (key: string, vars?: MessageVars) => string {
  return (key, vars) => translate(dict, key, vars, options);
}
