import type { MessageVars } from './types';

/**
 * 系统消息的语言中立线格式（跨端持久化协议）：
 *
 *   \u0001 + JSON.stringify({ k: 'i18n.key', v?: { var: 值 } }) + \u0002
 *
 * - SOH/STX 控制字符定界，JSON 体内可含任意字符（花括号/中文）均无歧义；
 * - 可整串存储（unfinished/errorMessage），也可夹带在普通文本中间（如「[标记] 用户目标」）；
 * - 模型产出与历史旧数据不带标记，渲染时原样透传；
 * - vars 的字符串值若本身是系统消息标记，渲染器递归展开（允许注记嵌套末次原因）。
 *
 * 渲染端：
 * - core 模型边界固定按 zh-CN 解码（模型协议语言）；
 * - web 按当前 UI 语言用 t(key, vars) 解码，历史记录随语言切换即时变化。
 */

// 用 fromCharCode 构造：源码中直接写 SOH/STX 字面量会被编辑链吞掉
const SOH = String.fromCharCode(0x01);
const STX = String.fromCharCode(0x02);
// RegExp 构造器（非字面量）：no-control-regex 规则只拦字面量；
// 组1=标记前普通文本，组2=整段标记，组3=标记体内 JSON（不含 SOH/STX）
const EMBEDDED_RE = new RegExp(`([\\s\\S]*?)(\\${SOH}([^\\${SOH}\\${STX}]+)\\${STX})`, 'g');

export interface SystemMessageRef {
  key: string;
  vars?: MessageVars;
}

/** 编码单条系统消息（SOH…STX 包裹） */
export function encodeSystemMessage(key: string, vars?: MessageVars): string {
  return SOH + JSON.stringify(vars ? { k: key, v: vars } : { k: key }) + STX;
}

/** 仅当整串是一条系统消息时解析（夹带/普通文本返回 null） */
export function parseSystemMessage(raw: string): SystemMessageRef | null {
  if (raw.length < 3 || raw[0] !== SOH) return null;
  const end = raw.indexOf(STX);
  if (end === -1) return null;
  try {
    const obj = JSON.parse(raw.slice(1, end)) as { k?: unknown; v?: unknown };
    if (typeof obj.k !== 'string') return null;
    return { key: obj.k, ...(obj.v && typeof obj.v === 'object' ? { vars: obj.v as MessageVars } : {}) };
  } catch {
    return null;
  }
}

/**
 * 渲染文本中夹带的全部系统消息标记；普通文本原样返回。
 * vars 内的字符串值若也是标记，先递归展开（支持嵌套一层原因链）。
 */
export function renderEmbeddedMessages(
  raw: string,
  render: (key: string, vars?: MessageVars) => string,
): string {
  if (!raw.includes(SOH)) return raw;
  return raw.replace(EMBEDDED_RE, (_all, prefix: string, _tag: string, body: string) => {
    let rendered = prefix;
    try {
      const obj = JSON.parse(body) as { k?: unknown; v?: unknown };
      if (typeof obj.k === 'string') {
        const rawVars = obj.v && typeof obj.v === 'object' ? (obj.v as Record<string, unknown>) : undefined;
        let vars: MessageVars | undefined;
        if (rawVars) {
          vars = {};
          for (const [name, value] of Object.entries(rawVars)) {
            // 非字符串/数字变量（脏数据）做字符串化兜底
            vars[name] =
              typeof value === 'string'
                ? renderEmbeddedMessages(value, render)
                : typeof value === 'number'
                  ? value
                  : String(value);
          }
        }
        rendered += render(obj.k, vars);
        return rendered;
      }
    } catch {
      // 坏标记：原样透传整段
    }
    return prefix + _tag;
  });
}
