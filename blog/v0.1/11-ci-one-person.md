# 一个人的项目也要有 CI：本地一键脚本与流水线

单人项目最危险的时刻，是你「觉得」改完没问题、又懒得跑全量检查的那一刻。一个工具函数的改动本地测着正常，第二天某个边缘场景崩了，顺着调用链查半天才发现是昨天那处改动的连锁反应——没有第二双眼睛，这类回归几乎必然发生。

CI 对独立开发者的意义不是团队协作，而是**把「该跑的检查」变成不可能跳过的机械动作**。这篇讲这个本地 AI 应用怎么先做好本地一键脚本，再用一条流水线把 typecheck、测试、覆盖率、行数门禁全部自动化。

## 先做好本地一键脚本

本地体验不顺，CI 就会被当成黑盒。根 `package.json` 聚合所有常用脚本：

```json
{
  "scripts": {
    "dev:web": "pnpm --filter @app/web dev",
    "dev:desktop": "pnpm --filter @app/desktop dev",
    "build": "turbo run build",
    "check": "pnpm typecheck && pnpm lint && pnpm check:lines",
    "test:unit": "turbo run test:unit",
    "test:integration": "pnpm --filter @app/web test:integration",
    "test:e2e": "pnpm --filter @app/web test:e2e",
    "test:e2e:desktop": "pnpm --filter @app/desktop test:e2e"
  }
}
```

Windows 下另配两个 PowerShell 脚本（`dev-web.ps1` / `dev-desktop.ps1`），先做环境检查（Node 版本、依赖是否安装）再启动，把「装了吗、版本对吗」这类问题挡在启动之前。

提交前只需要记三条命令：

```bash
pnpm check
pnpm test:unit
pnpm test:integration
```

全绿再提交，形成肌肉记忆。

## 流水线

CI 配置一份 workflow（`.github/workflows/ci.yml`，GitHub Actions），步骤是一条直线：

```text
1. checkout
2. setup pnpm + 缓存
3. pnpm install
4. pnpm check          # typecheck + lint + 行数门禁
5. pnpm test:unit      # 单元测试 + 覆盖率
6. pnpm test:integration
7. pnpm build:web      # 构建验证
8. pnpm test:e2e       # Web E2E
```

每一步失败即停，不往下走——这样光看挂在哪一步，就知道是哪一层出的问题，定位成本极低。

## Turborepo：让 CI 跑得快

Monorepo 每次全量构建、全量测试会很慢。Turborepo 的缓存让「没改过的包」直接复用历史结果：

```json
{
  "pipeline": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "test:unit": { "dependsOn": ["build"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

`dependsOn: ["^build"]` 表示先构建上游依赖包；`outputs` 声明产物路径，Turborepo 据此判断缓存能否命中。本地与 CI 共享同一套缓存机制（CI 上用 actions 缓存），第二次运行的耗时会明显下降。

## 覆盖率阈值阻断

Vitest 配置里写死阈值：

```ts
coverage: {
  thresholds: {
    statements: 70,
    lines: 70,
  },
}
```

覆盖率低于 70%，`test:unit` 非零退出，CI 挂。核心逻辑缺测试这件事因此不可能被「下次补上」敷衍过去。

## 行数门禁进 CI

`check-file-lines.mjs` 扫描所有手写 `.ts/.tsx`，超过 300 行即失败。它在本地和 CI 上跑的是同一个脚本，防止任何人——包括三个月后的自己——悄悄提交超长文件。

## Windows 打包的特殊处理

Electron 打包放进 CI 时有三个具体的坑：

1. **electron-builder 二进制下载**：默认源在境外网络下可能超时，改用国内镜像地址：
   ```bash
   ELECTRON_BUILDER_BINARIES_MIRROR=<国内 electron-builder 二进制镜像地址>
   ```

2. **原生模块重编译**：通常 better-sqlite3 需要与 Electron 版本匹配、走 electron-rebuild；但本项目架构是 fork 真实 Node 子进程，原生模块按构建 Node 的 ABI 编译即可，这一步整个省掉（详见 ABI 篇）。

3. **未签名 exe**：CI 打出来的 exe 没有代码签名，用户机器上的 Smart App Control 可能拦截。这是分发层面的问题，CI 的职责边界划在「打包成功」为止，签名走单独的分发流程。

## 核心原则：本地能过的，CI 必须能过

本地脚本和 CI 跑的是**完全相同的一套命令**。CI 挂了，在本地跑同一条命令就能复现，不存在「在我机器上好好的」这类玄学。反过来，如果本地全绿而 CI 挂，先怀疑环境差异（Node 版本、平台），而不是重跑碰运气。

## 一个人的 CI 哲学

- **不追求复杂**：一个 workflow 足够，不搞 matrix、不铺多环境；
- **全绿才提交**：让检查成为提交动作的一部分，而不是提交后的补救；
- **快反馈优先**：门禁和单测排在最前，几秒到几十秒出结果；
- **阈值兜底**：覆盖率和行数由机器盯，人只在红线被触发时做决策。

## 小结

1. **本地一键脚本**：`pnpm check` 把静态检查串成一条命令；
2. **一条流水线**：install → check → test → build → e2e，失败即停；
3. **Turborepo 缓存**：没改过的包不重跑；
4. **覆盖率 + 行数双阈值**：让 CI 当那个铁面无私的 reviewer；
5. **本地 = CI**：同一套命令，任何失败都可本地复现。

CI 不是为了报表好看，是为了让一个人也能放心改代码。下一篇是这个系列的收尾：把整个应用从零做到可交付之后，沉淀下来的 10 条经验。
