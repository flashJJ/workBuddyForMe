/**
 * v1.7 本地短语包含匹配（纯函数，与 v025 自定义短语同口径）。
 *
 * 不做正则、不触网：lowercase + NFKC 折叠空白后 includes；
 * 英文短词要求词边界，避免 "gn" 误中 "signature" 之类（中文不受影响）。
 */

/** 归一化：小写 + NFKC（全角→半角）+ 所有空白折叠为单个空格、trim */
export function normalizePhrase(text: string): string {
  return text
    .toLocaleLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function isAsciiWord(phrase: string): boolean {
  return /^[a-z0-9'’.-]+$/.test(phrase);
}

/** 任一短语命中即 true；空词表/空文本恒 false */
export function matchAnyPhrase(text: string, phrases: readonly string[]): boolean {
  const haystack = normalizePhrase(text);
  if (!haystack) return false;
  for (const raw of phrases) {
    const needle = normalizePhrase(raw);
    if (!needle) continue;
    if (isAsciiWord(needle)) {
      const escaped = needle.replace(/[.\\^$?*+(){}[\]|-]/g, '\\$&');
      const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
      if (re.test(haystack)) return true;
    } else if (haystack.includes(needle)) {
      return true;
    }
  }
  return false;
}
