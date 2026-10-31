import { createHash } from 'node:crypto';
import type { AuditEventRow, DatabaseInstance } from '@wbfm/database';
import { createAuditEventRepository } from '@wbfm/database';
import type {
  AuditActor,
  AuditDecision,
  AuditEventKind,
  AuditEventView,
  AuditQuery,
  AuditVerifyResult,
  OperationBinding,
} from '@wbfm/shared/schemas';
import {
  AUDIT_CHAIN_BROKEN,
  AUDIT_GENESIS_HASH,
  auditActorSchema,
  auditDecisionSchema,
  canonicalJson,
  operationBindingSchema,
} from '@wbfm/shared/schemas';
import { verifyAuditChain } from './audit-verify';

/**
 * v2.13 M3：审计账本服务。
 * - 每次追加在单次同步调用内取链尾 → 计算 → 插入（Node 单线程天然串行）；
 * - hash = sha256(prev_hash + "\n" + canonicalJson(事件去掉 hash))；
 * - 校验按 seq 升序重算，返回首个断链 seq；
 * - 不提供删除 / 修改。
 */

export interface AuditAppendInput {
  kind: AuditEventKind;
  actor?: AuditActor;
  runId?: string | null;
  conversationId?: string | null;
  tool?: string | null;
  decision?: AuditDecision | null;
  reasonCode?: string | null;
  policyHash?: string | null;
  binding?: OperationBinding | null;
  outcome?: string | null;
  createdAt?: string;
}

interface HashFields {
  id: string;
  seq: number;
  createdAt: string;
  kind: string;
  actor: string;
  runId: string | null;
  conversationId: string | null;
  tool: string | null;
  decision: string | null;
  reasonCode: string | null;
  policyHash: string | null;
  bindingJson: string | null;
  outcome: string | null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** 事件规范化载荷：不含 hash / prev_hash，保证重算一致 */
function hashPayload(fields: HashFields): string {
  return canonicalJson({
    id: fields.id,
    seq: fields.seq,
    createdAt: fields.createdAt,
    kind: fields.kind,
    actor: fields.actor,
    runId: fields.runId,
    conversationId: fields.conversationId,
    tool: fields.tool,
    decision: fields.decision,
    reasonCode: fields.reasonCode,
    policyHash: fields.policyHash,
    bindingJson: fields.bindingJson,
    outcome: fields.outcome,
  });
}

function computeHash(prevHash: string, fields: HashFields): string {
  return sha256(`${prevHash}\n${hashPayload(fields)}`);
}

function parseBinding(json: string | null): OperationBinding | null {
  if (!json) return null;
  try {
    const parsed = operationBindingSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function mapRow(row: AuditEventRow): AuditEventView {
  return {
    id: row.id,
    seq: row.seq,
    createdAt: row.created_at,
    kind: row.kind as AuditEventKind,
    actor: auditActorSchema.catch('system').parse(row.actor),
    runId: row.run_id,
    conversationId: row.conversation_id,
    tool: row.tool,
    decision: auditDecisionSchema.nullable().catch(null).parse(row.decision),
    reasonCode: row.reason_code,
    policyHash: row.policy_hash,
    binding: parseBinding(row.binding_json),
    outcome: row.outcome,
    prevHash: row.prev_hash,
    hash: row.hash,
  };
}

function fieldsFromRow(row: AuditEventRow): HashFields {
  return {
    id: row.id,
    seq: row.seq,
    createdAt: row.created_at,
    kind: row.kind,
    actor: row.actor,
    runId: row.run_id,
    conversationId: row.conversation_id,
    tool: row.tool,
    decision: row.decision,
    reasonCode: row.reason_code,
    policyHash: row.policy_hash,
    bindingJson: row.binding_json,
    outcome: row.outcome,
  };
}

export interface AuditEventListPage {
  events: AuditEventView[];
  /** 下一页游标（传回 cursor）；null 表示没有更多 */
  nextCursor: number | null;
}

export interface AuditService {
  append(input: AuditAppendInput): AuditEventView;
  /** 生命周期事件用：写入失败只告警，不阻断运行 */
  safeAppend(input: AuditAppendInput): AuditEventView | null;
  list(query: AuditQuery): AuditEventListPage;
  /** v2.14：诊断包可只校验最近 maxEvents 条且不写回审计事件 */
  verify(options?: { record?: boolean; maxEvents?: number }): AuditVerifyResult;
  count(): number;
  /** 导出：按 seq 升序惰性产出 JSONL 行 */
  iterateJsonl(): Generator<string>;
}

/** 治理关键事件 fail-closed：无审计服务视为未启用（不阻断单测）；写入失败返回 false */
export function auditCritical(
  audit: AuditService | undefined,
  input: AuditAppendInput,
): boolean {
  if (!audit) return true;
  try {
    audit.append(input);
    return true;
  } catch (error) {
    console.warn('[audit] 关键事件写入失败，操作按 fail-closed 拒绝', error);
    return false;
  }
}

export function createAuditService(db: DatabaseInstance): AuditService {
  const repo = createAuditEventRepository(db);

  const service: AuditService = {
    append(input) {
      const tail = repo.tail();
      const prevHash = tail?.hash ?? AUDIT_GENESIS_HASH;
      const seq = (tail?.seq ?? 0) + 1;
      const id = `${seq}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      const createdAt = input.createdAt ?? new Date().toISOString();
      const fields: HashFields = {
        id,
        seq,
        createdAt,
        kind: input.kind,
        actor: input.actor ?? 'agent',
        runId: input.runId ?? null,
        conversationId: input.conversationId ?? null,
        tool: input.tool ?? null,
        decision: input.decision ?? null,
        reasonCode: input.reasonCode ?? null,
        policyHash: input.policyHash ?? null,
        bindingJson: input.binding ? canonicalJson(input.binding) : null,
        outcome: input.outcome ?? null,
      };
      const hash = computeHash(prevHash, fields);
      return mapRow(
        repo.append({
          ...fields,
          bindingJson: fields.bindingJson,
          prevHash,
          hash,
        }),
      );
    },

    safeAppend(input) {
      try {
        return this.append(input);
      } catch (error) {
        console.warn('[audit] 生命周期事件写入失败，运行继续', error);
        return null;
      }
    },

    list(query) {
      const limit = query.limit ?? 50;
      const rows = repo.list({
        ...(query.from ? { from: query.from } : {}),
        ...(query.to ? { to: query.to } : {}),
        ...(query.kind ? { kind: query.kind } : {}),
        ...(query.runId ? { runId: query.runId } : {}),
        ...(query.cursor ? { afterSeq: query.cursor } : {}),
        limit,
      });
      return {
        events: rows.map(mapRow),
        nextCursor: rows.length === limit ? rows[rows.length - 1]!.seq : null,
      };
    },

    verify(options = {}) {
      const result = verifyAuditChain(
        repo,
        (prev, row) => computeHash(prev, fieldsFromRow(row)),
        options,
      );
      if (options.record !== false) {
        try {
          service.append({
            kind: 'audit_verified',
            actor: 'user',
            decision: result.ok ? 'allow' : 'deny',
            reasonCode: result.ok ? null : AUDIT_CHAIN_BROKEN,
            outcome: result.ok ? 'ok' : `broken:${result.firstBrokenSeq}`,
          });
        } catch (error) {
          console.warn('[audit] 校验结果写入失败', error);
        }
      }
      return result;
    },

    count() {
      return repo.count();
    },

    *iterateJsonl() {
      let afterSeq = 0;
      for (;;) {
        const rows = repo.listAscending(afterSeq, 500);
        for (const row of rows) yield `${canonicalJson(mapRow(row))}\n`;
        if (rows.length < 500) break;
        afterSeq = rows[rows.length - 1]!.seq;
      }
    },
  };

  return service;
}
