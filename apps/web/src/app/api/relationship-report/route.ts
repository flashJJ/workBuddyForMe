import { z } from 'zod';
import { LANGUAGES, type Language } from '@wbfm/shared/constants';
import {
  createAssistantRepository,
  createEmotionEventRepository,
  createEmotionStateRepository,
  createEventUsageRepository,
  createRelationshipMilestoneRepository,
} from '@wbfm/database';
import { aggregateRelationshipReport, renderRelationshipReportHtml, REPORT_SECTION_KEYS, type ReportSectionKey } from '@wbfm/core/emotion';
import { defineRoute } from '@/lib/server/with-api-handler';
import { readJsonBody, parseBody } from '@/lib/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const sectionTuple = REPORT_SECTION_KEYS as [ReportSectionKey, ...ReportSectionKey[]];

const reportRequestSchema = z
  .object({
    locale: z.enum(LANGUAGES).optional(),
    sections: z.array(z.enum(sectionTuple)).optional(),
    excludeAssistantIds: z.array(z.string().min(1).max(80)).max(200).optional(),
    excludeMilestoneIds: z.array(z.string().min(1).max(80)).max(500).optional(),
    seriesDays: z.number().int().min(7).max(365).optional(),
  })
  .strict();

/**
 * POST /api/relationship-report — 本地只读聚合 → 自包含单文件 HTML 下载。
 * 不写库、不发网络；节可选（sections），助手/里程碑条目可在生成前剔除。
 */
export const POST = defineRoute(async ({ request, services }) => {
  const input = parseBody(reportRequestSchema, await readJsonBody(request));
  const db = services.db;
  const nowMs = Date.now();

  const states = createEmotionStateRepository(db).list();
  const events = createEmotionEventRepository(db).listAll();
  const milestones = createRelationshipMilestoneRepository(db).listAll();
  const usage = createEventUsageRepository(db).listAll({
    sinceMs: nowMs - 90 * 24 * 3600_000,
  });
  const names = new Map(
    createAssistantRepository(db)
      .list()
      .map((a) => [a.id, a.name]),
  );

  const data = aggregateRelationshipReport({
    nowMs,
    states: states.map((s) => ({
      assistantId: s.assistantId,
      name: names.get(s.assistantId) ?? s.assistantId,
      state: s.state,
    })),
    events,
    milestones,
    eventUsage: usage.map((u) => ({ outcome: u.outcome, reason: u.reason, playedAt: u.playedAt })),
    options: {
      excludeAssistantIds: input.excludeAssistantIds,
      excludeMilestoneIds: input.excludeMilestoneIds,
      seriesDays: input.seriesDays,
    },
  });

  const locale: Language = input.locale === 'en-US' ? 'en-US' : 'zh-CN';
  const html = renderRelationshipReportHtml(data, {
    locale,
    sections: input.sections ?? REPORT_SECTION_KEYS,
  });
  const filename = locale === 'en-US' ? 'relationship-report.html' : '关系报告.html';
  const asciiName = 'relationship-report.html';
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
});
