# WorkBuddyForMe v3.1.0 版本总结

> 版本：3.1.0（2026-11-15）
> 主题：可插拔前置——能力/provider 注册表与动效内容注入
> 范围：M0 → M1 → M2 → M3 → M4，附带舞台默认 VRM 与入口转正式
> 真源：[release-notes.md](./release-notes.md)、[progress-log.md](./progress-log.md)

## 1. 这一版解决了什么

v3.0 把陪伴闭环做完了，但扩展能力仍然绑在三个硬编码分叉上：新增能力要改 `switch (manifest.kind)`，新增模型协议要改 `switch (protocol)`，动效内容写死在页面内的静态表里。v3.1 不追求“插件市场”，只做三个低风险探针，验证“不改内核也能加东西”：

| 耦合点 | 改造前 | 改造后 |
|---|---|---|
| 能力 effect | `switch (kind)` 六个 case | `CapabilityEffectHandler` 表，按 kind 查表 |
| 模型协议 | `switch (protocol)` 两个 case | protocol → factory 表，可注册新协议 |
| 动效内容 | 运行时直接 import 静态表 | `MotionContent` 快照注入，默认仍用内置表 |

## 2. 里程碑与交付

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 方案与归档 | v3.1 方案、候选 05/06 移入 scheduled、三处索引 | 完成 |
| M1 能力 handler 注册表 | 六类 handler、注册函数、拒绝覆盖、registry 单测 | 完成 |
| M2 provider 注册表 | factory 表、注册函数、mock 协议单测 | 完成 |
| M3 动效内容快照 | `MotionContent`、运行时构造参数、剧本白名单派生、注入单测 | 完成 |
| M4 门禁与发布 | 单测与六项门禁、发布说明、版本总结、10 篇博客 | 完成 |
| 附带 | 舞台默认 VRM、舞台入口转正式、性能文案 | 完成 |

## 3. 关键数字

| 指标 | 结果 |
|---|---|
| 能力 effect 类型 | 6 类（skill / mcp / workflow / pet-action / event-script / report-widget）零回归 |
| provider 协议 | 2 个内置协议零回归，新协议注册 1 项测试 |
| 动效内容 | 1 份默认快照；注入单姿势内容可播放，旧内容不可见 |
| 测试 | core 能力 57 项、ai registry 5 项、web 动效/剧本 215 项、web 舞台 65 项、desktop 舞台/托盘 20 项 |
| 文档门禁 | `pnpm check` 六项全绿；Markdown 框图检查 790+ 文件 |
| 迁移 | 0；`LATEST_SCHEMA_VERSION = 51` 不变 |

## 4. 用户可见变化

- 舞台普通模式也使用内置 VRM，不再只有小剧场是 3D。
- 托盘与应用菜单可以直接选“自由舞台”或“小剧场”。
- 舞台内可一键进入小剧场、一键返回自由舞台。
- 性能档位文案不再写死 Live2D，省电档语义对所有角色一致。

## 5. 已知限制

- 不包含 `motion-pack` / `scene-pack` 的安装、签名、回滚与热加载。
- provider 没有能力元数据，设置页仍按现有协议列表展示。
- 动效快照只到运行时构造层，未上抛到 `VrmPoseLayer` / `VrmSession`。
- 舞台模式切换是整页重载，会重新加载 VRM。
- 未构建 v3.1 安装包，也未做发布真机截图。

## 6. 下一版本衔接

v4.0 若要继续平台化，可以在本版注册口上做：`motion-pack` 能力类型、依赖拓扑（S5）、安装后内容快照刷新（S6）、provider 能力元数据。动效独立包（候选 06 方案 B）需要先冻结 `MotionContent` 契约，再评估是否抽出 `packages/motion`。
