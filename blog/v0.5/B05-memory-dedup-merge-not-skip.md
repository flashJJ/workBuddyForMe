---
title: "记忆去重：L2 ≤ 0.35 的几何语义、合并而非跳过、importance 取大不取新"
series: "WorkBuddy For Me v0.5 技术拆解"
number: "B05"
tags: ["workbuddy", "memory", "dedup", "embedding", "sqlite-vec"]
date: "2025-Q4"
---

## 问题：同一件事，用户会说一百遍

记忆提取跑起来之后，第一个暴露的问题不是漏记，是**重复记**：

```text
第 3 轮：  「我不吃香菜」          → 入库：用户不吃香菜（importance 0.7）
第 18 轮： 「点餐不要放香菜」      → 又入库：点餐时不要香菜（importance 0.6）
第 45 轮： 「我对香菜过敏那种不吃」 → 再入库：用户对香菜过敏（importance 0.8）
```

三条记忆，语义上是同一件事。后果不只是浪费存储——召回时 Top-3 可能被同一事实的三个变体占满，把其他真正不同的记忆挤出注入位（Top-3 是硬上限，见 B07）。**没有去重的记忆库会随使用膨胀成复读机**。

去重方案在 [memory-service.ts](file:///e:/code/traeWork/workBuddyForMe/packages/core/src/memory/memory-service.ts) 的 `persistOne`：写入前查最近邻，L2 距离 ≤ 0.35（`MEMORY_DUPLICATE_MAX_DISTANCE`）视为同一记忆，执行合并而非新建。这篇讲三个决策：0.35 的几何语义、为什么合并而不跳过、合并时各字段的取舍规则。

---

## 0.35 是什么：归一化向量下的 L2 ≈ 余弦换算

先建立坐标系。所有向量入库前经过 L2 归一化（[vector.ts](file:///e:/code/traeWork/workBuddyForMe/packages/database/src/vector.ts) 的 `normalizeVector`），单位向量有个漂亮的性质：

```text
L2² = ‖a − b‖² = ‖a‖² + ‖b‖² − 2·a·b = 2 − 2·cos(θ)
```

即 L2 距离与余弦相似度一一对应：

| L2 距离 | 余弦相似度 | 语义 |
|---|---|---|
| 0.35 | ≈ 0.94 | 几乎同一事实的不同表述 |
| 0.78 | ≈ 0.70 | 强相关 |
| 1.05 | ≈ 0.45 | 弱相关（v0.5 的召回阈值，见 B07） |
| 1.41 | 0 | 无关 |

0.35（cos 0.94）是一个**非常严格**的阈值：只有「同一事实的改写」才进得来。「我不吃香菜」和「点餐不要香菜」的嵌入距离实测约 0.2-0.3，合并；「我不吃香菜」和「我不吃辣」距离约 0.6-0.8，各自独立——这正是想要的边界：偏好同类但对象不同，必须分开记。

为什么用距离阈值而不是「完全相同才合并」？嵌入空间的魅力就在于语义近邻：完全相同的文本重复入库的概率本来就低（提取 prompt 每轮面对的对话不同），真正的重复都是**改写**。阈值去重正是为了抓住这些改写。

---

## 为什么是合并，而不是跳过或新建

命中近邻时有三个选项：

**选项 A：跳过**（已存在就不写）。被否掉——信息的时效性丢了。「我对香菜过敏那种不吃」（importance 0.8）比「我不吃香菜」（0.7）信息量更大：过敏反应是更强的约束，对未来「推荐餐厅」类问题的行为影响不同。跳过意味着最新、最强的表述永远无法更新旧记忆。

**选项 C：新建**（不管近邻）。被否掉——就是开头的复读机问题。

**选项 B：合并**——v0.5 的选择。`persistOne` 的合并规则：

```typescript
if (hit && hit.distance <= MEMORY_DUPLICATE_MAX_DISTANCE) {
  const existing = repo.findById(String(hit.memoryId));
  if (existing) {
    const memory = repo.update(String(hit.memoryId), {
      content: candidate.content,                                  // 内容更新为最新表述
      importance: Math.max(existing.importance, candidate.importance), // 重要性取大
    })!;
    if (vector) upsertMemoryVector(db, { id: nearestId, vector }); // 向量跟随新内容
    return { memory, merged: true };
  }
}
```

三个字段三条规则，各有讲究：

**content 取新**：最新表述通常信息更完整（用户补充了细节）。「我不吃香菜」→「我对香菜过敏那种不吃」，后者理应成为对外呈现的版本。

**importance 取大不取新**：重要性是「这条记忆值不值得长期保留」的评分，历史最高分代表它曾经被认为很重要。取大是单调不减——一条记忆不会因为后来被轻描淡写地重述就贬值。这个字段是遗忘策略的输入（<0.4 进归档候选），单调性保证「曾经重要」的记忆不会被意外遗忘。

**向量跟随新内容**：content 更新了，嵌入必须同步重算，否则向量指向旧语义，召回时会按旧表述匹配。这里复用写入路径的同一个 vector，零额外嵌入调用。

还有一个隐形的合并收益：**`source_conversation_id` 保持不变**。记忆的来源锚定在首次提取的会话，追溯时能定位到「这条记忆最初从哪来」。

---

## 事务边界：嵌入在事务外，写入在事务内

`rememberCandidates` 的结构值得一看：

```typescript
const embedded = await embedTexts(deps, texts, options.signal);  // 网络调用，事务外
const tx = deps.db.transaction((index: number) => {
  const candidate = candidates[index]!;
  const vector = embedded?.vectors[index] ?? null;
  const { memory, merged } = persistOne(deps.db, candidate, vector, ...);
  ...
});
candidates.forEach((_, index) => tx(index));
```

**嵌入（网络调用）在事务外，数据库写入在事务内**。这是 better-sqlite3 事务的铁律：事务内做同步 IO 是找死（事务期间数据库被独占，网络抖动会让锁持有时间失控）。先把整批候选一次性嵌入（一次 HTTP 调用，比分条调用省 4 倍往返），再进事务逐条 persistOne。

每条的「查近邻 → 决定合并/新建 → 写主表 → 写向量表」在同一个事务里，保证主表和 memories_vec 永远一致——不会出现「主表有记忆、向量表没向量」的半状态（那种记忆会永久失去召回能力，成为幽灵数据）。

**无嵌入模型时的降级**：`embedTexts` 返回 null（未配置嵌入模型），persistOne 的 `vector` 为 null——跳过去重直接新建。这是刻意的取舍：没有去重的记忆会膨胀，但「记了但可能重复」好过「因为没嵌入模型就不记」。手工创建的记忆（M4 面板）同理。语义召回本来就依赖嵌入，没配嵌入模型的记忆库本来也只能当列表用。

---

## 和摘要记忆的联动

B03 提到压缩摘要会作为情景记忆入库（importance 0.6 event）。它走的正是同一个 `rememberOne` → `persistOne` 管线——**递归压缩产生的摘要记忆天然被去重管线收敛**：

```text
第 20 轮压缩 → 摘要记忆 A：「早期对话摘要：用户是 Java 后端……」
第 40 轮压缩 → 新摘要与 A 距离 0.28 → 合并：内容更新为最新摘要，importance 保持 0.6
```

如果摘要记忆不去重，一个 200 轮的长对话会积累 10 条「早期对话摘要」，召回位被它们霸屏。合并语义让摘要记忆随压缩增量演进——和摘要本身的增量合并（B03）在不同层面上同构。

---

## 小结

去重是记忆库能「收敛而不膨胀」的关键机制。0.35 的阈值来自归一化向量的 L2-余弦换算（cos 0.94 = 同一事实的改写），合并规则的三个字段各有语义（内容取新、重要性取大、来源不变），事务边界守住主表与向量表的一致性。

写入侧收敛了，读取侧的另一个问题是：召回时多近才算「相关」？0.35 是去重阈值，那召回阈值该是多少——直觉说应该更严格，实测给出了完全相反的答案。下一篇 B07 会讲这个 0.78 → 1.05 的校准故事，但在那之前，B06 先讲承载这一切的存储底座：为什么记忆要有独立的 memories_vec 向量管线，而不是复用知识库的 chunks_vec。
