# 一个人的项目也要有 CI：本地一键脚本与 GitHub Actions

> 没人评审你的代码，CI 就是那个铁面无私的 reviewer。

## 为什么一个人也要 CI

「就我一个人写，CI 有啥用？」——曾经我也这么想。直到有一次：

改了个工具函数，本地测了没问题，提交后忘了跑全量测试。第二天发现某个边缘场景崩了，查了半天才定位到是那个改动的连锁反应。

从那以后，每次提交都跑一遍全量检查。但手动跑容易忘，也懒得每次都敲一堆命令。**CI 就是把「该跑的检查」自动化**。

## 本地一键脚本

先把本地体验做好。根 `package.json` 聚合所有脚本：

```json
{
  "scripts": {
    "dev:web": "pnpm --filter @wbfm/web dev",
    "dev:desktop": "pnpm --filter @wbfm/desktop dev",
    "build": "turbo run build",
    "check": "pnpm typecheck && pnpm lint && pnpm check:lines",
    "test:unit": "turbo run test:unit",
    "test:integration": "pnpm --filter @wbfm/web test:integration",
    "test:e2e": "pnpm --filter @wbfm/web test:e2e",
    "test:e2e:desktop": "pnpm --filter @wbfm/desktop test:e2e"
  }
}
```

Windows 下还有 PowerShell 脚本 `dev-web.ps1` / `dev-desktop.ps1`，做环境检查（Node 版本、依赖是否安装）后再启动。

提交前我只需要跑：

```bash
pnpm check
pnpm test:unit
pnpm test:integration
```

全绿再提交。

## GitHub Actions 流水线

CI 配置 `.github/workflows/ci.yml`，步骤：

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

每一步失败就停，不往下走。这样能快速定位是哪层出了问题。

## Turborepo：让 CI 跑得快

Monorepo 的 CI 如果每次都全量构建/测试，很慢。Turborepo 的远程缓存让「没改过的包」直接复用缓存：

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

`dependsOn: ["^build"]` 表示先构建依赖包。`outputs` 声明产物，Turborepo 据此做缓存命中。

本地和 CI 共享缓存（CI 用 GitHub Actions cache），二次运行快很多。

## 覆盖率阈值阻断

Vitest 配置里设 thresholds：

```ts
coverage: {
  thresholds: {
    statements: 70,
    lines: 70,
  },
}
```

覆盖率低于 70%，`test:unit` 非零退出，CI 挂。这逼着你给核心逻辑写测试。

## 行数门禁

自定义脚本 `check-file-lines.mjs`，扫描手写 `.ts/.tsx`，超 300 行就挂。CI 里也跑，防止有人（包括未来的自己）提交超长文件。

## Windows 打包的特殊处理

Electron 打包在 CI 里跑有几个坑：

1. **electron-builder 二进制下载**：从 GitHub 下载可能超时，用国内镜像：
   ```bash
   ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
   ```

2. **原生模块重编译**：better-sqlite3 需要和 Electron 版本匹配。但我的架构是 fork 真实 Node，所以不需要 electron-rebuild（详见 ABI 篇）。

3. **未签名 exe**：Windows CI 上打包出的 exe 没有签名，用户运行时 Smart App Control 可能拦截。这是分发层面的问题，CI 只负责打包成功。

## 本地验证 = CI 验证

一个原则：**本地能过的，CI 必须能过；反之亦然**。

所以本地脚本和 CI 跑的是同一套命令。如果 CI 挂了，本地跑同样的命令也能复现，不用「在 CI 上好好的」这种玄学。

## 一个人的 CI 哲学

- **不追求复杂**：一个 workflow 够了，不用 matrix、不用多环境
- **全绿才合并**：CI 不过不提交，养成肌肉记忆
- **快反馈**：门禁和单测优先，几秒到几十秒出结果
- **覆盖率兜底**：核心逻辑必须有测试，CI 帮你盯着

## 小结

一个人的项目也要有 CI：

1. **本地一键脚本**：`pnpm check` 把静态检查串起来
2. **GitHub Actions**：install → check → test → build → e2e
3. **Turborepo 缓存**：没改过的包不重跑
4. **覆盖率 + 行数阈值**：CI 当铁面 reviewer
5. **本地=CI**：同一套命令，能复现

CI 不是为了好看，是为了让「一个人也能放心改代码」。

下一篇是这个系列的收尾：「从 0 到 1 做一个本地 AI 平台，我学到了什么」。
