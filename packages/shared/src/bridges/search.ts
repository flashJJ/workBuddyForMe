/**
 * 桌面端搜索相关桥（仅 Electron preload 注入；纯浏览器/Web 模式为 undefined）。
 * v2.17 的 web_search 本身是内置工具，这里只承载「本机环境」能力。
 */

/** 一键部署 SearXNG 的结果 */
export type SearxngDeployResult =
  | { ok: true; endpoint: string; container: string }
  | {
      ok: false;
      /** docker_missing=未安装；docker_daemon=未启动；start_failed=启动失败；timeout=起来但不可用 */
      reason: 'docker_missing' | 'docker_daemon' | 'start_failed' | 'timeout' | 'unsupported';
      message: string;
      /** 可复制的手工命令（自动部署失败时给用户兜底） */
      manualCommand?: string;
    };

export interface WbfmSearchBridge {
  /** 用本机 Docker 拉起 SearXNG 并等待 JSON 接口可用（幂等：容器已存在则复用） */
  deploySearxng(): Promise<SearxngDeployResult>;
}
