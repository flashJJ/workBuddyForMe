import type {
  FlowEndpointStatus,
  FlowUnattendedPolicy,
  WorkflowEndpointView,
} from '@wbfm/shared/types';
import type {
  WorkflowEndpointRepository,
  WorkflowRepository,
} from '@wbfm/database';
import {
  generateEndpointKey,
  hashEndpointKey,
  verifyEndpointKey,
  type GeneratedEndpointKey,
} from './endpoint-keys';

/**
 * v0.9 端点服务：端点行生命周期 + 公开请求鉴权。
 * - 管理面（UI/内部路由）：createOrUpdate / rotateKey / setStatus；
 * - 数据面（公开 HTTP/MCP 路由）：authenticate 恒定时间比对密钥并判定开关/发布态。
 * 不明文落库、不向前端返回明文（仅创建/重置当次随响应返回）。
 */

export type EndpointTransport = 'http' | 'mcp';

/** 数据面鉴权失败码（传输层错误，与 02 功能设计错误表对应） */
export type PublicErrorCode =
  | 'unauthorized'
  | 'endpoint_not_found'
  | 'endpoint_disabled'
  | 'workflow_not_published'
  | 'policy_revalidation_required'
  | 'invalid_host'
  | 'validation_failed'
  | 'rate_limited';

export class PublicEndpointError extends Error {
  readonly code: PublicErrorCode;
  readonly status: number;

  constructor(code: PublicErrorCode, status: number, message: string) {
    super(message);
    this.name = 'PublicEndpointError';
    this.code = code;
    this.status = status;
  }
}

export interface EndpointConfigInput {
  httpEnabled: boolean;
  mcpEnabled: boolean;
  syncTimeoutMs: number;
  rateLimitPerMin: number;
  policy?: FlowUnattendedPolicy;
}

export interface UpsertEndpointResult {
  endpoint: WorkflowEndpointView;
  /** 首次建行时的明文密钥（仅本次返回） */
  plaintextKey?: string;
}

export interface EndpointServiceDeps {
  endpoints: WorkflowEndpointRepository;
  workflows: WorkflowRepository;
}

export interface EndpointService {
  getByWorkflow(workflowId: string): WorkflowEndpointView | null;
  /** 建行或改配；workflow 不存在抛 NOT_FOUND；首次建行返回一次性明文密钥 */
  createOrUpdate(workflowId: string, config: EndpointConfigInput): UpsertEndpointResult;
  /** 重置密钥：旧密钥即时失效，返回新明文（仅本次） */
  rotateKey(workflowId: string): { endpoint: WorkflowEndpointView; plaintextKey: string };
  setStatus(workflowId: string, status: FlowEndpointStatus): WorkflowEndpointView;
  /**
   * 数据面鉴权：解析 Bearer → 哈希查表 → 恒定时间比对 → 开关/协议位/发布态/重确认判定。
   * 密钥缺失/错误与端点整体停用统一 404 混淆（防枚举）；未带 Bearer 才是 401。
   */
  authenticate(bearer: string | null, transport: EndpointTransport): WorkflowEndpointView;
  /** 调用审计：刷新 last_used_at（best-effort，不阻塞响应） */
  touch(endpointId: string): void;
}

function generatedToUpsert(workflowId: string, key: GeneratedEndpointKey, config: EndpointConfigInput) {
  return {
    workflowId,
    keyHash: key.keyHash,
    keyPrefix: key.keyPrefix,
    httpEnabled: config.httpEnabled,
    mcpEnabled: config.mcpEnabled,
    syncTimeoutMs: config.syncTimeoutMs,
    rateLimitPerMin: config.rateLimitPerMin,
    ...(config.policy ? { policy: config.policy } : {}),
  };
}

export function createEndpointService(deps: EndpointServiceDeps): EndpointService {
  const { endpoints, workflows } = deps;

  function requireWorkflow(workflowId: string) {
    const wf = workflows.getWorkflow(workflowId);
    if (!wf) {
      const error = new Error('工作流不存在');
      (error as Error & { code: string }).code = 'WORKFLOW_NOT_FOUND';
      throw error;
    }
    return wf;
  }

  function assertExposed(endpoint: WorkflowEndpointView, transport: EndpointTransport): void {
    if (transport === 'http' && !endpoint.httpEnabled) {
      throw new PublicEndpointError('endpoint_disabled', 409, '该端点未开启本地 API 调用');
    }
    if (transport === 'mcp' && !endpoint.mcpEnabled) {
      throw new PublicEndpointError('endpoint_disabled', 409, '该端点未开启 MCP 暴露');
    }
    const wf = workflows.getWorkflow(endpoint.workflowId);
    if (!wf || wf.status !== 'published') {
      throw new PublicEndpointError(
        'workflow_not_published',
        409,
        '工作流未发布或已停用，无法对外调用',
      );
    }
    if (endpoint.policyRevalidationRequired) {
      throw new PublicEndpointError(
        'policy_revalidation_required',
        409,
        '流程发布了新版本，需在端点设置中重新确认无人值守策略后再调用',
      );
    }
  }

  return {
    getByWorkflow(workflowId) {
      return endpoints.getByWorkflowId(workflowId);
    },

    createOrUpdate(workflowId, config) {
      requireWorkflow(workflowId);
      const existing = endpoints.getByWorkflowId(workflowId);
      if (!existing) {
        // 两个暴露位都关时没有建行意义（UI 首次开启才建密钥）
        if (!config.httpEnabled && !config.mcpEnabled) {
          const error = new Error('请至少开启一种对外暴露方式后再保存');
          (error as Error & { code: string }).code = 'NO_EXPOSURE';
          throw error;
        }
        const generated = generateEndpointKey();
        const endpoint = endpoints.create(generatedToUpsert(workflowId, generated, config));
        return { endpoint, plaintextKey: generated.key };
      }
      const endpoint = endpoints.updateConfig(existing.id, config) ?? existing;
      // 保存配置即重新确认策略（含新版本发布后的 policy_revalidation_required）
      endpoints.setRevalidation(existing.id, false);
      return { endpoint: endpoints.getById(existing.id) ?? endpoint };
    },

    rotateKey(workflowId) {
      requireWorkflow(workflowId);
      const existing = endpoints.getByWorkflowId(workflowId);
      if (!existing) {
        const error = new Error('端点不存在');
        (error as Error & { code: string }).code = 'ENDPOINT_NOT_FOUND';
        throw error;
      }
      const generated = generateEndpointKey();
      const endpoint =
        endpoints.rotateKey(existing.id, generated.keyHash, generated.keyPrefix) ?? existing;
      return { endpoint, plaintextKey: generated.key };
    },

    setStatus(workflowId, status) {
      const existing = endpoints.getByWorkflowId(workflowId);
      if (!existing) {
        const error = new Error('端点不存在');
        (error as Error & { code: string }).code = 'ENDPOINT_NOT_FOUND';
        throw error;
      }
      return endpoints.setStatus(existing.id, status) ?? existing;
    },

    authenticate(bearer, transport) {
      if (!bearer || !bearer.startsWith('Bearer ')) {
        throw new PublicEndpointError('unauthorized', 401, '缺少 Bearer 端点密钥');
      }
      const key = bearer.slice('Bearer '.length).trim();
      if (!key) throw new PublicEndpointError('unauthorized', 401, '缺少 Bearer 端点密钥');
      const row = endpoints.getRowByKeyHash(hashEndpointKey(key));
      const matched = row ? verifyEndpointKey(key, row.key_hash) : false;
      if (!row || !matched) {
        throw new PublicEndpointError('endpoint_not_found', 404, '端点不存在或已停用');
      }
      const endpoint = endpoints.getById(row.id);
      if (!endpoint || endpoint.status !== 'enabled') {
        // 整体停用与不存在不区分（防密钥枚举）
        throw new PublicEndpointError('endpoint_not_found', 404, '端点不存在或已停用');
      }
      assertExposed(endpoint, transport);
      return endpoint;
    },

    touch(endpointId) {
      try {
        endpoints.touchLastUsed(endpointId);
      } catch {
        /* 审计失败不影响调用 */
      }
    },
  };
}
