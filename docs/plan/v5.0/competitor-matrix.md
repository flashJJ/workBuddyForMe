# v5.0 竞品矩阵（第 1 周桌面研究）

> 状态：🔬 初稿，可评审
> 查询日期：2026-11-23
> 范围：13 个对象（5+3+3+2），4 个分层；只做桌面研究，不含上手实测
> 关联：`docs/plan/v5.0/README.md`（主题待冻结，本文件不改结论）

## 1. 调研范围与方法

- **对象**：4 层共 13 个（清单原写 12，实列 13，已全覆盖），见总表。
- **来源**：官方产品页/定价/文档、GitHub API、第三方评测与媒体报道（2026 年）。
- **口径**：「官方」为官方直接声称；「社区」为第三方评测或用户反馈；「待验证」为本次未取一手证据；价格为刊例价，星标数为查询日快照（部分滞后）。
- **不做**：不装软件、不跑任务、不测成功率；不据此选主题。

| 待验证项 | 对象 |
|---|---|
| 长期记忆 / 引用展示 | Cherry、Chatbox、Jan、LM Studio、AnythingLLM、Coze、Notion |
| 内置 RAG | Jan、LM Studio、Raycast |
| 系统级控制 / 定时触发 | Cherry、Chatbox、AnythingLLM / Coze、Notion |
| MCP 形态 / 插件价格 / 仓库活跃度 | Raycast、ChatGPT 企业版 / Copilot Plus / Jan、Dify |

## 2. 总表（13 行 × 12 维度）

| 产品 | 定位/目标用户 | 本地/离线 | 模型接入 | 知识/RAG | 记忆 | 工作流/自动化 | 桌面/系统集成 | 插件/工具/生态 | 协作/多智能体 | 价格与许可 | 上手/首启 | 口碑与风险 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Cherry Studio** | 多模型 AI 工作台；2.0 转 Agent 工作空间（官方+社区）；个人/小团队 | 本地模型可离线，数据本机；云模型需网 | 主流云 API、Ollama、自定义兼容端点；内置免费模型 | 本地知识库、文档解析；引用展示待验证 | 待验证 | 无可视化编排；2.0 Agent 运行时、工具审批、多窗口（社区） | 桌面端；Agent 读写文件 + MCP；系统级控制待验证 | MCP；预置助手（数量待验证） | 单用户；多智能体待验证 | 社区版免费 AGPL-3.0；企业版 Express ¥5,000 永久 + ¥5,000 额度 | 下载即用、无需账号；配 API Key 有门槛（社区） | 53.5k★；Electron 资源占用高、2.0 长会话卡顿（社区） |
| **Chatbox** | 跨端 AI 客户端；Chat + Work Mode | 本地知识库 + 本地模型可离线；托管模型需网 | BYOK 多供应商、Ollama；Chatbox AI 托管模型 | 本地知识库、文件问答；引用待验证 | 待验证 | Work Mode Agent；无可视化编排 | 桌面/移动/Web；工具调用；系统控制待验证 | MCP；模板 | 无 | Free；Lite $3.99、Pro $19.99、Pro+ $39.99/月；客户端 GPL-3.0 | 免费额度即用，门槛低 | 42.4k★；积分消耗过快、订阅/客服投诉（社区） |
| **Jan** | 100% 离线开源 ChatGPT 替代 | 官方称完全离线；数据本机 | llama.cpp 本地模型 + 远程 API；本地 OpenAI 兼容服务 | 无内置知识库（待验证） | 待验证 | 无 | 桌面端；MCP 工具；无系统控制 | MCP | 无 | 免费，Apache-2.0 | 下载→选模型→对话，门槛低 | 37.3k★；维护节奏与仓库活跃度待验证 |
| **LM Studio** | 本地模型运行器 + Agent（Bionic，官方） | 本地完全离线；云推理可选 | llama.cpp/MLX 本地模型；托管开源模型（Bionic+） | 文档问答待验证 | 待验证 | 无编排；Bionic 提供自动化/任务 | Bionic 支持 computer control、本地语音转录 | MCP Host（0.3.17+）、Hub 插件（beta） | 无 | Free；Bionic+ $20、Pro $100/月；专有免费（个人+内部商用） | 下载→搜模型→运行，门槛很低 | 无开源仓库；Bionic 独立应用可能造成体验割裂（社区） |
| **AnythingLLM** | 本地优先 RAG + Agent 工作台 | 本地默认、桌面可离线 | 内置本地 LLM、Ollama/LM Studio、云供应商 | 工作区 + 向量库 + 引用 | 工作区会话；长期记忆待验证 | Agent Flows（无代码）+ 定时任务 | 桌面/自托管；文件系统等内置技能 | MCP（stdio/SSE/HTTP）、内置技能 | 多用户（Cloud/自托管）；多智能体程度待验证 | Desktop 免费 MIT；Cloud $50/$99 每月；企业定制 | 免账号、可内置模型，门槛低 | 68.2k★；重功能下的体验一致性待验证 |
| **n8n** | 通用工作流自动化 + AI | 自托管可离线；模型多需外部 | AI 节点自带 Key；Cloud 提供免 Key 模型 | 向量库节点自行拼装，非内置知识库 | 有 Agent Memory 节点（待核文档） | 强：可视化编排、cron、Webhook、事件触发 | 服务端执行；Execute Command 可触达本机 | 400+ 集成、社区节点、MCP | 子流程/多 Agent 节点，非会议式协作 | 自托管 Community 免费（Sustainable Use License）；Cloud €20/€50/€667 起 | 需部署 + 节点思维，门槛中 | 211k★；fair-code 被指“伪开源”、Pro→Business 价格断崖（社区） |
| **Dify** | LLM 应用 / Agent 开发平台 | 自托管可离线；默认依赖外部模型 | 多供应商 + Ollama/兼容端点；Cloud 自带额度 | 知识库、分段、召回测试；混合检索/重排待核版本 | 会话变量；长期记忆待验证 | 强：可视化工作流、插件/定时/Webhook 触发 | 无桌面控制；代码沙箱 | 插件市场、MCP Server 发布 | 多工作区协作；多智能体能力待验证 | 社区免费（Dify 开源许可）；Cloud $590/$1,590 每年；企业定制 | Docker 自托管容器多，门槛高（社区称 15 个） | 89.3k★；学习曲线、资源占用、文档缺口（社区） |
| **Coze（扣子）** | Agent 搭建与分发平台；国内团队/开发者 | 云为主；coze-studio 可自托管 | 豆包/方舟 + 自定义模型（3.0） | 知识库（文本/表格/图片，官方） | 变量/数据库；长期记忆待验证 | 强：工作流、插件、项目空间 | 3.0 可接本地 Agent；云手机/云电脑 | 插件商店、模板；多渠道发布待验证 | 强：多人多 Agent 协作（3.0，官方） | 免费；个人 39.9–999 元/月；企业 498 元/月起；开源版 Apache-2.0 | 模板化搭建，门槛低 | 21.8k★（开源版）；套餐重构与积分消耗争议（社区） |
| **Claude Desktop** | 通用助手 + 本地工作区 | 云依赖，不可离线 | 仅 Anthropic 模型 | Projects/文件/连接器；Research 引用 | 跨会话记忆 | 无可视化编排；Cowork/Claude Code/Skills | 本地文件（Cowork 工作区）、Chrome 扩展、本地 MCP | MCP、桌面扩展、Skills、连接器 | Cowork/Code 子代理；Team 协作 | Free；Pro $20（年付 $17）；Max $100 起；Team $20/席起 | 安装登录即用，门槛很低 | 云依赖、额度限制；本地能力需 Pro |
| **ChatGPT Desktop** | Chat + Work + Codex 一体化桌面 | 云依赖 | 仅 OpenAI 模型 | 文件/Apps/Projects；Deep Research 引用 | 有（跨会话，官方） | Tasks（待验证）+ Work；无可视化编排 | 本地文件、桌面应用（授权）、内置浏览器；Windows Computer Use（Codex） | Apps/连接器；GPTs 现状待验证 | Codex 多任务并行；Work | Free；Go $8；Plus $20；Pro $100 起；Business $100/席（官方/媒体） | 安装登录即用，门槛很低 | 云依赖、分层定价复杂；记忆与隐私关注（社区） |
| **Raycast AI** | 启动器式系统级 AI 助手 | 云依赖（BYOK 仍需网络） | 多供应商托管 + BYOK（OpenAI/Anthropic/Google） | 文件/选中内容/屏幕上下文；无知识库 | Memory | 无可视化编排；快捷键/脚本/扩展 | 强：选中文本、窗口管理、剪贴板、Screen Awareness | 扩展商店（数千）、AI Extensions | 无 | Free；Pro+ $16/月（$192/年）；Teams $20/席；Max 价格待验证 | 安装即用，门槛低 | credits 消耗待关注；v2.0 起部分功能并入 Pro |
| **Obsidian + AI 插件** | 本地 Markdown 知识库 + 插件式 AI | 笔记本地离线；AI 需模型 | 插件 BYOK；可接本地模型 | 插件提供 Agent；vault RAG 待验证 | 以笔记为记忆；插件记忆待验证 | 无；依赖插件/脚本 | 本地文件；无系统控制 | 社区插件与主题生态 | 无（Sync 仅同步） | 应用免费（含商用）；Sync $4–8/月；Copilot Plus 价格待验证 | 装插件 + 配模型，门槛中 | Copilot 8.0k★；配置成本与插件质量参差（社区） |
| **Notion AI** | 团队知识库 + AI Agent | 云依赖 | Notion 选模型 + Select 指定模型 | 工作区搜索/Q&A、引用；大库性能待验证 | 工作区上下文；跨会话记忆待验证 | 数据库自动化 + Agents；无可视化编排 | 无系统级控制 | 集成、模板、MCP Server | 强：团队协作 + AI Agents（3.8） | Free；Plus $10；Business $20（含 AI）；企业定制；credits 另购 | 注册即用，门槛低；配 Agent 门槛中 | Business 门槛、credits 不可预测、大库性能（社区） |

> 星标来源：S3/S9/S13/S21/S22/S29/S32/S43（GitHub API，2026-11-23）。

## 3. 分层要点

### 3.1 本地 AI 客户端

- **离线是共同卖点而非差异**：Jan、LM Studio、AnythingLLM 主打本地，Cherry、Chatbox 为本地 + 云混合（S1、S10、S14、S18）。
- **集体转向 Agent**：Cherry 2.0（2026-08-05）有独立运行时、持久化执行状态与工具审批（S4）；LM Studio 推出 Bionic，支持 computer control（S14）。
- **知识库与 MCP 成标配**：Chatbox、AnythingLLM、Cherry 官方页均列知识库，四款支持 MCP（S1、S6、S18、S11、S16）；Jan/LM Studio 的内置 RAG 待验证。
- **风险集中在重写期**：Cherry 2.0 长会话卡顿（S5）、Chatbox 积分快速耗尽（S8）。

### 3.2 工作流 / 自动化

- **定位分叉**：n8n 是通用自动化（400+ 集成），Dify 是 LLM 应用开发，Coze 是 Agent 搭建与分发（S22、S27、S30）。
- **触发是硬指标**：Dify Cloud 按插件/定时/Webhook 触发计量（S26）；n8n 以 cron、Webhook、事件为核心（S22）；Coze 待验证。
- **许可与成本**：n8n 为 Sustainable Use（内部免费，禁止对外托管），Dify 为带多租户限制的开源许可；Dify 自托管约 15 个容器（S24、S26、S28）。
- **多智能体产品化**：Coze 3.0（2026-05-29）项目空间支持一人/多人 + 多 Agent 协作（S31）。

### 3.3 通用助手 / 桌面

- **都在做“能动手”**：ChatGPT 桌面合并 Chat/Work/Codex，授权访问本地文件与应用，Windows 有 Computer Use（S36）；Claude Cowork 直接访问本地文件（S34）。
- **记忆进订阅层**：Claude Free 即含跨会话记忆（S33）；Raycast 把 Memory、Screen Awareness 放进 Pro+（S38、S39）。
- **系统集成深度分化**：Raycast 强在选中文本、窗口、剪贴板（S39）；Claude/ChatGPT 强在文件与连接器，但受权限与云约束。
- **三款均云依赖、离线为零**，计费颗粒变细（credits、多档位）（S37、S40）。

### 3.4 知识与陪伴

- **Obsidian 提供数据主权，AI 靠插件**：应用免费含商用、笔记为本地 Markdown；Copilot 插件支持 Agent（vault RAG 待验证），8.0k★（S41、S42、S43）。
- **Notion 把 AI 绑进 Business 席位**：$20/席才解锁完整 AI，Custom Agents 消耗 credits（S44、S47）；官方 MCP 可让外部 Agent 读写（S45）。
- **陪伴维度缺位**：12 个对象无「长期关系」主张，角色化停留在预设/人格（S1、S10）。

## 4. 对 WorkBuddyForMe 的 5 条初步启示

1. **「本地优先」已是入场券而非护城河**：Jan、LM Studio、AnythingLLM、Cherry 都在讲本地/离线（S10、S14、S18、S1）。防守点应落在「本地把事做完」，而非「数据不出本机」。
2. **Agent 运行时是 2026 年共同攻坚点**：Cherry 2.0 做持久化状态与工具审批（S4），LM Studio 做 computer control（S14），ChatGPT 做 Work/Codex 与 Computer Use（S36），Claude 做 Cowork（S34）。与 v4.23「会扛事」同频，「可恢复、可审批、可审计」具备横向可比性。
3. **RAG 已商品化，分化点在引用可信度**：AnythingLLM、Dify、Chatbox、Notion 均提供知识库与引用（S18、S27、S7、S44）。下一层竞争是检索质量与引用可核验，而非「有没有知识库」。
4. **真正的桌面系统操作仍是空档**：本地客户端多停在 MCP 工具层（S11、S16），具备系统级能力的是 Raycast（无任务编排）与 Claude/ChatGPT（受权限约束、云依赖）。「本地 + 可编排 + 可审批操作本机」无明显占位者。
5. **用户对 credits 高度敏感**：Chatbox 出现 33 美元会员半小时耗尽投诉（S8）；Notion、Raycast 的 credits 也被反复提及（S47、S40）。明确「哪些能力不按次计费」可形成差异。

## 5. 来源清单

**本地 AI 客户端**

- S1 Cherry Studio 官网：https://www.cherry-ai.com/
- S2 Cherry Studio 企业版：https://www.cherry-ai.com/enterprise
- S3 Cherry Studio GitHub：https://github.com/CherryHQ/cherry-studio
- S4 Cherry Studio 2.0 评测（社区）：https://www.promptquorum.com/local-llms/cherry-studio-ai-desktop-client
- S5 Cherry Studio 2.0 长会话卡顿（社区）：https://toolnavs.com/article/2140-is-cherry-studio-worth-installing-real-costs-and-3-gotchas-of-the-52k-star-open
- S6 Chatbox 官网：https://chatboxai.app/en
- S7 Chatbox 定价：https://chatboxai.app/en/pricing
- S8 Chatbox 积分消耗报道（社区）：https://m.weibo.cn/detail/5368363967579074
- S9 Chatbox GitHub：https://github.com/chatboxai/chatbox
- S10 Jan 官网：https://jan.ai/
- S11 Jan MCP 文档：https://www.jan.ai/docs/desktop/mcp
- S12 Jan 本地 API Server：https://www.jan.ai/docs/desktop/api-server
- S13 Jan GitHub：https://github.com/menloresearch/jan
- S14 LM Studio 官网：https://lmstudio.ai/
- S15 LM Studio 定价：https://lmstudio.ai/pricing
- S16 LM Studio MCP：https://lmstudio.ai/docs/app/mcp
- S17 LM Studio 使用范围 FAQ：https://lms.dev/
- S18 AnythingLLM Desktop：https://anythingllm.com/desktop
- S19 AnythingLLM 定价：https://anythingllm.com/pricing
- S20 AnythingLLM 能力对照：https://anythingllm.com/alternatives/ollama
- S21 AnythingLLM GitHub：https://github.com/Mintplex-Labs/anything-llm

**工作流 / 自动化**

- S22 n8n GitHub：https://github.com/n8n-io/n8n
- S23 n8n 定价：https://n8n.io/pricing/
- S24 n8n Sustainable Use License：https://docs.n8n.io/sustainable-use-license/
- S25 n8n 社区许可 FAQ：https://docs.n8n.io/n8n-community-license/community-license/license-faq
- S26 Dify 定价：https://dify.ai/pricing
- S27 Dify 文档：https://docs.dify.ai/en/introduction
- S28 Dify 自托管容器数（社区）：https://syntheticbrew.ai/blog/dify-alternative-open-source-ai-agents/
- S29 Dify GitHub：https://github.com/langgenius/dify
- S30 扣子订阅套餐：https://docs.coze.cn/guides/edition
- S31 扣子 3.0 常见问题：https://docs.coze.cn/cozespace/coze_app_faq
- S32 coze-studio GitHub：https://github.com/coze-dev/coze-studio

**通用助手 / 桌面**

- S33 Claude 定价：https://www.anthropic.com/pricing
- S34 Claude Desktop 安装/Cowork：https://support.claude.com/en/articles/10065433-install-claude-desktop
- S35 ChatGPT 桌面版：https://openai.com/chatgpt/desktop/
- S36 ChatGPT 发布说明：https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- S37 OpenAI Business 定价：https://openai.com/zh-Hans-CN/business/pricing/
- S38 Raycast Pro：https://www.raycast.com/pro
- S39 Raycast 2.0 更新日志：https://www.raycast.com/changelog/macos/2
- S40 Raycast AI Credits：https://manual.raycast.com/ai/ai-credits

**知识与陪伴**

- S41 Obsidian 定价：https://obsidian.md/pricing.html
- S42 Obsidian 许可：https://obsidian.md/license
- S43 Copilot for Obsidian：https://github.com/logancyang/obsidian-copilot
- S44 Notion 定价：https://www.notion.com/pricing
- S45 Notion MCP：https://www.notion.com/zh-cn/help/notion-mcp
- S46 Notion 3.8 发布：https://www.notion.com/th/releases/2026-10-13
- S47 Notion AI 评测（社区）：https://aiunpacking.com/review/notion-ai/
