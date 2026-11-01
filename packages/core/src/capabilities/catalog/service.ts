import type { CapabilityCatalogEntry, CapabilityView } from '@wbfm/shared/schemas';
import { ApiError } from '@wbfm/shared/errors';
import { BUNDLED_CAPABILITY_CATALOG } from './data';
import type {
  CapabilityCatalog,
  CapabilityCatalogDeps,
  CapabilityCatalogInstallResult,
  CapabilityCatalogSearchInput,
  CapabilityCatalogSearchItem,
} from './types';

/**
 * v2.17 M4：能力目录查询与安装代理。
 * - 只读目录常量，不访问网络；
 * - 安装复用能力服务的 ZIP 校验 / 落盘 / 启用（fail-closed）；
 * - 只读工具绑定由工具运行时负责，目录服务不感知助手。
 */

const TOKEN_SPLIT = /[\s,，、]+/;

function tokensOf(query: string): string[] {
  return query
    .toLowerCase()
    .split(TOKEN_SPLIT)
    .map((token) => token.trim())
    .filter(Boolean);
}

/** 意图匹配打分：名称 > 标签 > id > 描述；0 分视为不匹配 */
function scoreEntry(entry: CapabilityCatalogEntry, query: string, tokens: string[]): number {
  if (tokens.length === 0) return 1;
  const name = entry.name.toLowerCase();
  const id = entry.id.toLowerCase();
  const description = entry.description.toLowerCase();
  const tags = entry.tags.map((tag) => tag.toLowerCase());
  let score = 0;
  if (name.includes(query) || id.includes(query)) score += 20;
  for (const token of tokens) {
    if (name.includes(token)) score += 8;
    if (tags.some((tag) => tag === token || tag.includes(token))) score += 6;
    if (id.includes(token)) score += 5;
    if (description.includes(token)) score += 4;
  }
  return score;
}

export function createCapabilityCatalog(deps: CapabilityCatalogDeps): CapabilityCatalog {
  const catalog = deps.entries ?? BUNDLED_CAPABILITY_CATALOG;
  const installedById = (): Map<string, CapabilityView> =>
    new Map(deps.capabilities.list().map((view) => [view.id, view]));

  return {
    search(input: CapabilityCatalogSearchInput): CapabilityCatalogSearchItem[] {
      const query = input.query.trim().toLowerCase();
      const tokens = tokensOf(query);
      const installed = installedById();
      return catalog
        .filter((entry) => (input.kind ? entry.kind === input.kind : true))
        .map((entry) => ({ entry, score: scoreEntry(entry, query, tokens) }))
        .filter(({ score }) => score > 0)
        .sort((left, right) =>
          right.score === left.score
            ? left.entry.id.localeCompare(right.entry.id)
            : right.score - left.score,
        )
        .map(({ entry }) => {
          const view = installed.get(entry.id) ?? null;
          return { ...entry, installed: view !== null, status: view?.status ?? null };
        });
    },

    /** 安装内置精选包并启用；重复安装与未知条目直接拒绝 */
    install(id: string): CapabilityCatalogInstallResult {
      const entry = catalog.find((item) => item.id === id);
      if (!entry) throw ApiError.notFound('能力目录条目', id);
      if (entry.installStrategy !== 'bundled-pack') {
        throw ApiError.validation(
          `目录条目「${entry.name}」暂不支持自动安装，请到设置页手动添加。`,
        );
      }
      const existing = installedById().get(entry.id);
      if (existing) {
        throw ApiError.conflict(
          existing.status === 'enabled'
            ? `能力包已安装并启用：${entry.name}`
            : `能力包已安装（当前停用）：${entry.name}`,
        );
      }
      const capability = deps.capabilities.install(deps.capabilities.sample(entry.kind));
      return { entry, capability };
    },
  };
}
