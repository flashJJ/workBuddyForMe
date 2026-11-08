import { z } from 'zod';

/**
 * v2.26 P1 摘要器 JSON 输出契约：
 * { summary, facts[], decisions[], open_loops[] }
 *
 * 兼容策略：模型偶尔返回纯文本或包裹代码块，解析失败时回退为
 * 「正文即摘要、结构化字段为空」，绝不因格式问题丢失摘要。
 */

const summaryFactSchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(400),
  unit: z.string().trim().max(24).nullish(),
  validFrom: z.string().trim().max(40).nullish(),
});

const summaryPayloadSchema = z.object({
  summary: z.string().trim().min(1).max(8000),
  facts: z.array(summaryFactSchema).max(20).optional(),
  decisions: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
  open_loops: z.array(z.string().trim().min(1).max(300)).max(10).optional(),
});

export interface SummaryFact {
  key: string;
  value: string;
  unit: string | null;
  validFrom: string | null;
}

export interface SummaryPayload {
  summary: string;
  facts: SummaryFact[];
  decisions: string[];
  openLoops: string[];
}

/** 去除模型包裹的代码块围栏与首尾空白 */
export function stripSummaryFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|markdown|md|text)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

/** 从混合文本中截取第一个 { 到最后一个 } 的 JSON 片段 */
function extractJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

/**
 * 解析摘要器输出：
 * 1. 合法 JSON 且通过校验 → 结构化载荷；
 * 2. JSON 残缺/字段越界 → 回退纯文本摘要；
 * 3. 空输出 → null（由调用方判定为失败）。
 */
export function parseSummaryPayload(raw: string): SummaryPayload | null {
  const text = stripSummaryFence(raw);
  if (!text) return null;

  const json = extractJsonObject(text);
  if (json) {
    try {
      const parsed = summaryPayloadSchema.safeParse(JSON.parse(json));
      if (parsed.success) {
        return {
          summary: parsed.data.summary,
          facts: (parsed.data.facts ?? []).map((fact) => ({
            key: fact.key,
            value: fact.value,
            unit: fact.unit ?? null,
            validFrom: fact.validFrom ?? null,
          })),
          decisions: parsed.data.decisions ?? [],
          openLoops: parsed.data.open_loops ?? [],
        };
      }
    } catch {
      // JSON.parse 失败走纯文本回退
    }
  }

  return { summary: text, facts: [], decisions: [], openLoops: [] };
}

/** 校验并归一化外部传入的事实列表（写入/测试共用） */
export function normalizeSummaryFacts(facts: readonly SummaryFact[]): SummaryFact[] {
  return facts
    .map((fact) => ({
      key: fact.key.trim(),
      value: fact.value.trim(),
      unit: fact.unit?.trim() || null,
      validFrom: fact.validFrom?.trim() || null,
    }))
    .filter((fact) => fact.key.length > 0 && fact.value.length > 0);
}
