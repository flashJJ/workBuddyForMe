# 一个人的 AI 平台怎么搭？pnpm Monorepo 分层实战

> 写给想从零搭一个「本地优先 + 桌面交付」AI 应用的独立开发者。

## 故事的开始

我想做一个私人 AI 助手：能对话、能管知识库、能自定义助手人设，最好还能打包成桌面应用给朋友用。一个人、一台机器，怎么把这件事拆得既不乱、又能持续迭代？

答案是：**Monorepo + 清晰分层**。

## 为什么选 Monorepo

一开始我也犹豫过：要不要拆成多个仓库？Web 一个、桌面一个、公共库一个？试了两天就放弃了——改一个类型定义，要在三个仓库里同步发版，比写代码还累。

最终用 **pnpm workspaces + Turborepo**，一个仓库搞定：

```
workBuddyForMe/
├── apps/
│   ├── web/        Next.js 14 全栈（页面 + API）
│   └── desktop/    Electron 主进程 / preload / 打包
├── packages/
│   ├── shared/     领域类型、Zod schema、错误码
│   ├── config/     数据根路径、环境变量（唯一事实源）
│   ├── database/   better-sqlite3 + 迁移 + 仓储
│   ├── ai/         Provider 抽象 + OpenAI 兼容适配器
│   └── core/       业务服务：对话 / 知识库 / RAG / 设置
└── scripts/        工程脚本
```

## 分层的核心原则：依赖只能往下走

这是整个项目最重要的一条规矩，我把它写进了架构文档，还加了测试来守护：

```text
web ──→ core ──→ ai ──→ shared
 │       │        │
 │       ├─→ database ──→ config ──→ shared
 │       └─→ config
desktop ──→ config（只碰路径契约）
```

**反向依赖绝对禁止**：`shared` 不能引用 `core`，页面组件不能直接 `import database`。所有数据访问必须经过 `core` 服务层，由 `apps/web` 的 Route Handler 调用。

这条规矩的好处是：改数据库实现不影响前端，换 AI 供应商不影响 UI，各层可以独立测试。

## 包导出的小技巧：开发走源码，生产走产物

每个 package 的 `package.json` 里我用了条件导出：

```json
{
  "exports": {
    "development": "./src/index.ts",
    "default": "./dist/index.mjs"
  }
}
```

- **开发态**（Next dev / Vitest）：直接消费 TS 源码，免 watch 构建，改完即生效
- **生产态**：消费 tsup 构建产物，可追踪、可打包

这一招让开发体验拉满，又不牺牲生产可控性。

## 桌面端为什么只依赖 config

桌面端（Electron 主进程）的职责很纯粹：开窗口、托管 Next 服务、管密钥。它**不需要**知道对话怎么存、知识库怎么检索——那些都是 `core` 的事。

所以 desktop 只依赖 `config`（拿路径和环境变量），业务逻辑全在被 fork 出去的 Next 进程里跑。这样桌面出问题不会污染业务层，反之亦然。

## 一个人维护的底气

分层不是为了炫技，是为了**一个人也能 hold 住**：

- 想加个新 API？改 `core` 服务 + `web` Route Handler，两行的事
- 想换数据库？只动 `database` 包，上层无感
- 想支持新模型供应商？在 `ai` 包加个适配器，`core` 不用改

Monorepo 让共享代码零成本，分层让改动有边界。一个人写全栈，最怕的不是代码多，是「牵一发而动全身」。分层，就是给这种恐惧上保险。

## 小结

如果你也在一个人做全栈 AI 应用，记住三件事：

1. **Monorepo** 比多仓库省心，pnpm + Turborepo 足够
2. **依赖单向**，写进文档再加测试守护
3. **包导出分条件**，开发体验和生产可控兼得

下一篇聊聊「为什么我给项目设了单文件 ≤300 行的硬规则」，那是另一个让独立开发不崩盘的小规矩。
