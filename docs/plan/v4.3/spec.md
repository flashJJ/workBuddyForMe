# v4.3 M2 场景包规格

> 状态：已批准并实现（M2 完成）。按 [tasks.md](./tasks.md) 的 M2 执行。
> 范围：只做 `scene-pack` 能力包（声明式宠物剧本场景）；M3 道具包、M4 音频设备不在本规格内。

## 1. 目标

让第三方/用户以能力包形式安装声明式场景，安装并启用后：

1. 场景进入桌宠剧本引擎的触发索引，真实交互可触发；
2. 剧本调试面板能列出并手动播放；
3. 停用后下一次内容快照读取即消失，无需重启应用。

## 2. 决策

| 编号 | 决策 | 理由 |
| --- | --- | --- |
| D1 | 场景包复用共享 `Scene`，不接小剧场 `TheaterEpisode` | `Scene` 已有 schema、`cueTrack`、`validateScenes` 和 `useScriptDirector.extraScenes` 入口；小剧场当前是静态数组，没有动态包读取链路 |
| D2 | 场景 id 必须以 `pack.` 开头 | 内置场景使用 `touch./moment./ambient./state./pool./gen.` 前缀，结构性隔离命名空间，core 无需感知 web 内置列表 |
| D3 | payload schema 放 `schemas/script/scene-pack.ts`，不回填 `capability.ts` | `capability.ts` 已 268 行，塞入 schema 会逼近 300 行硬门禁；脚本域也更内聚 |
| D4 | 跨包 scene id 冲突在聚合层 fail-closed | 与 `mergeMotionContent` 一致；冲突时 `/api/scene-content` 报 422，停用其一即恢复 |
| D5 | 内容快照只含已启用包，内置场景仍由 web 持有 | core 不感知内置场景；web 把快照追加到 `BUILT_IN_SCENES` 后统一交给 `validateScenes` |
| D6 | web 侧单次 GET，失败降级为空 | 对齐 `useMotionContent`；场景包异常不阻塞桌宠启动，内置场景照常可用 |
| D7 | 场景包场景进入触发索引与调试面板，不进入主动播放的 `gen.*` 轮换 | `usePetProactivePlayback` 依赖生成场景元数据；场景包只走真实触发与手动播放，避免误选 |

## 3. 契约

### 3.1 kind / 权限 / entry

```ts
// CAPABILITY_KINDS
'scene-pack'

// CAPABILITY_PERMISSIONS
'scene:pack'

// CAPABILITY_REQUIRED_PERMISSION
'scene-pack': 'scene:pack'

// CAPABILITY_ENTRY_BY_KIND
'scene-pack': 'payload/scene-pack.json'
```

`CAPABILITY_SUPPORTED_KINDS` 追加 `'scene-pack'`；entry 主文件体积上限 512KB（`manifest.ts` 的 `ENTRY_SIZE_LIMITS`）。

### 3.2 payload

`payload/scene-pack.json`：

```ts
export const SCENE_PACK_SCENE_ID_PREFIX = 'pack.';
export const SCENE_PACK_MAX_SCENES = 50;

export const scenePackPayloadSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(200).default(''),
    scenes: z.array(sceneSchema).min(1).max(SCENE_PACK_MAX_SCENES),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    value.scenes.forEach((scene, index) => {
      if (!scene.id.startsWith(SCENE_PACK_SCENE_ID_PREFIX)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', index, 'id'],
          message: `场景 id 必须以 ${SCENE_PACK_SCENE_ID_PREFIX} 开头`,
        });
      }
      if (seen.has(scene.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', index, 'id'],
          message: `场景 id 重复：${scene.id}`,
        });
      }
      seen.add(scene.id);
    });
  });
```

约束汇总：

- 场景数 1–50；
- 每场 id 以 `pack.` 开头，包内唯一；
- `beats` 非空、`at` 升序（`sceneSchema` 已保证）；
- cue 只允许现有 15 类，不引入脚本代码或新 cue。

### 3.3 内容快照

```ts
export interface SceneContent {
  /** 无包为 'none'；有包为 packs:<sha256(sorted id@version)[:12]> */
  version: string;
  scenes: Scene[];
}
```

- 没有已启用包：`{ version: 'none', scenes: [] }`；
- 有包：按 `id@version` 排序后取 sha256 前 12 位；
- 跨包重复 id：`ApiError.validation('场景 id 冲突：<id>')`。

## 4. 文件级改动

### shared

1. `packages/shared/src/schemas/capability/capability.ts`
   - 追加 `scene-pack` kind 与 `scene:pack` 权限；
   - 补 `CAPABILITY_REQUIRED_PERMISSION`、`CAPABILITY_SUPPORTED_KINDS`、`CAPABILITY_ENTRY_BY_KIND`；
   - 顶部注释从“七类”改为“八类”。
2. `packages/shared/src/schemas/script/scene-pack.ts`（新增）
   - `SCENE_PACK_SCENE_ID_PREFIX`、`SCENE_PACK_MAX_SCENES`、`scenePackPayloadSchema`、`ScenePackPayload`。
3. `packages/shared/src/schemas/script/index.ts`
   - `export * from './scene-pack';`。

### core

4. `packages/core/src/capabilities/effects/scene-pack.ts`（新增）
   - `SCENE_PACK_ENTRY = 'payload/scene-pack.json'`；
   - `readScenePackPayload(packDir)`：读取 + JSON 解析 + zod 校验，失败抛 `ApiError.validation`；
   - `enableScenePack(manifest, packDir)`：读取校验后返回 `manifest.id`；
   - `disableScenePack()`：空实现（内容聚合按能力行状态过滤）。
5. `packages/core/src/capabilities/effects/index.ts`
   - 注册 `'scene-pack'` handler；`enable` 调用 `enableScenePack`，`disable` 调用 `disableScenePack`。
6. `packages/core/src/capabilities/manifest.ts`
   - `ENTRY_SIZE_LIMITS['scene-pack'] = 512 * 1024`。
7. `packages/core/src/services/script/scene-content-service.ts`（新增）
   - `ScenePackSource`、`SceneContent`；
   - `mergeSceneContent(sources)`：空源返回 `{ version: 'none', scenes: [] }`；逐包追加并检测跨包 id 冲突；版本由排序后的 `id@version` 生成；
   - `createSceneContentService({ db, rootDir? })`：每次 `repo.listEnabled()` 过滤 `scene-pack`，读 payload 聚合，安装/停用后下一次读取生效。
8. `packages/core/src/services/script/index.ts`（新增）与 `packages/core/src/services/index.ts`
   - barrel 导出场景内容服务。
9. `packages/core/src/capabilities/samples.ts`
   - `sampleScenePackPayload()`；
   - `buildSamplePack` 增加 `scene-pack` 分支：id `com.example.sample.scene-pack`，version `1.0.0`，permissions `['scene:pack']`，entry `payload/scene-pack.json`。
   - 样例场景：`pack.sample.raised-greeting`，触发键 `touch::raised::tap`，priority 1，cooldown 60s；beats 使用 `expression(joy) → gesture(nod) → speak → expression(neutral)`，验证表情、手势、语音与恢复路径。

### web

10. `apps/web/src/app/api/scene-content/route.ts`（新增）
    - 对齐 `api/motion-content/route.ts`：`runtime = 'nodejs'`、`dynamic = 'force-dynamic'`、GET 返回 `createSceneContentService({ db }).get()`。
11. `apps/web/src/features/avatar/script/content/use-scene-content.ts`（新增）
    - `useSceneContent(enabled): { scenes, version, ready }`；
    - 单次 `apiGet<SceneContent>('/api/scene-content')`；
    - 失败 `console.warn` 并降级为空，不抛出；卸载后忽略回调。
12. `apps/web/src/features/avatar/index.ts`
    - 导出 `useSceneContent`。
13. `apps/web/src/features/pet/pet-stage.tsx`
    - 新增 `const scenePacks = useSceneContent(PET_SCRIPT_ENABLED && isVrmAvatarId(modelId));`
    - `extraScenes = [...generated.scenes, ...scenePacks.scenes]`（`useMemo`）；
    - `useScriptDirector` 使用合并后的 `extraScenes`；
    - `usePetProactivePlayback` 仍只接收 `generated.scenes`（D7）。

### 测试

14. `packages/core/src/capabilities/effects/scene-pack.test.ts`（新增）
    - 样例 ZIP 可解析，payload 可读、可启用、可停用；
    - 拒绝：空 scenes、id 非 `pack.` 前缀、包内重复 id、beats 乱序、非法 JSON。
15. `packages/core/src/services/script/scene-content-service.test.ts`（新增）
    - 对齐 `motion-content-service.test.ts` 的 db/临时目录初始化；
    - 无包 → `version: 'none'`；启用包 → 场景与 `packs:` 版本；停用包 → 快照回到 none；两包同 id → 抛冲突。
16. `packages/core/src/capabilities/capability-service.test.ts`
    - 增加 `scene-pack` 安装并启用的用例（样例包走完整 manifest/entry/checksums 校验）。

## 5. 数据流

```text
ZIP 安装
  → parseCapabilityZip（kind/entry/checksums/签名/大小）
  → 落盘 <dataDir>/capabilities/<id>/payload/scene-pack.json
  → enableCapabilityEffect('scene-pack') 读取并校验 payload
  → 能力行 enabled
  → GET /api/scene-content
  → createSceneContentService 聚合已启用包
  → useSceneContent
  → pet-stage extraScenes = 生成场景 + 场景包
  → useScriptDirector: validateScenes → registry（触发索引）+ 调试面板
```

停用/卸载：能力行状态变化后，下一次 GET 不再包含该包，无需清理文件。

## 6. 错误与边界

- payload JSON 非法或 schema 不通过：安装启用返回 422，错误信息带具体字段路径；
- entry 超过 512KB：导入阶段拒绝；
- 场景 id 非 `pack.`、包内重复、beats 乱序：422；
- 跨包 id 冲突：`/api/scene-content` 返回 422，停用其一恢复；
- web 读取失败：空场景数组，内置场景与桌宠启动不受影响；
- 小剧场不读取场景包，`/stage` 行为不变；
- 不做轮询/热更新，安装后刷新页面或下次挂载生效。

## 7. 验证

```bash
pnpm exec vitest run packages/core/src/capabilities/effects/scene-pack.test.ts \
  packages/core/src/services/script/scene-content-service.test.ts \
  packages/core/src/capabilities/capability-service.test.ts
pnpm check
```

手工验收：

1. 通过能力服务安装并启用 `scene-pack` 样例包；
2. `GET /api/scene-content` 返回 `version: packs:...` 与 `pack.sample.raised-greeting`；
3. 剧本调试面板列出该场景并可手动播放；
4. 抬手触发 `touch::raised::tap` 可播放（VRM 桌宠）；
5. 停用能力包后再次请求，快照回到 `version: 'none'`、场景为空。

## 8. 验收标准

- [ ] `CAPABILITY_KINDS` 含 `scene-pack`，缺失 kind 的 `Record` 由 typecheck 强制补全；
- [ ] 样例包可安装、启用、停用，非法 payload 全部 fail-closed；
- [ ] `/api/scene-content` 版本号随启用集合变化；
- [ ] 桌宠剧本引擎能触发并手动播放包内场景；
- [ ] 小剧场与既有能力包行为零变化；
- [ ] `pnpm check` 全绿。

## 9. 不做

- 不自定义 cue 类型、不允许包内执行任意代码；
- 不接小剧场 `/stage`；
- 不做场景包热更新、轮询或运行时重载；
- 不改签名信任策略与安装校验流程。
