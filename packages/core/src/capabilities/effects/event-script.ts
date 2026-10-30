import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ApiError } from '@wbfm/shared/errors';
import {
  eventScriptCapabilityPayloadSchema,
  type CapabilityManifest,
} from '@wbfm/shared/schemas';
import type { InstalledEventScriptRepository } from '@wbfm/database';

export interface EventScriptEffectDeps {
  eventScripts: InstalledEventScriptRepository;
}

function parsePayload(packDir: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(packDir, 'payload/script.json'), 'utf8'));
  } catch (error) {
    throw ApiError.validation(
      `剧本 payload 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = eventScriptCapabilityPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.validation(
      `剧本 payload 校验失败：${parsed.error.issues.map((issue) => issue.message).join('；')}`,
    );
  }
  return parsed.data;
}

/** 启用：校验 → 写行/恢复启用；同 id 已在其它包启用时 409 */
export function enableEventScript(
  manifest: CapabilityManifest,
  packDir: string,
  deps: EventScriptEffectDeps,
): string {
  const payload = parsePayload(packDir);
  const id = payload.definition.id;
  const existing = deps.eventScripts.get(id);
  if (existing) {
    if (existing.packId !== manifest.id && existing.enabled) {
      throw ApiError.conflict(`剧本 id 已被其它能力包占用：${id}`);
    }
    deps.eventScripts.setEnabled(id, true);
    return id;
  }
  deps.eventScripts.create({
    id,
    packId: manifest.id,
    name: payload.definition.title ?? payload.definition.titleKey ?? id,
    definitionJson: JSON.stringify(payload),
  });
  return id;
}

/** v2.12：升级预检读取剧本 id（必须在 disable/换包前确认 id 不变） */
export function readEventScriptId(packDir: string): string {
  return parsePayload(packDir).definition.id;
}

/** v2.12：升级替换定义；剧本 id 必须保持不变 */
export function replaceEventScriptDefinition(
  manifest: CapabilityManifest,
  packDir: string,
  scriptId: string,
  enabled: boolean,
  deps: EventScriptEffectDeps,
): string {
  const payload = parsePayload(packDir);
  if (payload.definition.id !== scriptId) {
    throw ApiError.validation(`升级不允许修改剧本 id：${scriptId} → ${payload.definition.id}`);
  }
  const name = payload.definition.title ?? payload.definition.titleKey ?? scriptId;
  const row = deps.eventScripts.replaceDefinition(scriptId, {
    name,
    definitionJson: JSON.stringify(payload),
    enabled,
  });
  if (!row) throw ApiError.notFound('剧本', scriptId);
  return row.id;
}

export function disableEventScript(effectRef: string, deps: EventScriptEffectDeps): void {
  deps.eventScripts.setEnabled(effectRef, false);
}

export function uninstallEventScript(effectRef: string, deps: EventScriptEffectDeps): void {
  deps.eventScripts.remove(effectRef);
}
