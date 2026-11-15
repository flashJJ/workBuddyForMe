# 发布信任与更新通道：签名、校验和与自有更新源

> 状态：**候选方案，待评审**。关联：[开发指南](../../development.md) 的发版流程、[发布说明](../../plan/v3.0/release-notes.md)。
> 记录日期：2026-11-15。

## 1. 问题

当前安装包可以构建，但发布信任链不完整：

- Windows 安装包未签名，Smart App Control/Defender 会拦截重打包产物，本机冒烟需降级到官方 Electron 宿主；
- Release 资产只有 exe/blockmap/latest.yml，没有独立的校验和清单与签名；
- 更新源与代码托管绑定在 GitHub Release，发版流程重，且与私有仓库的日常提交节奏不一致；
- 用户无法在下载页直接验证「这个包是不是官方构建」。

## 2. 现状证据

| 项 | 现状 |
|---|---|
| 签名 | electron-builder 日志：no code signing certificate configured |
| 冒烟 | Smart App Control 开启时用官方签名 electron.exe 加载 app.asar |
| 更新 | electron-updater + GitHub publish provider |
| 资产校验 | 构建后有 asar 依赖校验，但安装包没有对外校验和 |
| 仓库 | 代码已同步到私有工蜂，GitHub 仅用于发布 |

## 3. 可选方案

| 方案 | 做法 | 收益 | 成本 |
|---|---|---|---|
| A 校验和 | 发布时生成 SHA256 清单并随 Release 附带 | 可验证完整性，零证书成本 | S |
| B 代码签名 | OV/EV 证书签名 exe 与安装包 | 降低 SmartScreen 拦截 | M（证书/密钥管理） |
| C 自有更新源 | generic provider 指向自有静态文件源，与代码托管解耦 | 发版不依赖 GitHub | M |
| D 双通道 | stable/beta 两个 feed，灰度与回滚 | 降低升级风险 | M |

## 4. 推荐

分三步：A 立即做，B 视发布范围再上，C 在需要脱离 GitHub 发版时做，D 最后。

- 构建产物生成 `SHA256SUMS` 与 `build-info.json`（版本、commit、构建时间）；
- 安装包与 blockmap 同步上传，更新源优先使用自有静态目录；
- 签名证书只放 CI secret，私钥不落盘到仓库；签名后重新计算校验和；
- 保留「未签名构建」开关，供内测与本机验证。

## 5. 验收口径

1. 发布资产包含安装包、blockmap、latest.yml、SHA256SUMS。
2. 更新源切换后，旧版本能检查到新版本并完成升级/回滚。
3. 未签名与已签名构建都能启动；签名构建在 Smart App Control 环境不被拦截。
4. 构建信息能从安装包回溯到 commit 与构建时间。
5. 私钥、证书口令不出现在日志与仓库。

## 6. 风险

| 风险 | 对策 |
|---|---|
| 证书成本与续期 | 先用校验和，发布范围扩大再购证书 |
| 自有更新源被篡改 | HTTPS + 校验和 + 签名；更新包只从固定域名拉取 |
| 升级失败导致不可用 | 保留旧版本安装包与回滚说明 |
| 双通道配置错误 | feed 地址白名单 + 启动时校验 |

## 7. 待决策

1. 是否近期购买 Windows 代码签名证书？
2. 更新源放工蜂附件、对象存储还是自有静态站点？
3. 是否需要 beta 通道，还是只保留 stable？
