# v4.3 M3 道具包规格

> 状态：已实现（M3 完成）。范围：`prop-pack` 能力包；M4 音频设备不在本规格内。

## 1. 目标

安装并启用 `prop-pack` 后：

1. 包内 GLB 资源可被渲染层加载并挂到角色手部或舞台；
2. 剧本 `prop` cue 能引用包内道具，校验白名单与渲染注册表同源；
3. 停用/卸载后下一次挂载或下一次 cue 不再可见。

## 2. 决策

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D1 | 资源随包放在 `payload/**/*.glb` | 不写 `public/`，避免安装后污染构建产物 |
| D2 | 资源经 `GET /api/prop-assets?pack=&file=` 流式读取 | 与 motions 文件路由同模式；可做路径与声明校验 |
| D3 | 道具 id 强制 `pack.` 前缀 | 与内置 `teacup/bowl/...` 结构性隔离 |
| D4 | 单文件 ≤5MB、合计 ≤20MB、entry ≤64KB | 道具远小于模型；防止包内塞大资产 |
| D5 | 路径必须 resolve 到包目录内，且必须被 payload 声明 | 双层拦截 `..` 与未声明文件读取 |
| D6 | 许可必填；hand/stage 参数互斥 | 缺少许可直接拒绝；避免类型与参数错配 |
| D7 | 不热替换已挂载道具 | 新注册表作用于下一次 attach/show；安装/停用后下一次挂载生效 |

## 3. 契约

### 3.1 kind / 权限 / entry

```ts
CAPABILITY_KINDS += 'prop-pack'
CAPABILITY_PERMISSIONS += 'prop:pack'
CAPABILITY_REQUIRED_PERMISSION['prop-pack'] = 'prop:pack'
CAPABILITY_ENTRY_BY_KIND['prop-pack'] = 'payload/prop-pack.json'
ENTRY_SIZE_LIMITS['prop-pack'] = 64 * 1024
```

### 3.2 payload

```ts
{
  name: string,
  description?: string,
  props: Array<{
    id: `pack.${string}`,
    kind: 'hand' | 'stage',
    file: `payload/**/*.glb`,
    license: 'CC0-1.0' | 'CC-BY-4.0',
    contact?, lateral?, handPose?, scale?, yaw?,        // hand
    position?: [number, number, number], rotationY?,    // stage
  }>
}
```

规则：1–20 个道具、包内 id 唯一、许可必填、hand 不得声明 `position/rotationY`、stage 不得声明手持参数。

### 3.3 内容快照

```ts
interface PropContent {
  version: string; // none | packs:<sha256(sorted id@version)[:12]>
  props: Array<{ id, kind, license, url, ...几何参数 }>;
}
```

`url` 固定为 `/api/prop-assets?pack=<能力包 id>&file=<payload 相对路径>`。
跨包重复 id 在聚合层 fail-closed。

## 4. 文件级改动

### shared

1. `schemas/prop/prop-pack.ts`（新增）：`PROP_PACK_KINDS`、`PROP_PACK_LICENSES`、`PROP_PACK_MAX_PROPS`、资源预算常量、`propPackPropSchema`、`propPackPayloadSchema`。
2. `schemas/prop/index.ts`（新增）与 `schemas/index.ts`：barrel 导出。
3. `schemas/capability/capability.ts`：新增 kind/权限/entry。
4. `i18n/messages/capabilities.ts`：`prop-pack` 类型与 effect 句柄文案。

### core

5. `capabilities/effects/prop-pack.ts`（新增）
   - `readPropPackPayload(packDir)`；
   - `assertPropAssets(packDir, payload)`：路径越界、缺失、单文件/合计超限；
   - `readPropAsset(packDir, file)`：供资源路由读取；
   - `enablePropPack` / `disablePropPack`。
6. `capabilities/effects/index.ts`：注册 handler。
7. `capabilities/manifest.ts`：entry 64KB。
8. `services/media/prop-content-service.ts`（新增）
   - `mergePropContent(sources)`；
   - `createPropContentService({ db, rootDir })`：`get()` 与 `readAsset(packId, file)`；
   - `readAsset` 只服务已启用包且只读 payload 声明的文件。
9. `services/media/index.ts`：导出。
10. `samples/prop-asset.ts`（新增）：程序化生成最小立方体 GLB（无外部资产）。
11. `samples/prop-pack.ts`（新增）：`buildSamplePropPack()`，场景道具 `pack.sample.cube`。
12. `samples.ts`：`buildSamplePack('prop-pack')` 分支。
13. `effects/registry.test.ts`：未注册 kind 改用尚未排期的 `future-pack`。

### web

14. `app/api/prop-content/route.ts`（新增）：返回内容快照。
15. `app/api/prop-assets/route.ts`（新增）：按 `pack` + `file` 查询参数返回 GLB。
16. `vrm/props/use-prop-content.ts`（新增）：内置 `PROPS` + 包内道具合并为 `PropRegistry`，失败降级为内置表。
17. `vrm/props/prop-manifest.ts`：导出 `PropRegistry`，kind/license 别名 shared 枚举。
18. `vrm/props/vrm-prop-layer.ts`：通过 `getProps()` 读取注册表，attach/show 不再直接读静态 `PROPS`。
19. `vrm/vrm-controller.ts` / `session/vrm-session.ts` / `vrm-canvas.tsx`：把注册表 getter 传入渲染层，内容到达后无需重建 session。
20. `script/validation/registry.ts` / `validate.ts`：白名单增加 `props` 入参。
21. `script/adapters/vrm-adapter.ts`：道具 cue 使用动态注册表。
22. `script/use-script-director.ts`：新增 `props` 选项，传给校验与适配器。
23. `pet-stage.tsx`：调用 `usePropContent` 并传入导演。
24. `features/avatar/index.ts`：导出 hook 与类型。

### 测试

- `effects/prop-pack.test.ts`：样例包解析/安装/启停/卸载、空包、非 `pack.` 前缀、重复 id、缺许可、缺失资源、路径越界、超大资源。
- `services/media/prop-content-service.test.ts`：空快照、启用合并、停用、URL 生成、重复 id、`readAsset` 声明校验与越界拒绝。
- `vrm-prop-layer.test.ts`：注入注册表后可加载包道具。
- `vrm-adapter-prop.test.ts`：动态注册表道具 cue 可 attach。
- `use-script-director.test.tsx`：`props` 进入校验白名单。

## 5. 验证

```bash
pnpm exec vitest run packages/core/src/capabilities/effects/prop-pack.test.ts \
  packages/core/src/services/media/prop-content-service.test.ts \
  packages/core/src/capabilities/capability-service.test.ts
pnpm --filter @wbfm/web exec vitest run src/features/avatar/vrm/props \
  src/features/avatar/script/adapters/vrm-adapter-prop.test.ts \
  src/features/avatar/script/use-script-director.test.tsx
pnpm check
```

手工验收：安装样例道具包 → `GET /api/prop-content` 含 `pack.sample.cube` → 场景 `prop` cue 可 attach/show → 停用后下一次读取消失。

## 6. 不做

- 不把包内资源复制到 `public/`；
- 不支持 `.gltf`、贴图外链或远程 URL；
- 不做已挂载道具的热替换；
- 不改内置 8 个道具的行为与路径。
