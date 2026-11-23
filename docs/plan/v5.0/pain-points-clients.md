# AI 客户端社区痛点地图（v5.0 第 2 周）

> 状态：🔬 初稿，可评审
> 查询日期：2026-11-23
> 范围：Cherry Studio、Chatbox、Jan、LM Studio、AnythingLLM、Claude Desktop、ChatGPT Desktop、Raycast AI、Obsidian + AI 插件、Notion AI
> 关联：`README.md`（假设 H1–H3）、`competitor-matrix.md`（30 秒总表）
> 口径：只记录"会让人换产品/付费/弃用"的痛点，不收录功能愿望；结论留给机会评分

## 1. 调研方法与样本说明

| 项 | 说明 |
|---|---|
| 样本量 | 60 条（去重后，按"一个用户可感知的失败场景"计 1 条） |
| 时间窗 | 主体 2025-01 至 2026-11；保留 5 条 2023–2024 作为长期未修基线 |
| 来源分布 | GitHub Issues 40；官方文档/安全公告 5；HN 2；评测/媒体 10（含中文社区 3）；Reddit 3 |
| 置信度·高 | 可打开的一手 issue/官方公告原文（45 条） |
| 置信度·中 | 评测站、博客、指南转述（12 条） |
| 置信度·低/待验证 | 原帖需登录或已 403，仅有镜像摘要（3 条，表中标"待验证"） |
| 抓取限制 | Reddit 直连 403，仅取到镜像摘要；小红书/知乎需登录；G2 评论页需登录，故未计入一手样本 |

**样本偏差必须先说明**：GitHub Issues 天然放大"崩溃/报错/回归"，弱化"用起来别扭但不报错"的问题；中文社区则放大"资源占用、重写后体验退化"。因此下文频率是**证据频率**，不是市场占有率意义上的出现率。

## 2. 痛点总表（60 条）

类别缩写：稳定=稳定性/性能；配置=配置成本；隐私=数据与隐私；Agent=执行可靠性；权限=权限/审批；定价=定价/credits；知识=知识库/引用；记忆=记忆；桌面=桌面集成；多端=多端/同步；升级=升级风险。

| # | 产品 | 痛点（一句话） | 类别 | 严重度 | 证据/来源 URL | 日期 |
|---|---|---|---|---|---|---|
| P01 | Cherry Studio | 单话题约 2 万 token 后滚动/翻页明显掉帧，v1 不卡 | 稳定 | 高 | https://github.com/CherryHQ/cherry-studio/issues/18356 | 2026-08-11 |
| P02 | Cherry Studio | 流式 HTTP 200 响应解析失败，整轮对话直接失败 | 稳定 | 高 | https://github.com/CherryHQ/cherry-studio/issues/20282 | 2026-09-09 |
| P03 | Cherry Studio | Work/Agent 会话以空响应终止，无原因 | Agent | 高 | https://github.com/CherryHQ/cherry-studio/issues/20941 | 2026-09-22 |
| P04 | Cherry Studio | 会话中途切模型报 No conversation found | Agent | 高 | https://github.com/CherryHQ/cherry-studio/issues/14198 | 2026-04-11 |
| P05 | Cherry Studio | Agent 上下文涨过模型窗口才压缩，频繁 400 | Agent | 高 | https://github.com/CherryHQ/cherry-studio/issues/18894 | 2026-08-19 |
| P06 | Cherry Studio | 一张损坏图片永久卡死会话，无 UI 恢复路径 | Agent | 高 | https://github.com/CherryHQ/cherry-studio/issues/21191 | 2026-09-29 |
| P07 | Cherry Studio | 只显示 400 null / "Failed to process successful response" | 稳定 | 中 | https://github.com/CherryHQ/cherry-studio/issues/19824 | 2026-09-01 |
| P08 | Cherry Studio | macOS 客户端经常性卡死 | 稳定 | 高 | https://github.com/CherryHQ/cherry-studio/issues/4150 | 2025-03-30 |
| P09 | Cherry Studio | MCP 报错信息零散，配置失败难定位 | 配置 | 中 | https://github.com/CherryHQ/cherry-studio/issues/3264 | 2025-03-13 |
| P10 | Cherry Studio | 2.0 后 MCP prompts 设置页可见、对话里调不出 | 桌面 | 中 | https://github.com/CherryHQ/cherry-studio/issues/17999 | 2026-08-06 |
| P11 | Cherry Studio | v1.9.13 升级疑似误删用户 D 盘文件夹 | 隐私 | 高 | https://github.com/CherryHQ/cherry-studio/issues/18074 | 2026-08-07 |
| P12 | Cherry Studio | Windows 知识库无法使用非 Azure 的 OpenAI embedding | 知识 | 高 | https://github.com/CherryHQ/cherry-studio/issues/3917 | 2025-03-25 |
| P13 | Cherry Studio | 全局记忆不自动记录/不自动检索，中文召回差 | 记忆 | 高 | https://www.micais.me/posts/2025/11/cherry-memory | 2025-11-26 |
| P14 | Cherry Studio | 16 核机器冷启动 12 秒，资源占用高，用户弃用 | 稳定 | 高 | https://meta.appinn.net/t/topic/91422 | 2026-09-08 |
| P15 | Cherry Studio | 无官方多端同步，只能 WebDAV/本地文件自己搬 | 多端 | 中 | https://oriveoai.com/de/blog/multi-model-ai-client-comparison | 2026（待验证） |
| P16 | Chatbox | 多轮后只思考不输出、按钮失灵，重启后该对话被清空 | 隐私 | 高 | https://github.com/chatboxai/chatbox/issues/3753 | 2026-06-10 |
| P17 | Chatbox | 聊天仅存本地，卸载/重置即永久丢失，服务器无法恢复 | 隐私 | 高 | https://chatboxai.app/zh/guide/faq/data-storage | 2026-11（文档） |
| P18 | Chatbox | 打开软件白屏，无法执行任何操作 | 稳定 | 高 | https://github.com/chatboxai/chatbox/issues/2658 | 2025-09-19 |
| P19 | Chatbox | 不生成任何回复却照常消耗 token | 定价 | 中 | https://github.com/chatboxai/chatbox/issues/1858 | 2025-02-06 |
| P20 | Chatbox | 购买一律不退不换 | 定价 | 中 | https://chat-box.ai/terms-and-conditions/ | 2025-06-08 |
| P21 | Chatbox | MCP 能力长期缺失，用户跨年催更 | 桌面 | 中 | https://github.com/chatboxai/chatbox/issues/1652 | 2024-11-30 |
| P22 | Jan | 更新即损坏，用户称"升级是噩梦" | 升级 | 高 | https://github.com/janhq/jan/issues/5702 | 2025-07-04 |
| P23 | Jan | v0.7.8 无法下载任何模型 | 稳定 | 高 | https://github.com/janhq/jan/issues/7728 | 2026-03-12 |
| P24 | Jan | 0.6.9 启动只有空白窗口 | 稳定 | 高 | https://github.com/janhq/jan/issues/6445 | 2025-09-13 |
| P25 | Jan | Linux Wayland 下完全无法启动 | 稳定 | 高 | https://github.com/janhq/jan/issues/5367 | 2025-06-19 |
| P26 | Jan | 默认上下文仅 4096 且修改困难 | 配置 | 中 | https://github.com/janhq/jan/issues/3796 | 2024-10-14 |
| P27 | Jan | 不内置默认后端，首次使用需自己找引擎 | 配置 | 中 | https://github.com/janhq/jan/issues/6017 | 2025-07-31 |
| P28 | Jan | 0.7.7 的 MLX 后端整体损坏 | 升级 | 中 | https://github.com/janhq/jan/issues/7558 | 2026-02-26 |
| P29 | LM Studio | 加载大模型直接退出（exit 133） | 稳定 | 高 | https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/285 | 2025-01-06 |
| P30 | LM Studio | 安装包被 Windows Defender 误报为木马 | 权限 | 高 | https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1686 | 2026-03-24 |
| P31 | LM Studio | prompt 处理阶段持续变慢 | 稳定 | 中 | https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1229 | 2025-11-14 |
| P32 | LM Studio | 下载停在 "Finalizing download" 永不结束 | 稳定 | 中 | https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1477 | 2026-02-04 |
| P33 | LM Studio | 模型索引无休止，无法进入使用 | 稳定 | 中 | https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1825 | 2026-04-19 |
| P34 | LM Studio | 有独显时不识别核显，GPU 检测错误 | 稳定 | 中 | https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/382 | 2025-02-01 |
| P35 | LM Studio | 不放在 /Applications 就不能正常运行（macOS） | 权限 | 中 | https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/347 | 2025-01-22 |
| P36 | AnythingLLM | MCP 连接必须从命令行启动，桌面双击必失败 | 桌面 | 高 | https://github.com/Mintplex-Labs/anything-llm/issues/4017 | 2025-06-18 |
| P37 | AnythingLLM | 检索准确率不高，回答与原文对不上 | 知识 | 高 | https://github.com/Mintplex-Labs/anything-llm/issues/645 | 2024-01-24 |
| P38 | AnythingLLM | 上传文档后报 Could not respond / fetch failed | 知识 | 高 | https://github.com/Mintplex-Labs/anything-llm/issues/1586 | 2024-05-31 |
| P39 | AnythingLLM | 中文文件名文档无法上传 | 知识 | 中 | https://github.com/Mintplex-Labs/anything-llm/issues/1881 | 2024-07-17 |
| P40 | AnythingLLM | 生成 artifacts 时返回空响应 | Agent | 中 | https://github.com/Mintplex-Labs/anything-llm/issues/7298 | 2026-11-19 |
| P41 | Claude Desktop | 短对话即被折叠，聊天与上下文持续丢失 | 隐私 | 高 | https://www.reddit.com/r/claude/comments/1r93nmn/ | 待验证 |
| P42 | Claude Desktop | MCP 只能手改 JSON，Windows 路径转义极易出错 | 配置 | 高 | https://mcp-find.org/learn/claude-desktop-mcp-missing-manual | 2026（待验证） |
| P43 | Claude Desktop | Skills 不工作（用户称为已知问题） | Agent | 中 | https://www.reddit.com/r/claude/comments/1r93nmn/ | 待验证 |
| P44 | Claude Desktop | 会话数据不在自己手里，担心工作记录被锁在应用内 | 隐私 | 中 | https://www.reddit.com/r/claude/comments/1r93nmn/ | 待验证 |
| P45 | ChatGPT Desktop | 极易丢会话历史与上下文，用户因此转向别家 | 隐私 | 高 | https://news.ycombinator.com/item?id=50410927 | 2026-11-08 |
| P46 | ChatGPT Desktop | 未授权即展示本地目录/路径，引发隐私恐慌 | 隐私 | 高 | https://canaltech.com.br/inteligencia-artificial/panico-de-privacidade-chat-gpt-no-mac-exibe-pastas-do-usuario-sem-permissao/ | 2026-07-15 |
| P47 | ChatGPT Desktop | 电脑离线时任务回退云端，读不到本地文件 | Agent | 中 | https://help.openai.com/en/articles/20001548-agent-security-and-local-work-sync-in-chatgpt | 2026（文档） |
| P48 | Raycast AI | credits 消耗快、月度额度 60 天过期，成本不可预测 | 定价 | 高 | https://aitoolsatlas.ai/tools/raycast/worth-it | 2026 |
| P49 | Raycast AI | 用自家 API Key 仍需付费套餐 | 定价 | 中 | https://aitoprating.com/tools/raycast/ | 2026 |
| P50 | Raycast AI | Windows 功能缺失、iOS 不支持 AI Extensions | 多端 | 中 | https://aitoprating.com/tools/raycast/ | 2026 |
| P51 | Raycast AI | 切到 GPT-5 后响应明显变慢，快捷键场景体验倒退 | 稳定 | 中 | https://news.ycombinator.com/item?id=44841529 | 2025-08-08 |
| P52 | Obsidian Copilot | 索引致命错误 Orama DB not found，并反复重载模型 | 知识 | 高 | https://github.com/logancyang/obsidian-copilot/issues/1044 | 2025-01-13 |
| P53 | Obsidian Copilot | 笔记显示已索引，问答却检索不到 | 知识 | 高 | https://github.com/logancyang/obsidian-copilot/issues/1484 | 2025-05-09 |
| P54 | Obsidian Copilot | 包含/排除过滤检查造成显著延迟 | 稳定 | 中 | https://github.com/logancyang/obsidian-copilot/issues/1140 | 2025-01-31 |
| P55 | Obsidian Smart Connections | 打开即无限显示 Loading，无法使用 | 稳定 | 高 | https://github.com/brianpetro/obsidian-smart-connections/issues/961 | 2025-01-13 |
| P56 | Obsidian Smart Connections | 反复重建 embeddings，白耗 token 与等待时间 | 知识 | 高 | https://github.com/brianpetro/obsidian-smart-connections/issues/496 | 2024-02-29 |
| P57 | Obsidian Copilot | 移动端/平板功能残缺，Agent Chat 仅桌面可用 | 多端 | 高 | https://www.obsidiancopilot.com/en/docs/faq | 2026（文档） |
| P58 | Notion AI | AI 并入 Business，Plus 用户被迫 $20/人/月 | 定价 | 高 | https://www.aitooldiscovery.com/guides/notion-ai-reddit | 2025-05 |
| P59 | Notion AI | Fireworks 事件泄露 Notion AI 对话记录 | 隐私 | 高 | https://www.notion.com/security/advisories/security-incident-involving-a-third-party-ai-vendor-nov9 | 2026-11-11 |
| P60 | Notion AI | 大型工作区明显变慢，AI 回答需人工复核 | 稳定 | 中 | https://learn.g2.com/best-ai-writing-generators | 2026 |

## 3. 聚类主题（10 个）

### T1 稳定性：从"卡"到"静默失败"（18 条，证据频率最高）
- **定义**：性能劣化与失败不可解释混在一起——卡顿、白屏、空响应、错误码直出。
- **产品**：Cherry、Chatbox、Jan、LM Studio、Raycast、Obsidian。
- **为什么重要**：这是最直接触发"今天不用了"的类别；Cherry 2.0 卡顿、Jan 升级后白屏后均出现用户弃用或锁旧版的表述。
- **原声**："Cherry Studio 的资源占用和优化真的很拉胯……用了一段时间就感觉很油腻，不想用了。"（小众软件，2026-09）

### T2 Agent 执行的不可恢复性（7 条）
- **定义**：一次坏输入、一次切模型、一次上下文溢出就让会话死掉，且没有重试/回滚/跳过入口。
- **产品**：Cherry（最集中）、AnythingLLM、Claude Desktop、ChatGPT Desktop。
- **为什么重要**：Agent 的价值在"跑完"；不可恢复等于把风险外包给用户。P05/P06 是典型"必须重开会话"。
- **原声**："A single corrupt image permanently bricks an Agent session… with no UI recovery path."（Cherry #21191）

### T3 本地数据丢失是信任的分水岭（8 条）
- **定义**：清空、误删、无备份、无法从服务器恢复。
- **产品**：Chatbox、Cherry、ChatGPT Desktop、Claude Desktop。
- **为什么重要**：本地优先产品的核心承诺是"数据是你的"；Chatbox 与 Cherry 的一手记录里，丢数据都是最高烈度的抱怨。
- **原声**："重启后……对话内容被完全清空（聊天记录丢失），无法找回。"（Chatbox #3753）

### T4 隐私与权限边界（权限 2 条 + 与 T3 交叉 4 条）
- **定义**：本地文件读取边界不清、安全软件误报、必须特定安装路径。
- **产品**：ChatGPT Desktop、LM Studio。
- **为什么重要**：桌面 Agent 越能干活，权限叙事越敏感；一次"它怎么知道我的路径"就足以劝退。
- **原声**："app 在未获全盘授权的情况下展示本地目录与文件列表。"（Canaltech 转述 Reddit，2026-07）

### T5 配置成本被低估（4 条）
- **定义**：JSON 手改、embedding 选型、默认参数、后端缺失。
- **产品**：Claude Desktop、Jan、Cherry。
- **为什么重要**：配置成本直接决定"第一次成功"；P42 的转义错误是纯人为门槛，不是能力问题。
- **原声**："Go ask 30 people off the street to set up LM studio and get it using tools to search the web."（HN，2026-11）

### T6 知识库：能查到 ≠ 查得对（7 条）
- **定义**：索引失败、检索不到、答非所问、中文/文件名兼容。
- **产品**：AnythingLLM、Obsidian 两插件、Cherry。
- **为什么重要**：这是"工作台"与"聊天框"的分界线；检索不可信时用户会退回手工搜索。
- **原声**："笔记显示已索引，但 Vault QA 检索不到。"（Obsidian Copilot #1484）

### T7 记忆：不可控、不可解释、不可迁移（1 条主证 + 2 条交叉）
- **定义**：不自动记、记了查不到、记得零碎、只存在某个应用里。
- **产品**：Cherry、Claude、ChatGPT。
- **为什么重要**：记忆是留存假设 H2 的核心，但现有证据显示用户宁可用"知识库 + 手动粘贴"替代。
- **原声**："最稳定的办法还是手动添加记忆。"（Mica，2025-11）

### T8 多端与同步的断层（3 条）
- **定义**：桌面之外不可用，或同步靠用户自己。
- **产品**：Cherry、Raycast、Obsidian。
- **为什么重要**：移动场景不是"锦上添花"，官方 FAQ 与横评都把它列为体验缺口，可能直接导致移动场景弃用。
- **原声**："Mobile/iPad support is experimental and may lack full feature parity."（Obsidian Copilot FAQ）

### T9 定价：不可预测比"贵"更致命（5 条）
- **定义**：credits 烧得快、额度会过期、BYOK 仍收费、套餐强制升级、付了钱没产出。
- **产品**：Raycast、Notion、Chatbox。
- **为什么重要**：P48/P58 说明计费不确定性与套餐门槛会直接压低付费意愿与使用频次。
- **原声**："credits expire after 60 days… expensive models consume credits faster."（2026 评测）

### T10 升级即风险（2 条 + Cherry 2.0 回归交叉）
- **定义**：大版本重写带来功能回归，用户被迫锁旧版。
- **产品**：Cherry 2.0、Jan。
- **为什么重要**：P10/P22 说明用户已形成"先别升"的习惯，这会冻结产品的迭代红利。
- **原声**："cherry studio 更新 2.0 大版本的时候我实在觉得难用……现在固定 1.9.8 在用。"（小众软件，2026-09）

## 4. 对 WorkBuddyForMe 的 5 条启示（事实层，不含主题结论）

1. **失败后的"可恢复动作"是可验证差异点**：竞品证据集中在"会话死掉只能重开"。我们已有审批、审计、持久化执行；需要实测的是"失败后 30 秒内能否继续"，而非再列一个功能。
2. **备份/导出/一键恢复是入场券**：Chatbox 明确"服务器无法恢复"，Cherry 出现升级误删。对本地优先产品，这属于信任基础设施，不能当卖点讲。
3. **记忆的竞争点是可见性**：Cherry 的失败在于用户看不见"记了什么、为何没搜到"。可解释、可编辑、可迁移比"记得多"更能对应 H2 的验证条件。
4. **移动端"接续"比"全功能"更现实**：Cherry/Jan 无同步、Obsidian 移动端残缺、Raycast 跨平台不一致。只读 + 继续对话 + 审批推送，可能覆盖大部分断点。
5. **定价要可预算**：BYOK 仍收费（Raycast）、额度过期、套餐强制升级，是明确的负面触发器。若采用订阅，应提供预检、上限与失败不计费。

## 5. 证据薄弱项（使用时降权）

- **记忆**：仅 1 条可复核一手体验（Cherry 全局记忆），Claude/ChatGPT 的记忆抱怨来自搜索摘要，未能打开原帖。
- **权限/审批**：只有 2 条安装/误报类 issue，缺少"审批疲劳"的真实原声；与产品最相关的"逐次授权是否烦人"尚无证据。
- **多端/同步**：多来自官方 FAQ 与二手横评，未取得一手用户抱怨；中文社区的相关讨论未能打开正文。

> 下一步建议：用统一 5 个上手任务复现 T1/T2/T5/T6（成功率、恢复耗时、配置步数），把上述"证据频率"升级为"实测频率"。
