/** flowEditor.endpoint 子域：本地服务化（HTTP/MCP 暴露、密钥管理与无人值守策略），中英同文件拆分控行数 */
export const zhFlowEditorEndpoint = {
  title: '对外服务',
  description: '把已发布流程暴露为本机 HTTP API（仅 127.0.0.1 可访问），独立密钥、可随时吊销。',
  notPublished: '流程尚未发布：请先在工具栏「发布」当前版本，发布后才能开启对外调用。',
  revalidationRequired:
    '流程发布了新版本：请重新核对下方无人值守策略并「保存配置」，保存前所有 API/MCP 调用将被拒绝（409 需重新确认策略）。',
  timeoutLabel: '同步等待超时',
  timeoutOption: '{seconds} 秒（超时自动转异步）',
  rateLimitLabel: '速率限制（次/分钟）',
  save: '保存配置',
  saving: '保存中…',
  saveFailed: '保存失败',
  rotateFailed: '重置失败',
  close: '关闭',
  toggles: {
    http: '本地 API',
    httpHint: 'HTTP invoke / 轮询 / SSE',
    mcp: 'MCP 暴露',
    mcpHint: '供 MCP 客户端发现调用（配置先行，服务 M3 上线）',
  },
  invoke: {
    address: '调用地址',
    keyPlaceholder: '<你的密钥>',
    currentKey: '当前密钥：{prefix}…（已隐藏）',
    rotate: '重置密钥',
    rotateConfirmHint: '旧密钥将立即失效，再次点击确认',
    rotateConfirm: '再点一次确认重置',
    plaintextWarning: '明文密钥只显示这一次，请立即复制保存：',
    copy: '复制',
    copied: '已复制',
  },
  mcpHint: {
    title: 'MCP 客户端接入',
    http: 'HTTP（推荐，在「设置 → MCP 服务器」新增 http 类型）：',
    stdio: 'stdio（Claude Desktop 等外部客户端，env 中放端点密钥）：',
    stdioUnavailable: 'stdio 命令行在安装桌面版后可用；开发态可使用上面的 HTTP 接入。',
    tokenPlaceholder: '<端点密钥>',
  },
  policy: {
    title: '无人值守危险操作策略',
    description: 'API/MCP 调用无人在场、不会弹出授权：read 工具始终允许，写入/高危工具按以下策略执行。',
    denyAll: '拒绝全部写入/高危操作（推荐，最安全）',
    allowlist: '自定义白名单（仅勾选的工具可自动执行）',
    dangerCount: '当前发布图含 {count} 个写入/高危节点：',
    banned: '桌面控制类，API/MCP 永久禁止',
    emptyAllowlist: '当前发布图没有写入/高危工具节点，白名单为空即等价于全部拒绝。',
  },
};

export const enFlowEditorEndpoint = {
  title: 'Local serving',
  description:
    'Expose the published flow as a local HTTP API (127.0.0.1 only) with a dedicated, revocable key.',
  notPublished:
    'The flow is not published yet: publish the current version from the toolbar first, then enable external calls.',
  revalidationRequired:
    'A new version was published: review the unattended policy below and save the config. Until saved, all API/MCP calls are rejected (409 requires policy re-confirmation).',
  timeoutLabel: 'Sync wait timeout',
  timeoutOption: '{seconds} s (falls back to async on timeout)',
  rateLimitLabel: 'Rate limit (req/min)',
  save: 'Save config',
  saving: 'Saving…',
  saveFailed: 'Save failed',
  rotateFailed: 'Key reset failed',
  close: 'Close',
  toggles: {
    http: 'Local API',
    httpHint: 'HTTP invoke / polling / SSE',
    mcp: 'MCP exposure',
    mcpHint: 'Discoverable by MCP clients (config first; service lands in M3)',
  },
  invoke: {
    address: 'Invoke URL',
    keyPlaceholder: '<your-key>',
    currentKey: 'Current key: {prefix}… (hidden)',
    rotate: 'Reset key',
    rotateConfirmHint: 'The old key will be revoked immediately — click again to confirm',
    rotateConfirm: 'Click again to confirm reset',
    plaintextWarning: 'The plaintext key is shown only once — copy and store it now:',
    copy: 'Copy',
    copied: 'Copied',
  },
  mcpHint: {
    title: 'MCP client setup',
    http: 'HTTP (recommended; add an http entry in “Settings → MCP servers”):',
    stdio: 'stdio (external clients like Claude Desktop; put the endpoint key in env):',
    stdioUnavailable:
      'The stdio command line is available after installing the desktop app; use the HTTP setup above in dev.',
    tokenPlaceholder: '<endpoint-key>',
  },
  policy: {
    title: 'Unattended high-risk operation policy',
    description:
      'API/MCP calls run unattended with no authorization prompts: read tools are always allowed; write/high-risk tools follow the policy below.',
    denyAll: 'Deny all write/high-risk operations (recommended, safest)',
    allowlist: 'Custom allowlist (only checked tools can run automatically)',
    dangerCount: 'The published graph has {count} write/high-risk nodes:',
    banned: 'Desktop control: permanently banned for API/MCP',
    emptyAllowlist:
      'The published graph has no write/high-risk tool nodes; an empty allowlist is equivalent to denying all.',
  },
};
