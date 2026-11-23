# v5.0 社区痛点挖掘：工作流 / 自动化 / Agent 平台

> 状态：🔬 调研稿（桌面研究，未上手实测）
> 查询日期：2026-11-23
> 样本：46 条，覆盖 8 个产品 + Claude Code 旁证
> 关联：`competitor-matrix.md`。本文只做痛点取证与聚类，不据此选定 v5.0 主题。

## 1. 调研方法与样本说明

- **范围**：n8n、Dify、Coze（扣子）、Zapier、Make；补充 Raycast、Claude Cowork、ChatGPT Agent / Computer Use，另用 Claude Code 事故作同类风险旁证。
- **来源**：GitHub issue、官方社区论坛、官方帮助/文档、Reddit 转引、G2/Capterra 转引、36氪/掘金、工程博客、产品 changelog。
- **口径**：官方文档视为“产品约束证据”；用户原帖视为“主观痛点”；第三方评测只作补充并标“二手”。日期优先取原帖发布时间，文档取访问日。
- **频次口径**：用“证据条数 + 涉及产品数”近似，不等同于用户总体比例；单一用户未复现的条目标为“待验证”。
- **局限**：Reddit 站内检索受限，未能系统抽样；小红书/B站/知乎未取得可稳定引用的一手帖，相关判断主要来自掘金、36氪与社区原帖。

| 来源类型 | 条数 | 说明 |
|---|---:|---|
| 官方文档/帮助/公告/changelog | 10 | 可复核的产品行为或定价规则 |
| 官方社区/论坛原帖 | 16 | 用户自述，含少量单一案例 |
| GitHub issue | 1 | 可复现缺陷 |
| 第三方评测/媒体/漏洞库 | 19 | 含 G2、Reddit 转引，标注二手 |

**置信度**：A（官方/可复核原帖，含多回复佐证）25 条；B（单一用户、未复现）2 条；C（二手转引/待验证）19 条。严重度按“数据丢失、生产中断、资金风险、不可恢复”为高；“明显耗时/需绕过”为中。

## 2. 痛点总表

| 编号 | 产品 | 痛点（一句话） | 类别 | 严重度 | 证据/来源 URL | 日期 |
|---|---|---|---|---|---|---|
| P01 | n8n | 社区版跑市场模板约 30% 中断，几乎看不到真实错误，用户称疑似需付费层级 | 调试与可观测 | 高 | [n8n#81781](https://community.n8n.io/t/n8n-first-impressions/81781) | 2025-02-25 |
| P02 | n8n | 生产级流程无法单测/集成测试，改一个字段就全断且无恢复 | 失败重试/恢复 | 高 | [n8n#270192](https://community.n8n.io/t/is-it-actually-possible-to-build-production-grade-automations/270192) | 2026-02-25 |
| P03 | n8n | 跨 PostgreSQL+API 部分成功、部分失败，整段重跑会产生重复副作用 | 失败重试/恢复 | 高 | [n8n#313213](https://community.n8n.io/t/partial-failures-between-n8n-and-postgresql/313213) | 2026-09-13 |
| P04 | n8n | 崩溃后滞留记录不会被 Retry 捡起，执行列表仍显示绿色成功 | 失败重试/恢复 | 高 | [n8n#313213](https://community.n8n.io/t/partial-failures-between-n8n-and-postgresql/313213) | 2026-09-13 |
| P05 | n8n | AI Agent 幻觉参数直接打生产 API，流程里没有审批闸门 | 权限与审批 | 高 | [n8n#311957](https://community.n8n.io/t/how-do-you-handle-human-approvals-for-ai-agent-workflows-in-n8n/311957) | 2026-09-08 |
| P06 | n8n | 用 Wait+Webhook 拼审批：无审计、条件规则复制到每个流程、审批人还不是 n8n 用户 | 权限与审批 | 高 | [n8n#311957](https://community.n8n.io/t/how-do-you-handle-human-approvals-for-ai-agent-workflows-in-n8n/311957) | 2026-09-08 |
| P07 | n8n | 已认证用户可借 Execute Command 执行宿主任意命令（CVE-2025-71380） | 本地执行安全 | 高 | [SentinelOne](https://www.sentinelone.com/vulnerability-database/cve-2025-71380/) | 2026-07-09 |
| P08 | n8n | Telegram Trigger 的 webhook 激活约 15 秒后被静默清空，零执行且无错误 | 触发器可靠性 | 高 | [n8n#299865](https://community.n8n.io/t/telegram-trigger-published-webhook-confirmed-by-telegram-but-zero-executions-logged-cloud/299865) | 2026-06-17 |
| P09 | n8n | 升级稳定版后工作流只跑前 2 个节点，却显示“执行成功” | 版本升级破坏 | 高 | [n8n#113834](https://community.n8n.io/t/cannot-activate-workflow-after-upgrading-n8n-version/113834) | 2025-05-19 |
| P10 | n8n | 1 万–1.5 万条批处理触发 OOM，执行界面不显示错误，流程静默中断 | 调试与可观测 | 高 | [n8n#278455](https://community.n8n.io/t/out-of-memory-error-while-processing-10k-15k-items-in-batches-no-error-shown-in-execution-self-hosted-docker-v1-123-4/278455) | 2026-03-18 |
| P11 | n8n | 自托管新增 €667/月 Business 档，原免费能力被分层，社区反弹 | 定价/额度 | 中 | [OpenHosst](https://openhosst.com/blog/n8n-self-hosted-pricing)、[n8n 公告](https://community.n8n.io/t/new-plan-no-active-workflow-limits-introducing-n8n-new-pricing/163840) | 2025-08-07 / 2026-06-05 |
| P12 | n8n | 非开发者学习曲线陡：3 小时才映射一个变量（G2 转引） | 文档与学习曲线 | 高 | [Teardown](https://assets.nextleap.app/submissions/n8n-Product-Teardown-3a029c29-99c5-4696-a4c6-c72cda3707ef.pdf) | 2026（二手） |
| P13 | Dify | LLM 429 后工作流卡在 running，错误不向调用方传播 | 调试与可观测 | 高 | [Perun](https://perun.au/insights/dify-production) | 2026-07-29 |
| P14 | Dify | 代码沙箱内存超限终止长任务，工作流无法恢复 | 失败重试/恢复 | 高 | [Perun](https://perun.au/insights/dify-production) | 2026-07-29 |
| P15 | Dify | 多租户共享缓存导致会话上下文串用户 | 本地执行安全 | 高 | [Perun](https://perun.au/insights/dify-production) | 2026-07-29 |
| P16 | Dify | 1.11.4 升级遇 PostgreSQL 18 迁移冲突，worker 缺表无法启动 | 版本升级破坏 | 高 | [Dify#996](https://forum.dify.ai/t/dify-1-11-4-worker-poll-workflow-schedules-postgresql/996) | 2026-02-05 |
| P17 | Dify | Loop 变量 value 缺失，已发布工作流运行即失败，重存也不修复 | 版本升级破坏 | 高 | [Dify#46550](https://github.com/langgenius/dify/issues/46550) | 2026（1.17–1.19） |
| P18 | Dify | 自托管需 6–8 个容器；有用户称 Docker 配置在特定 VPS 上是噩梦 | 部署/配置成本 | 高 | [Tooliverse](https://www.tooliverse.ai/tools/dify)、[SaaSCompared](https://saascompared.com/product/dify) | 2026-09-30 |
| P19 | Dify | 逻辑节点/变量学习曲线陡（32 条评论提及） | 文档与学习曲线 | 高 | [Tooliverse](https://www.tooliverse.ai/tools/dify) | 2026-09-30 |
| P20 | Dify | Source-available 非完全开源，版本间 breaking changes 需谨慎锁版本 | 供应商锁定 | 中 | [SaaSCompared](https://saascompared.com/product/dify) | 2026-05 |
| P21 | Coze | 嵌套工作流版本号冲突：子流程升级后父流程只改部分节点即报错 | 版本升级破坏 | 高 | [Coze FAQ](https://docs.coze.cn/guides/workflow_faq) | 官方文档（访问 2026-11-23） |
| P22 | Coze | 节点命中敏感词被拦截，只提示“不合法内容”，需逐节点试运行定位 | 调试与可观测 | 中 | [Coze FAQ](https://docs.coze.cn/guides/workflow_faq) | 官方文档（访问 2026-11-23） |
| P23 | Coze | 同步工作流默认 10 分钟超时，复杂流程直接失败 | 长任务超时 | 高 | [Coze FAQ](https://docs.coze.cn/guides/workflow_faq) | 官方文档（访问 2026-11-23） |
| P24 | Coze | 积分耗尽即停服，运营站点瞬间不可访问 | 定价/额度 | 高 | [掘金实测](https://juejin.cn/post/7595615310179844150) | 2026-01-16 |
| P25 | Coze | 视频生成 1 小时消耗近 6 万积分，账单只有积分数字、说不清花在哪 | 定价/额度 | 高 | [36氪](https://36kr.com/p/4046889002826243) | 2026-10-29 |
| P26 | Coze | AI 生成工作流对需求描述极苛刻，复杂场景反复返工/回滚 | 文档与学习曲线 | 中 | [掘金实测](https://juejin.cn/post/7595615310179844150) | 2026-01-16 |
| P27 | Zapier | Zap 静默停跑：auth 过期/源应用变更，无历史记录，客户先发现 | 触发器可靠性 | 高 | [Zapier#53782](https://community.zapier.com/how-do-i-3/how-do-you-catch-a-zap-that-silently-stopped-53782) | 2026-09-06 |
| P28 | Zapier | 轮询分页导致漏跑，部分记录永远不触发 | 触发器可靠性 | 高 | [Zapier Help](https://help.zapier.com/hc/en-us/articles/30577165587213-Zap-is-triggering-but-missed-some-runs) | 官方文档（访问 2026-11-23） |
| P29 | Zapier | 达到任务上限后 Zaps 暂停到下一周期或升级 | 定价/额度 | 中 | [CreativeAdvisor](https://www.creativeadvisor.com/blog/automation/zapier-review) | 2025 |
| P30 | Zapier | 超额任务按 1.25x 计费，Zaps 不停但账单上升 | 定价/额度 | 中 | [Zapier 社区](https://community.zapier.com/how-do-i-3/using-tasks-above-my-plan-s-limit-50098) | 待验证 |
| P31 | Zapier | 工作流专有格式不可导出，180+ Zaps 迁移预计 6 个月 | 供应商锁定 | 高 | [Toolstac](https://toolstac.com/review/zapier/enterprise-review) | 2026（二手） |
| P32 | Make | credits 动态计价，AI/iterator 多倍消耗，小创作者预算失控 | 定价/额度 | 高 | [Make#90182](https://community.make.com/t/credit-based-billing-a-jab-to-non-enterprise-creators/90182) | 2025-08-22 |
| P33 | Make | 1 分钟轮询触发器月耗约 43,200 credits，10k 额度 6 小时耗尽 | 定价/额度 | 高 | [RapidDev](https://www.rapidevelopers.com/review/make-ex-integromat) | 2026（二手） |
| P34 | Make | 场景出错默认停，需逐模块手加 error handler 才有重试/通知 | 失败重试/恢复 | 高 | [Make#114297](https://community.make.com/t/how-can-i-handle-errors-when-a-make-scenario-fails/114297) | 2026-09-02 |
| P35 | Make | 连续 3 次错误自动禁用场景，形成静默停摆 | 触发器可靠性 | 高 | [Make Help](https://www.make.com/en/help/errors/how-to-handle-errors-in-make/overview-of-error-handling-in-make) | 官方文档（访问 2026-11-23） |
| P36 | Claude Code | Claude Code 103 秒删除 4.8 万个真实文件，.git 一并丢失，“只改副本”提示词未拦住 | 本地执行安全 | 高 | [36氪](https://36kr.com/p/4002749483765638) | 2026-09-28 |
| P37 | Claude 桌面 | 删除保护依赖显式 Allow；同类事故显示路径别名/批量删除会让“只改副本”的提示失效 | 权限与审批 | 高 | [Claude 安全说明](https://support.claude.com/en/articles/13364135-use-claude-cowork-safely)、[36氪](https://36kr.com/p/4002749483765638) | 官方文档（访问 2026-11-23）/ 2026-09-28 |
| P38 | Cowork | Cowork 仍是 feature preview：无跨会话记忆、无 Projects、仅桌面 | 长任务/上下文 | 中 | [Claude 帮助](https://support.claude.com/en/articles/13345190-get-started-with-claude-cowork) | 官方文档（访问 2026-11-23） |
| P39 | Cowork | 上下文滑窗导致忘指令、改回已修代码、编造文件路径 | 长任务/上下文 | 高 | [CoworkHow](https://coworkhow.com/errors/context) | 2026-08-12 |
| P40 | ChatGPT | Agent 复杂任务 10–30 分钟，CAPTCHA/复杂登录失败需人接管 | 长任务/上下文 | 高 | [AI Tool Analysis](https://aitoolanalysis.com/chatgpt-agent-mode-review/) | 2026-01-08 |
| P41 | ChatGPT | Agent Plus 每月仅 40 条，评测称 73% 用户首周耗尽 | 定价/额度 | 高 | [AI Tool Analysis](https://aitoolanalysis.com/chatgpt-agent-mode-review/) | 2026-01-08 |
| P42 | ChatGPT | Computer Use 接管整台电脑，期间无法多任务 | 本地执行安全 | 高 | [OpenAI 社区](https://community.openai.com/t/browser-access-works-in-regular-chatgpt-chat-but-fails-in-chatgpt-work/1410147) | 2026-10-27 |
| P43 | ChatGPT | Work 模式浏览器扩展失效，34 人同报，用户称三个项目被阻塞 | 触发器可靠性 | 高 | [OpenAI 社区](https://community.openai.com/t/browser-access-works-in-regular-chatgpt-chat-but-fails-in-chatgpt-work/1410147) | 2026-10-27 |
| P44 | ChatGPT | Prompt injection 可诱导 Agent 执行未授权操作/外泄个人数据 | 本地执行安全 | 高 | [OpenAI](https://openai.com/index/prompt-injections/)、[arXiv](https://arxiv.org/pdf/2406.00199) | 2024/官方 |
| P45 | Raycast | AI 改为 credits；BYOK、自定义供应商、本地模型需付费 Pro | 定价/额度 | 中 | [Raycast 博客](https://www.raycast.com/blog/changing-how-raycast-ai-is-priced) | 2026-09-10 |
| P46 | Raycast | Windows 版仍频繁修启动崩溃、热键失效 | 稳定性/成熟度 | 中 | [Raycast v0.53](https://www.raycast.com/changelog/windows/3) | 2026-04-10 |

## 3. 聚类主题（11 个）

**T1 半途失败且无断点**（5 条｜n8n、Dify、Make｜频次中高｜严重度高）
定义：跨步骤、跨系统执行到一半失败，只能整段重跑，缺幂等、检查点、死信与补偿。为什么重要：这类失败直接造成重复写入、数据不一致，用户最终退回人工核对。原声：“Retry logic and failure recovery are a joke.”（n8n，2026-02-25）

**T2 错误被吞、日志不可见**（4 条｜n8n、Dify、Coze｜频次中｜严重度高）
定义：失败没有可读原因，或只存在于容器/外层日志，工作流 UI 甚至显示成功。为什么重要：排障从“看错误”变成“猜错误”，直接拉高学习成本。原声：“little to no visibility to what the actual error is/was”（n8n，2025-02-25）

**T3 触发器静默失效**（4 条｜n8n、Zapier、Make｜频次中｜严重度高）
定义：webhook 被注销、轮询漏事件、连续失败被自动禁用，且没有心跳或缺口告警。为什么重要：自动化“看起来在跑”，实际已停，往往由客户或对账发现。原声：“Updates then drop silently.”（n8n，2026-06-17）

**T4 审批与高风险动作缺少统一治理**（3 条｜n8n、Claude 桌面｜频次中｜严重度高）
定义：审批靠 Wait/Webhook 或删除提示框拼装，缺统一策略、审计与非技术审批人入口。为什么重要：高风险动作没有可解释的“谁批准了什么”。原声：“There’s no real audit trail once the execution finishes.”（n8n，2026-09-08）

**T5 执行边界与隔离不足**（5 条｜n8n、Dify、Claude Code、ChatGPT｜频次中高｜严重度高）
定义：权限靠自然语言约束，租户/会话隔离也可能失效；路径别名、批量删除、整机接管会让“别动原件”失效。为什么重要：Agent 连续执行几十步，前 99 步正确不代表第 100 步安全。原声：“提示词只能告诉 AI『别做什么』，真正的安全边界必须写进权限和系统里。”（36氪，2026-09-28）

**T6 配置、学习曲线与文档**（4 条｜n8n、Dify、Coze｜频次中｜严重度中高）
定义：JSON、变量、容器、子流程把非开发者挡在门外，文档又落后功能发布。为什么重要：首启成本高会直接把“想自动化”的人劝退。原声：“I spent 3 hours trying to map a simple variable because I don’t know JSON.”（G2 转引，2026）

**T7 升级即破坏**（4 条｜n8n、Dify、Coze｜频次中｜严重度高）
定义：breaking change、数据库迁移失败、已发布快照失效，升级前无法评估影响面。为什么重要：生产流程在“没改业务”的情况下被打断。原声：“the workflow keeps failing until the variable’s value is re-entered manually.”（Dify #46550）

**T8 费用不可控**（9 条｜n8n、Coze、Zapier、Make、ChatGPT、Raycast｜频次高｜严重度高）
定义：credits 动态计价、轮询放大、超额停服/暂停，账单与任务步骤不透明。为什么重要：费用从“可预算”变成“不可预测”，小团队直接停用。原声：“就生成了三四段十几秒的视频……就花掉近 6 万积分。”（36氪，2026-10-29）

**T9 供应商锁定**（2 条｜Dify、Zapier｜频次低｜严重度高）
定义：工作流专有格式不可导出，source-available/云绑定抬高迁移成本。为什么重要：锁定让“换工具”从一周变成半年，反向削弱议价能力。原声：“Migration would take 6+ months.”（Toolstac，2026）

**T10 长任务超时与上下文丢失**（3 条｜Coze、Cowork、ChatGPT｜频次中｜严重度高）
定义：10 分钟、1200 秒、上下文滑窗把长任务截断，恢复点又不清晰。为什么重要：越接近真实工作，任务越长，截断成本越高。原声：“Claude forgets earlier instructions, reverts fixed code, or invents file paths.”（CoworkHow，2026-08-12）

**T11 桌面/Agent 仍是半成品**（3 条｜Cowork、ChatGPT、Raycast｜频次中｜严重度中）
定义：预览限制、扩展失效、平台崩溃，让“操作本机”的可用性不稳定。为什么重要：桌面自动化一旦不稳定，用户会退回手工，信任很难恢复。原声：“Fixed a rare issue where Raycast crashes on startup.”（Raycast changelog，2026-04-10）

## 4. 对 WorkBuddyForMe 的 5 条启示（事实层）

1. **失败恢复是跨产品共性，不是 n8n 单点**：46 条中 5 条直接指向“无断点/无幂等/整段重跑”，另有 4 条指向“错误不可见”。WorkBuddyForMe 已有持久化执行，需核实崩溃后的检查点、幂等键、死信与对账是否对用户可见。
2. **审批的产品化程度低**：n8n 用户自建审批面板并抱怨无审计，Cowork 用“删除前 Allow”做保护。事实是“统一策略 + 审计 + 非工作流用户可审批”没有被一体化提供。
3. **本地执行安全的边界不在模型**：Claude 误删 4.8 万文件、n8n Execute Command CVE 都说明自然语言约束不足；可验证的方向是 OS 级目录白名单、危险动作二次确认、可回滚快照与故障域隔离。
4. **费用可预期性是采用门槛**：Make/Zapier/Coze/Raycast 的 credits 变更都引发不满，“积分耗尽即停服/暂停”直接造成业务中断；本地优先 + 自带 Key 的计费边界可以被明确表达。
5. **触发器需要心跳与对账**：n8n webhook 静默清空、Zapier 静默停跑都缺 missed-run 检测；本地触发器可做自检、缺口告警与补跑，而不只依赖源站 webhook。

## 5. 证据强度备注

证据最弱的三个类别：**供应商锁定**（仅 2 条，且均来自二手评测）、**稳定性/成熟度**（仅 3 条，主要是 changelog 修复记录）、**文档与学习曲线**（4 条，其中 1 条为 G2 二手转引）。这三类宜在下一轮用一手访谈或上手任务补证。
