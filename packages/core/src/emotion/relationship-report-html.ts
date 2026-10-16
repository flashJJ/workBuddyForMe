/**
 * 关系报告 → 单文件 HTML（M5 / G4）。
 *
 * 红线：零网络外链——无 <link>/<script src>/url(http)/http(s) 引用，单测断言。
 * 内联 CSS、纯静态标签，浏览器直接打开即读；节可选（sections），被删记忆项在
 * 聚合阶段已整体抹除，本文件不接触原始数据。
 */
import type { Language } from '@wbfm/shared/constants';
import type {
  RelationshipReportData,
  ReportSectionKey,
} from './relationship-report';
import { REPORT_SECTION_KEYS } from './relationship-report';
import {
  ZH_REPORT_LABELS as ZH,
  EN_REPORT_LABELS as EN,
} from './relationship-report-html-labels';

const STYLES = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{margin:0;padding:32px 16px;background:#f4f5f7;color:#1a1d21;
 font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;
 font-size:14px;line-height:1.65}
.wrap{max-width:820px;margin:0 auto}
header.doc{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;margin-bottom:18px}
header.doc h1{margin:0 0 6px;font-size:20px}
header.doc .meta{color:#6b7280;font-size:12px}
section.card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:18px 22px;margin-bottom:16px}
section.card h2{margin:0 0 14px;font-size:15px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px}
.kpi .v{font-size:22px;font-weight:700}
.kpi .k{color:#6b7280;font-size:12px;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eef1f5}
th{color:#6b7280;font-weight:600;font-size:12px}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.tag{display:inline-block;padding:1px 9px;border-radius:999px;font-size:12px;font-weight:600}
.t0{background:#eef1f5;color:#475569}.t1{background:#e0f2fe;color:#0369a1}
.t2{background:#dcfce7;color:#15803d}.t3{background:#fef3c7;color:#b45309}
.bar-row{display:flex;align-items:flex-end;gap:2px;height:110px;margin-top:8px}
.bar{flex:1 1 0;min-width:0;background:#93c5fd;border-radius:3px 3px 0 0;position:relative}
.bar.hot{background:#fbbf24}
.axis{display:flex;justify-content:space-between;color:#9ca3af;font-size:11px;margin-top:4px}
.legend{display:flex;gap:14px;flex-wrap:wrap;color:#4b5563;font-size:12px;margin-top:10px}
.legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:4px}
.pill{display:inline-block;background:#eef1f5;border-radius:999px;padding:2px 10px;font-size:12px;margin:0 6px 6px 0}
.muted{color:#6b7280}
footer{color:#9ca3af;font-size:12px;text-align:center;padding:8px 0 20px}
@media(max-width:640px){.kpis{grid-template-columns:repeat(2,1fr)}}
`;

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export interface ReportHtmlOptions {
  locale?: Language;
  /** 导出的节；默认全选 */
  sections?: readonly ReportSectionKey[];
}

export function renderRelationshipReportHtml(
  data: RelationshipReportData,
  options: ReportHtmlOptions = {},
): string {
  const locale: Language = options.locale === 'en-US' ? 'en-US' : 'zh-CN';
  const t = locale === 'en-US' ? EN : ZH;
  const sections = new Set(options.sections ?? REPORT_SECTION_KEYS);
  const lvl = (n: number) => t[`lv${n}`] ?? String(n);

  const overviewSection = (): string => {
    const o = data.overview;
    const dist = [0, 1, 2, 3]
      .map((i) => `<span class="pill"><span class="tag t${i}">${lvl(i)}</span> ${o.levelDistribution[i]}</span>`)
      .join('');
    const reach = [1, 2, 3]
      .map((i) => `<span class="pill">${lvl(i)} × ${o.unlockReach[i - 1]}</span>`)
      .join('');
    return `<section class="card"><h2>${t.sOverview}</h2>
<div class="kpis">
 <div class="kpi"><div class="v">${o.assistantCount}</div><div class="k">${t.assistantCount}</div></div>
 <div class="kpi"><div class="v">${o.currentStreakDays}</div><div class="k">${t.streak}</div></div>
 <div class="kpi"><div class="v">${o.totalActiveDays}</div><div class="k">${t.activeDays}</div></div>
 <div class="kpi"><div class="v">${o.upgradeMedianDays ?? '—'}</div><div class="k">${t.median}（${t.days}）</div></div>
</div>
<p style="margin:14px 0 4px" class="muted">${t.levelDist}</p><div>${dist}</div>
<p style="margin:10px 0 4px" class="muted">${t.unlock}</p><div>${reach}</div>
</section>`;
  };

  const assistantsSection = (): string => {
    if (data.assistants.length === 0) return `<section class="card"><h2>${t.sAssistants}</h2><p class="muted">${t.empty}</p></section>`;
    const rows = data.assistants
      .map(
        (a) => `<tr><td>${esc(a.name)}</td>
<td><span class="tag t${a.level}">${lvl(a.level)}</span></td>
<td><span class="tag t${a.highestLevelEver}">${lvl(a.highestLevelEver)}</span></td>
<td class="num">${a.intimacy.toFixed(1)}</td><td class="num">${a.trust.toFixed(1)}</td>
<td>${a.lastPositiveDay ? esc(a.lastPositiveDay) : `<span class="muted">${t.never}</span>`}</td>
<td class="num">${a.milestonesAchieved}</td></tr>`,
      )
      .join('');
    return `<section class="card"><h2>${t.sAssistants}</h2>
<table><thead><tr><th>${t.colName}</th><th>${t.colLevel}</th><th>${t.colHighest}</th>
<th class="num">${t.colIntimacy}</th><th class="num">${t.colTrust}</th><th>${t.colLast}</th>
<th class="num">${t.colMilestones}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  };

  const milestonesSection = (): string => {
    if (data.milestones.length === 0)
      return `<section class="card"><h2>${t.sMilestones}</h2><p class="muted">${t.empty}</p></section>`;
    const rows = data.milestones
      .map(
        (m) => `<tr><td>${esc(t[m.key] ?? m.key)}</td><td>${esc(m.dayKey || m.achievedAt)}</td><td>${esc(m.assistantName)}</td></tr>`,
      )
      .join('');
    return `<section class="card"><h2>${t.sMilestones}</h2>
<table><thead><tr><th>${t.mKey}</th><th>${t.mDate}</th><th>${t.mAssistant}</th></tr></thead>
<tbody>${rows}</tbody></table></section>`;
  };

  const disturbanceSection = (): string => {
    const d = data.disturbance;
    if (d.total === 0)
      return `<section class="card"><h2>${t.sDisturbance}</h2><p class="muted">${t.empty}</p></section>`;
    const reasons = d.suppressByReason
      .map((r) => `<span class="pill">${esc(t[r.reason] ?? r.reason)} × ${r.count}</span>`)
      .join('');
    return `<section class="card"><h2>${t.sDisturbance}</h2>
<div class="kpis">
 <div class="kpi"><div class="v">${d.total}</div><div class="k">${t.total}</div></div>
 <div class="kpi"><div class="v">${d.admitted}</div><div class="k">${t.admitted}</div></div>
 <div class="kpi"><div class="v">${d.suppressed}</div><div class="k">${t.suppressed}</div></div>
 <div class="kpi"><div class="v">${pct(d.suppressionRate)}</div><div class="k">${t.rate}</div></div>
</div>
<p style="margin:12px 0 4px" class="muted">${t.played} ${d.played} · ${t.skipped} ${d.skipped} · ${t.interrupted} ${d.interrupted}</p>
<p style="margin:8px 0 4px" class="muted">${t.reason}</p><div>${reasons || `<span class="muted">${t.never}</span>`}</div>
</section>`;
  };

  const seriesSection = (): string => {
    const max = Math.max(1, ...data.series.map((p) => p.total));
    const bars = data.series
      .map((p) => {
        const height = Math.round((p.total / max) * 100);
        const hot = p.levelUp > 0;
        const tip = `${p.dayKey} · ${t.praise}:${p.praise} ${t.chat}:${p.chat} ${t.comfort}:${p.comfort} ${t.belittle}:${p.belittle} ${t.levelUp}:${p.levelUp} ${t.levelDown}:${p.levelDown}`;
        return `<div class="bar ${hot ? 'hot' : ''}" style="height:${height}%" title="${esc(tip)}"></div>`;
      })
      .join('');
    const first = data.series[0]?.dayKey ?? '';
    const last = data.series[data.series.length - 1]?.dayKey ?? '';
    return `<section class="card"><h2>${t.sSeries} · ${data.seriesDays}${locale === 'en-US' ? 'd' : ' 天'}</h2>
<div class="bar-row">${bars}</div><div class="axis"><span>${esc(first)}</span><span>${esc(last)}</span></div>
<div class="legend"><span><i style="background:#93c5fd"></i>${t.chat}/${t.praise}/${t.comfort}</span>
<span><i style="background:#fbbf24"></i>${t.levelUp}</span></div></section>`;
  };

  const blocks: string[] = [];
  if (sections.has('overview')) blocks.push(overviewSection());
  if (sections.has('assistants')) blocks.push(assistantsSection());
  if (sections.has('milestones')) blocks.push(milestonesSection());
  if (sections.has('disturbance')) blocks.push(disturbanceSection());
  if (sections.has('series')) blocks.push(seriesSection());

  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(t.title ?? '')}</title><style>${STYLES}</style></head>
<body><div class="wrap">
<header class="doc"><h1>${esc(t.title ?? '')}</h1>
<div class="meta">${esc(t.subtitle ?? '')} · ${t.generatedAt} ${esc(data.generatedAt)}</div></header>
${blocks.join('\n')}
<footer>${esc(t.footer ?? '')}</footer>
</div></body></html>`;
}
