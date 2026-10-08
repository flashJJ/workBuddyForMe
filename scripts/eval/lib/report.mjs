/**
 * eval 报告汇总（v1.1 M5）：{pass,reason} 结构化结果 → 控制台行 + JSON 报告 + 退出码。
 * 退出码约定（与 eval-memory 历史一致）：
 * - 0：全部用例通过
 * - 1：有用例失败（断言层）
 * - 2：基础设施错误（连不上服务等，由 main.catch 处理）
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * @param {Array<{id:string, pass:boolean, reason?:string, failedReasons?:string[], [k:string]:unknown}>} cases
 * @param {{name:string, meta?:Record<string, unknown>}} scope
 */
export function summarize(cases, scope = {}) {
  const passed = cases.filter((c) => c.pass).length;
  const total = cases.length;
  return {
    suite: scope.name ?? 'eval',
    at: new Date().toISOString(),
    total,
    passed,
    ratio: total === 0 ? 0 : passed / total,
    meta: scope.meta ?? {},
    cases,
  };
}

/** 控制台打印每个用例的 PASS/FAIL 行与汇总；返回建议退出码（0/1） */
export function printSummary(summary) {
  for (const c of summary.cases) {
    const tail = c.pass
      ? `  ${c.reason ?? ''}`
      : `  原因：${(c.failedReasons?.length ? c.failedReasons.join('；') : c.reason) ?? '未知'}`;
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${String(c.id).padEnd(28)}${tail}`);
  }
  console.log(`\n${summary.suite}：${summary.passed}/${summary.total} 通过（${(summary.ratio * 100).toFixed(0)}%）`);
  return summary.passed === summary.total ? 0 : 1;
}

/** 写 JSON 报告（--out） */
export async function writeReport(outPath, summary) {
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`结果已写入 ${outPath}`);
}
