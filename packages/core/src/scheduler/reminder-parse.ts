/**
 * v1.7 M5 对话中自然语言创建提醒的本地解析（纯函数，无网络/LLM）。
 *
 * 设计取舍（M0 G5：缺时间追问、否定不创建、24h 内规则）：
 * - 高精确率优先于召回：只认「提醒我/叫我/通知我」三个明确起词，避免误把陈述句建成提醒；
 * - 否定式（不要/别/不用提醒…）一律不创建；
 * - 有起词有内容但解析不出时间 → needTime（由对话层追问），不猜时间；
 * - 时间支持：今天/明天/后天/大后天 + 早/中/晚时段 + X点(半)(Y分)/HH:MM；
 *   周X/礼拜X/星期X；每天/每日/天天；N 小时/分钟后（相对时间）；
 * - 时区口径与 computeNextRunMs 一致：本版固定 Asia/Shanghai（UTC+8）。
 */

export type ParsedReminderKind = 'once' | 'daily' | 'weekly';

export interface ParsedReminder {
  kind: ParsedReminderKind;
  hour: number;
  minute: number;
  /** weekly 必填（0..6，JS getDay） */
  weekday?: number | null;
  /** once 必填（YYYY-MM-DD） */
  atDate?: string | null;
  /** 去掉起词与时间短语后的提醒正文 */
  text: string;
}

export type ReminderParseResult =
  | { outcome: 'create'; reminder: ParsedReminder }
  | { outcome: 'needTime' }
  | { outcome: 'none' };

const SHANGHAI_OFFSET_MS = 8 * 3600_000;

/** 起词（必须命中其一才视为提醒请求） */
const TRIGGER_RE = /(?:提醒\s*我|叫\s*我|通知\s*我)/;
/** 否定：起词前出现「不要/别/不用/不需要」等 */
const NEGATION_RE = /(?:不要|不用|不需要|别|甭)(?:提醒|叫|通知)/;

const DAY_WORDS: ReadonlyArray<{ re: RegExp; offset: number }> = [
  { re: /大后天/, offset: 3 },
  { re: /后天/, offset: 2 },
  { re: /(?:明天|明儿|明早|明晚)/, offset: 1 },
  { re: /(?:今天|今晚|今儿)/, offset: 0 },
];

const WEEKDAY_RE = /(?:周|礼拜|星期)\s*(天|日|末|[一二三四五六日1-7])/;
const DAILY_RE = /(?:每天|每日|天天|每日天)/;
const RELATIVE_RE = /(\d{1,3})\s*(个?)\s*(小时|钟头|分钟?|分)(?:钟)?(?:以后|之后|后)/;

const WEEKDAY_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  日: 0,
  天: 0,
  末: 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 0,
};

interface Clock {
  hour: number;
  minute: number;
}

/** 从 +8 偏移毫秒取本地日历分量 */
function shanghaiParts(ms: number): { year: number; month: number; day: number; weekday: number } {
  const d = new Date(ms + SHANGHAI_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
  };
}

function dateKeyAfter(nowMs: number, offsetDays: number): string {
  const d = new Date(nowMs + SHANGHAI_OFFSET_MS + offsetDays * 86_400_000);
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * 解析钟点：
 * - 显式 HH:MM（24h 制）；
 * - 「X点(半)」/「X点Y分」+ 时段前缀（早上/上午/中午/下午/晚上/傍晚/今晚）。
 * 返回 null 表示文本中没有可识别的钟点。
 */
function parseClock(text: string): Clock | null {
  const hhmm = /(\d{1,2})[：:](\d{1,2})/.exec(text);
  if (hhmm) {
    const hour = Number(hhmm[1]);
    const minute = Number(hhmm[2]);
    if (hour <= 23 && minute <= 59) return { hour, minute };
  }

  const periodMatch = /(凌晨|早上|早晨|上午|中午|正午|下午|傍晚|晚上|今晚)/.exec(text);
  const period = periodMatch?.[1];
  const clockMatch = /(\d{1,2})\s*点(?:\s*(\d{1,2})\s*分)?(?:半)?/.exec(text);
  const half = /点\s*半/.test(text);
  if (!clockMatch) {
    // 「中午/今晚」等时段词独立出现：给常用默认钟点
    if (period === '中午' || period === '正午') return { hour: 12, minute: 0 };
    if (period === '晚上' || period === '傍晚' || period === '今晚') return { hour: 20, minute: 0 };
    if (period === '早上' || period === '早晨' || period === '上午' || period === '凌晨') {
      return { hour: 8, minute: 0 };
    }
    return null;
  }

  let hour = Number(clockMatch[1]);
  const minute = clockMatch[2] !== undefined ? Number(clockMatch[2]) : half ? 30 : 0;
  if (hour > 24 || minute > 59) return null;

  if (period === '下午' || period === '晚上' || period === '傍晚') {
    if (hour < 12) hour += 12;
  } else if (period === '中午' || period === '正午') {
    if (hour < 6) hour = 12;
  } else if (period === '凌晨') {
    if (hour === 12) hour = 0;
  } else if (period === '早上' || period === '早晨' || period === '上午') {
    if (hour === 12) hour = 0;
  }
  // 无时段词时按 24h 字面处理（用户写「19点」即 19 点）
  if (hour === 24) hour = 0;
  return { hour, minute };
}

/** 删除起词、时间短语与标点，得到提醒正文 */
function extractText(text: string): string {
  return text
    .replace(TRIGGER_RE, ' ')
    .replace(DAILY_RE, ' ')
    .replace(/每(?=\s*(?:周|礼拜|星期|天|日))/g, ' ')
    .replace(WEEKDAY_RE, ' ')
    .replace(/(?:大后天|后天|明天|明儿|明早|明晚|今天|今晚|今儿)/g, ' ')
    .replace(RELATIVE_RE, ' ')
    .replace(/(?:凌晨|早上|早晨|上午|中午|正午|下午|傍晚|晚上)/g, ' ')
    .replace(/\d{1,2}[：:]\d{1,2}/g, ' ')
    .replace(/\d{1,3}\s*点(?:\s*\d{1,2}\s*分)?半?/g, ' ')
    .replace(/^[\s，。,.！!？?、:：;；"“”'’]+/, '')
    .replace(/[\s，。,.！!？?、:：;；"“”'’]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 主入口。nowMs 默认 Date.now()（注入便于单测）；返回三态结果。
 */
export function parseReminderRequest(rawText: string, nowMs: number = Date.now()): ReminderParseResult {
  const text = rawText.trim();
  if (!text) return { outcome: 'none' };
  if (NEGATION_RE.test(text)) return { outcome: 'none' };
  if (!TRIGGER_RE.test(text)) return { outcome: 'none' };

  const content = extractText(text);

  // 相对时间：N 小时/分钟后（一次性，24h 内规则不强制拦截，仅限制 0<N≤72h / 分钟）
  const relative = RELATIVE_RE.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[3] ?? '';
    const deltaMs = unit.startsWith('小时') || unit.startsWith('钟头')
      ? amount * 3600_000
      : amount * 60_000;
    if (deltaMs <= 0) return { outcome: 'needTime' };
    const target = new Date(nowMs + deltaMs + SHANGHAI_OFFSET_MS);
    const pad = (v: number) => String(v).padStart(2, '0');
    if (!content) return { outcome: 'needTime' };
    return {
      outcome: 'create',
      reminder: {
        kind: 'once',
        hour: target.getUTCHours(),
        minute: target.getUTCMinutes(),
        atDate: `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`,
        text: content,
      },
    };
  }

  const clock = parseClock(text);
  const daily = DAILY_RE.test(text);
  const weekMatch = WEEKDAY_RE.exec(text);

  if (daily) {
    // 每天：缺钟点按常用早 9 点不合理（无据）→ 追问
    if (!clock) return { outcome: 'needTime' };
    if (!content) return { outcome: 'needTime' };
    return {
      outcome: 'create',
      reminder: { kind: 'daily', hour: clock.hour, minute: clock.minute, text: content },
    };
  }

  if (weekMatch) {
    const weekday = WEEKDAY_MAP[weekMatch[1] ?? ''];
    if (weekday === undefined || !clock) return { outcome: 'needTime' };
    if (!content) return { outcome: 'needTime' };
    return {
      outcome: 'create',
      reminder: {
        kind: 'weekly',
        hour: clock.hour,
        minute: clock.minute,
        weekday,
        text: content,
      },
    };
  }

  // 单次：日期锚点（今天/明天/后天/大后天）或仅有钟点
  const dayAnchor = DAY_WORDS.find(({ re }) => re.test(text));
  if (!clock) {
    // 有起词但完全没时间 → 追问（哪怕含「明天」，「明天提醒我」缺具体时刻也追问）
    return { outcome: 'needTime' };
  }
  if (!content) return { outcome: 'needTime' };

  if (dayAnchor) {
    return {
      outcome: 'create',
      reminder: {
        kind: 'once',
        hour: clock.hour,
        minute: clock.minute,
        atDate: dateKeyAfter(nowMs, dayAnchor.offset),
        text: content,
      },
    };
  }

  // 裸钟点：今天时刻还在未来→今天，否则明天
  const local = shanghaiParts(nowMs);
  const todayTargetMs =
    Date.UTC(local.year, local.month - 1, local.day, clock.hour, clock.minute, 0, 0) -
    SHANGHAI_OFFSET_MS;
  const offset = todayTargetMs > nowMs ? 0 : 1;
  return {
    outcome: 'create',
    reminder: {
      kind: 'once',
      hour: clock.hour,
      minute: clock.minute,
      atDate: dateKeyAfter(nowMs, offset),
      text: content,
    },
  };
}
