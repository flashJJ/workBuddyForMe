---
title: "技能包体系：skill.json 声明式定义、文件夹即插即用、删除只删引用"
series: "WorkBuddy For Me v0.6 技术拆解"
number: "B06"
tags: ["workbuddy", "skills", "manifest", "zod", "plugin-system"]
date: "2025-Q4"
---

## 问题：流程性知识需要一个承载物

v0.5 的记忆系统记住了「用户是谁、偏好什么」，但有一类知识它装不下：**「怎么干某类活」的流程**。比如「写周报」——先拉本周 git 提交，再按项目分组，再提炼成三段式，最后输出 markdown。这是程序性知识，v0.5 复盘时明确登记「归 v0.6 技能系统」。

M3 的技能包体系回答这个问题。形态决策先行：**技能 = 文件夹 + skill.json manifest**，声明式、可检视、可手改。不做市场、不做远程分发（Non-Goals），先把本地文件夹形态做扎实。

---

## manifest：技能的契约

skill.json 的 zod schema（shared 包，前后端共用校验）：

```jsonc
{
  "name": "weekly-report",
  "description": "周报生成：拉 git 提交按项目分组提炼",
  "version": "0.1.0",
  "permissions": ["read"],                 // 权限摘要：所需最高级别
  "promptTemplates": [                      // 提示词技能：注入 system 的流程性知识
    { "id": "main", "content": "你是周报助手。流程：1. ..." }
  ],
  "allowedTools": ["knowledge_search"],     // 预绑定工具白名单
  "examples": ["帮我写本周周报"]             // 示例，面板展示
}
```

两类技能形态（本期）：**提示词技能**（promptTemplates 注入 system，承载流程性知识）和**工具组合技能**（allowedTools 预绑定 + 推荐参数）。manifest 里的 permissions 是「此技能需要的最高权限级」摘要——面板展示「需要 write 权限」，让用户在启用前就有预期。

**加载失败必须给具体原因，不静默**：JSON 解析失败、schema 校验失败（哪个字段、为什么）、name 冲突——每种失败都在面板显示该技能的错误状态与原因。技能文件夹是用户手改的东西，手改就会改错，「改了没反应」是最差的体验。

---

## 加载与装配：reconcile 模式复用

[loader.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/skills/loader.ts) 扫 `<dataDir>/skills/` 目录，逐文件夹读 manifest、校验、登记；[skill-service.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/skills/skill-service.ts) 管启停状态（落库 skills_state 表，文件夹内容与启用状态分离——**文件夹是内容，状态行是开关**）。

启动时 reconcile（和 MCP registry 同一个模式）：磁盘上有的技能登记进表、状态行保留、磁盘上消失的标 missing。**配置是真相源，状态是影子**——v0.6 的通用数据流。

装配进对话在 [skill-assembly.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/skills/skill-assembly.ts)：启用技能的 promptTemplates 拼进 system 的技能区块（走 v0.5 的预算预留席位，不挤压历史），allowedTools 与助手自身 enabledTools 取**并集**——技能给助手「加能力」，不是「换能力」。并集语义下，停用技能 = 撤出它贡献的部分，助手原有配置不受影响。

---

## 内置技能：三个示例即模板

[builtin-skills.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/skills/builtin-skills.ts) 随包分发三个内置技能，它们同时是「功能」和「模板」：

1. **weekly-report（周报生成）**：提示词技能示范——流程性知识怎么写成 promptTemplates；
2. **meeting-notes（会议纪要整理）**：同样是提示词技能，覆盖另一高频场景；
3. **file-search（文件搜索）**：工具组合技能示范——引导用户配置 filesystem MCP server，allowedTools 预绑定 `mcp:filesystem:*`。

file-search 的「引导」性质值得说：它依赖的 MCP server 需要用户自己配，技能卡片上会显示「需要先添加 filesystem MCP 服务器」——技能与其依赖的关系显式可见，不假设环境。

内置技能重启后自动重新登记为启用（reconcile 语义），开发期验证过 dev server 重启场景。

---

## 删除只删引用，备份只备状态

**删除语义**：面板上删除技能，删的是 skills_state 状态行（引用），**磁盘上的 skills/ 源文件夹保留**。理由：技能文件夹可能是用户从别处拷贝来、还会拷到别处的资产；UI 删除是「我不想用了」，不是「帮我毁尸灭迹」。要删文件，去文件管理器删——内容的所有权在文件系统，应用只管登记。

**备份轨**：v0.4 的四轨备份加第五条 skills 轨——导出各文件夹 skill.json 原文 + skills_state 状态行；恢复时按 name upsert 状态行，**文件夹仅在不存在时落盘**（不覆盖用户可能改过的现有文件夹）。备份的语义同样是「登记信息 + 状态」，内容资产尊重本地现状。

[backupPanel](file:///e:/code/traeWork/workBuddyForMe/apps/web/src/features/settings/backup-panel.tsx) 加「技能包」轨道（默认勾选），恢复 toast 展示技能计数。

---

## 面板测试的一个坑：mockResolvedValue 复用 Response

M3 收尾时修过一个测试 bug，值得记录：技能面板测试里，PATCH 启停后触发 refetch，但 mock 用 `mockResolvedValue(sameResponse)`——**Response 实例的 body 只能消费一次**，第一次渲染读完后，refetch 读到的是已消费的 body，测试挂得莫名其妙。

修复：`mockImplementation(() => new Response(...))` 每次构造新实例 + 闭包状态模拟启停流转（停用 → GET 返回 enabled:false → 启用 → 返回 true）。

这个坑的普遍性在于：**fetch 的 Response 是有状态的流对象**，而 mock 库里「返回同一个对象」是最顺手的写法。凡是测试里要多次 fetch 的场景，mock 必须每次构造新 Response。教训已沉淀进面板测试的公共模式。

---

## 小结

技能包的设计哲学是**文件夹即真相、状态行即开关、删除即解引**。manifest 的 zod 契约、加载失败的显式错误、并集语义的装配——都在贯彻「技能是用户的资产，应用是资产的管理者而非所有者」。

至此 v0.6 的三大主线（MCP/权限/技能）讲完。下一篇 B07 进入 M4 运维面：工具熔断器——连续失败 3 次跳闸、5 分钟半开试探的状态机。
