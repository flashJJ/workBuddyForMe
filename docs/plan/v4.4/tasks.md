# v4.4 Tasks

> 方案：[README.md](./README.md) · Spec：[spec.md](./spec.md) · 进度：[progress-log.md](./progress-log.md)

## M0 方案与转正

- [ ] T0.1 候选 12 转正为 `roadmap/scheduled/v4.4-12-background-wallpaper-video.md`，更新三处索引
- [ ] T0.2 方案、Spec、Tasks、进度日志落盘
- [ ] T0.3 提交 `docs(v4.4): 背景与壁纸方案`

## M1 背景模型与内置素材

- [x] T1.1 shared 新增 `BackgroundSource`、`BackgroundConfig`、`BackgroundSettings` 与默认值
- [x] T1.2 设置读写接入 `main/stage/pet` 三作用域，兼容旧设置缺省
- [x] T1.3 内置素材落盘：循环视频 6.42MB + 图集 28 张 5.06MB + 2 套渐变；媒体预算表待补
- [x] T1.4 shared 测试：默认值、互斥 `mode`、数值边界

## M2 本地图片/视频

- [x] T2.1 桌面 IPC：`background:pick/list/remove`，复制到 `userData/backgrounds`
- [x] T2.2 扩展名白名单、大小上限、内容嗅探与 uuid 命名
- [x] T2.3 受控读取路由/协议与路径校验；缺失回退内置
- [x] T2.4 desktop 测试：超限、非法类型、路径穿越、删除与列表

## M3 `wallpaper-pack`

- [x] T3.1 shared `wallpaper-pack` payload schema 与预算常量
- [x] T3.2 core effect：payload 读取、资源存在/路径/许可校验、启停
- [x] T3.3 core 内容服务：按启用行聚合背景源与快照版本
- [x] T3.4 web API：`/api/wallpaper-content` 与包内资源只读路由
- [x] T3.5 样例壁纸包与安装/停用链路测试

## M4 渲染接线

- [x] T4.1 舞台底层背景组件；未配置时沿用剧集 `backdrop`
- [x] T4.2 主窗口聊天/整屏背景与 `mode` 互斥
- [x] T4.3 桌宠独立背景，默认透明；命中区与穿透不变
- [x] T4.4 视频暂停策略、省电档与减少动态效果回落

## M5 设置页

- [x] T5.1 设置「外观」新增背景分组：舞台、主窗口（聊天/整屏）、桌宠三个配置点
- [x] T5.2 本地文件选择与预览、体积/格式提示、恢复默认
- [x] T5.3 i18n 中英文案与设置目录注册
- [x] T5.4 设置页测试：切换、持久化、桌面/Web 能力差异

## M6 收尾

- [x] T6.1 全量测试与 `pnpm check`
- [x] T6.2 安装包构建、归档与校验和
- [x] T6.3 发布说明、版本总结、进度日志与博客
- [ ] T6.4 合并 main、打 tag `v4.4.0` 并推送工蜂

## M7 表面层级治理（追加）

- [x] T7.1 方案、L0–L5 层级模型与登记表（`surface-system.md` / `surface-registry.md`）
- [x] T7.2 六个语义 token、Tailwind `ui.*` 与 `check:surfaces` 基线（330 处 / 170 文件）
- [ ] T7.3 共享基座迁移（Card/Button/Input/Select/Dialog/EmptyState/Toast）
- [ ] T7.4 首批模块迁移（设置/知识库/运行报告/助手）
- [ ] T7.5 其余模块迁移、基线清零与文档回填
