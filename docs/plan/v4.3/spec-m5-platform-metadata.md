# v4.3 M5 工具描述符与 provider 能力元数据规格

> 状态：已实现（M5 完成）。范围：只读元数据统一；不改工具执行、权限判定与模型路由。

## 1. 目标

1. 内置、MCP 与已发布流程工具映射到同一套只读描述符字段；
2. provider 协议声明流式、工具调用、视觉与向量能力，设置页只读展示；
3. 现有工具调用、权限确认、模型选择与路由零变化。

## 2. 决策

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D1 | 描述符字段固定为 name / description / inputSchema / source / permissions / readOnly / alwaysConfirm | 覆盖现有执行侧需要的全部信息，不再各自维护 parameters/permission 两套命名 |
| D2 | 适配层放在 core `tools/descriptor/`，用 zod schema 兜底 | 内置/流程/MCP 一次映射；非法描述符直接暴露而不是静默下发 |
| D3 | `/api/tools/debug` 保持原路径，返回 `ToolDescriptor[]`；额外纳入已发布流程工具 | 只读列表更完整，执行仍走原 `resolveTool` |
| D4 | provider 能力元数据按协议静态声明，不落库、不参与路由 | 避免数据库迁移与行为变化；UI 直接读共享常量 |
| D5 | provider 卡片只增加只读徽章与说明 | 不改变供应商表单、连接测试与模型管理 |

## 3. 契约

```ts
interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  source: string; // builtin | mcp:<server> | flow
  permissions: PermissionLevel[];
  readOnly: boolean;
  alwaysConfirm: boolean;
}

const PROVIDER_CAPABILITY_KEYS = ['stream', 'tools', 'vision', 'embedding'] as const;
```

## 4. 文件级改动

### shared

1. `schemas/tool/tool.ts`（新增）：`toolDescriptorSchema` 与 `ToolDescriptor`。
2. `schemas/tool/index.ts`、`schemas/index.ts`：barrel 导出。
3. `constants/enums.ts`：`PERMISSION_LEVELS`、`PROVIDER_CAPABILITY_KEYS`、`PROVIDER_PROTOCOL_CAPABILITIES`。
4. `i18n/messages/settings-providers.ts`：协议能力中英文案。

### core

5. `tools/descriptor/index.ts`（新增）：`describeTool` / `describeMcpTool`。
6. `tools/tool-runtime.ts`：`listDebugTools()` 返回 `ToolDescriptor[]`，纳入 flow 工具。
7. `tools/index.ts`：导出适配函数，移除 `DebugToolInfo`。

### web

8. `features/settings/tools/tool-debug-panel.tsx`：改用 `permissions` / `inputSchema`。
9. `lib/hooks/capability/use-tool-debug.ts`：返回类型改为 `ToolDescriptor[]`。
10. `features/flow-editor/config/forms-tool.tsx`：流程工具构造统一描述符。
11. `features/settings/providers/provider-card.tsx`：展示协议能力徽章与只读说明。

### 测试

12. `core/tools/descriptor/index.test.ts`：内置、流程、MCP 三种映射。
13. `core/tools/tool-runtime.test.ts`：列表字段与权限断言。
14. `shared/schemas/provider/provider-capabilities.test.ts`：协议能力声明完整性。
15. `web/app/api/tools/tools.test.ts`：内置过滤 + 流程工具存在。

## 5. 验证

```bash
pnpm --filter @wbfm/core exec vitest run src/tools src/services/provider
pnpm --filter @wbfm/web exec vitest run src/app/api/tools src/features/settings/tools src/features/flow-editor/config src/app/api/providers
pnpm check
```

## 6. 不做

- 不改 `toToolDefinitions`、工具执行器、权限门与熔断；
- 不把 provider 元数据接入模型选择或自动路由；
- 不为 provider 能力新增数据库列或迁移。
