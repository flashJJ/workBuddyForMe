#!/usr/bin/env node
/**
 * v1.8 主题色板 WCAG 对比度校验（无依赖）。
 *
 * HSL 三元组 -> sRGB -> 相对亮度 -> 对比度：
 *   https://www.w3.org/TR/WCAG22/#dfn-contrast-ratio
 *
 * 用法：
 *   node scripts/theme-contrast.mjs           # 校验内置 5 个色板的关键文字配对
 *   node scripts/theme-contrast.mjs --json     # JSON 输出（M1 补齐全量 token 后供 CI 使用）
 *
 * M0：覆盖正文/次要文字/卡片正文/主色按钮字/语义色 7 组关键配对；
 * M1：四套色板全部 token 落 globals.css 后在此补齐「文字类 token on 其底色」全配对。
 */

const PALETTES = {
  stellarLight: {
    background: [0, 0, 100],
    foreground: [222, 47, 11],
    mutedFg: [215, 20, 40],
    card: [0, 0, 100],
    cardFg: [222, 47, 11],
    primary: [221, 83, 53],
    primaryFg: [210, 40, 98],
    semantic: {
      success: [152, 60, 28],
      warning: [32, 90, 32],
      info: [217, 91, 42],
    },
  },
  stellarDark: {
    background: [222, 47, 8],
    foreground: [210, 40, 96],
    mutedFg: [215, 20, 65],
    card: [222, 44, 11],
    cardFg: [210, 40, 96],
    primary: [217, 91, 60],
    primaryFg: [222, 47, 8],
    semantic: {
      success: [152, 52, 62],
      warning: [38, 92, 62],
      info: [213, 100, 74],
    },
  },
  // 夜金（暗色暖金）
  nocturneGold: {
    background: [30, 14, 9],
    foreground: [40, 30, 88],
    mutedFg: [38, 18, 64],
    card: [30, 13, 12],
    cardFg: [40, 30, 88],
    primary: [38, 72, 58],
    primaryFg: [32, 42, 10],
    semantic: {
      success: [150, 48, 64],
      warning: [38, 88, 62],
      info: [42, 80, 70],
    },
  },
  // 月白（亮色素净）
  moonwhite: {
    background: [210, 20, 98],
    foreground: [222, 32, 14],
    mutedFg: [215, 18, 38],
    card: [0, 0, 100],
    cardFg: [222, 32, 14],
    primary: [222, 45, 42],
    primaryFg: [210, 40, 98],
    semantic: {
      success: [158, 52, 26],
      warning: [30, 78, 30],
      info: [212, 60, 38],
    },
  },
  // 樱粉（亮色柔粉）
  sakura: {
    background: [340, 30, 97],
    foreground: [328, 28, 16],
    mutedFg: [328, 14, 40],
    card: [0, 0, 100],
    cardFg: [328, 28, 16],
    primary: [340, 65, 44],
    primaryFg: [340, 60, 98],
    semantic: {
      success: [160, 52, 26],
      warning: [28, 80, 30],
      info: [332, 55, 42],
    },
  },
};

/** 正文 AA 4.5:1；大字/UI 3:1 */
const AA_TEXT = 4.5;

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function linearize(c) {
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hsl) {
  const [r, g, b] = hslToRgb(...hsl).map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function pairsFor(p) {
  return [
    ['正文/底色', p.foreground, p.background],
    ['次要文字/底色', p.mutedFg, p.background],
    ['卡片正文/卡片', p.cardFg, p.card],
    ['主色按钮字/主色', p.primaryFg, p.primary],
    ...Object.entries(p.semantic).map(([name, hsl]) => [`语义-${name}/底色`, hsl, p.background]),
  ];
}

const asJson = process.argv.includes('--json');
const report = {};
let failed = false;

for (const [name, palette] of Object.entries(PALETTES)) {
  report[name] = pairsFor(palette).map(([label, fg, bg]) => {
    const ratio = contrastRatio(fg, bg);
    if (ratio < AA_TEXT) failed = true;
    return { pair: label, ratio: Number(ratio.toFixed(2)), pass: ratio >= AA_TEXT };
  });
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const [name, rows] of Object.entries(report)) {
    console.log(`\n== ${name} ==`);
    for (const row of rows) {
      console.log(`  ${row.pair.padEnd(22)} ${String(row.ratio).padStart(6)}:1  ${row.pass ? 'AA' : 'FAIL'}`);
    }
  }
}

process.exit(failed ? 1 : 0);
