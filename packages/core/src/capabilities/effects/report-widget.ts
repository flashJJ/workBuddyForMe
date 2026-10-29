import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import {
  reportWidgetCapabilityPayloadSchema,
  type CapabilityManifest,
} from '@wbfm/shared/schemas';
import type { ReportWidgetRepository } from '@wbfm/database';

export interface ReportWidgetEffectDeps {
  reportWidgets: ReportWidgetRepository;
}

function parsePayload(packDir: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(packDir, 'payload/widget.json'), 'utf8'));
  } catch (error) {
    throw ApiError.validation(
      `报告卡片 payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = reportWidgetCapabilityPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `报告卡片 payload 校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** 启用：白名单校验后写行；同 id 只保留一份（先删后建，保证配置最新） */
export function enableReportWidget(
  manifest: CapabilityManifest,
  packDir: string,
  deps: ReportWidgetEffectDeps,
): string {
  const payload = parsePayload(packDir);
  deps.reportWidgets.remove(manifest.id);
  deps.reportWidgets.create({
    id: manifest.id,
    packId: manifest.id,
    title: payload.title,
    configJson: JSON.stringify(payload),
  });
  return manifest.id;
}

export function disableReportWidget(effectRef: string, deps: ReportWidgetEffectDeps): void {
  deps.reportWidgets.remove(effectRef);
}
