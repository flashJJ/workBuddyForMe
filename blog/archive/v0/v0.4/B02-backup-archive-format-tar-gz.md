# 备份归档格式：为什么选 tar.gz 不选 zip，四轨 JSON 与 manifest 版本探测

做备份功能，最容易一上来就写代码：遍历数据库表、序列化成 JSON、打个压缩包、完事。但我们的桌面 AI 应用（本地优先，会话、知识库、设置都在本机一个 SQLite 里）的归档格式是整个备份体系的**契约层**——它一旦随第一个支持备份的版本发出去，未来所有版本都要能读它。格式设计错了，后面每加一个字段都是一次兼容性事故。

这篇讲三个设计决策：为什么容器选 tar.gz 而不是 zip；为什么数据拆成四条轨道而不是一个大 JSON；以及 manifest 的版本探测机制怎么给未来的自己留路。

## 决策一：tar.gz 而不是 zip

先看归档里要装什么：

```text
xxx.my-ai-backup
├── manifest.json        # 备份 schema 版本、源应用版本、创建时间、各轨条目数
├── conversations.json   # 会话 + 消息（content_parts/tool_trace 原样 JSON）
├── knowledge.json       # 知识库 + 文档元数据 + 分片原文
├── settings.json        # 设置（密钥字段脱敏，不备份密文）
└── attachments/         # 可选轨道，附件二进制按 sha256 文件名存放
```

zip 和 tar.gz 都能装这个目录树，也都跨平台可读。选 tar.gz 的理由有三个，按重要性排：

**1. 流式写入**。Node 原生 `zlib.createGzip()` 串一个 tar pack 流，可以边从数据库读、边往归档里写，全程不需要把几百 MB 的附件先缓存在内存里。zip 的中央目录在文件尾部，天然要求「先写完所有条目、再回头写索引」，流式化要么靠第三方库的变通实现，要么落两次盘。备份是低频大体积操作，内存峰值必须可控。

**2. 零依赖**。tar + gzip 用 Node 标准库就能拼出来（自己写 tar header 也就百来行，本质是 512 字节定长块）。zip 则要引入 archiver/jszip 这类依赖——对一个「本地优先、依赖越少越好」的项目，能不进 lockfile 就不进。

**3. 后缀即提示**。我们用了自定义后缀 `.my-ai-backup`，但它就是 tar.gz——高级用户 `tar -tzf` 一眼能看内容，`tar -xzf` 能解开单轨文件做手工恢复。**格式的可检视性本身就是一种可恢复性**。zip 当然也能解，但「这是一个 tar.gz」比「这是一个我们自己定义的二进制容器」给用户的信任感完全不同。

zip 唯一的优势是 Windows 资源管理器双击能直接浏览。这个损失可接受：备份文件的正常消费路径是应用内的恢复流程，不是资源管理器。

### 踩坑记录：tar 的 pipe 顺序

备份模块联调时真踩了一个：tar pack 流和 gzip 流的 pipe 顺序写反了（`pack.pipe(gzip)` 写成了 `gzip.pipe(pack)`），产出的归档前几个条目正常、后面的全乱。单测没抓到是因为初版测试只验「能解压出 manifest」，没验全条目 round-trip。修复时补了真正的解压还原断言：导出 → 解压 → 逐条目比对 JSON 内容。**归档格式的测试必须做完整 round-trip，只验头部等于没测。**

## 决策二：四条轨道，而不是一个大 JSON

最初的设计草稿就是一个 `backup.json` 装所有东西。评审时被一个问题否掉了：**用户想只恢复设置、不动会话，怎么办？**

一个大 JSON 意味着恢复时必须全量解析、全量写入，选择性恢复要在写入层做复杂的过滤。

拆成四条独立轨道后，选择性变成了**文件存在性**问题：归档里可以只有 `settings.json` 没有 `conversations.json`，恢复端按勾选情况读对应文件即可，导出端也只需生成被勾选的轨道。

四条轨道的划分依据是**数据的生命周期与体积特征**：

| 轨道 | 内容 | 体积 | 变化频率 | 恢复策略 |
|---|---|---|---|---|
| conversations | 会话 + 消息 | 中 | 高 | 按 ID 幂等跳过 |
| knowledge | 知识库 + 文档 + 分片原文 | 中 | 中 | 按 content hash 去重 |
| settings | 模型/供应商配置 | 小 | 低 | 按 key 合并 |
| attachments | 附件二进制 | **大** | 只增 | 按 sha256 文件名去重 |

attachments 单独成轨的理由最硬：它是唯一可能上 GB 的轨道，而且很多用户根本不需要它（知识库文本都在 knowledge 轨，附件只是原始文件副本）。让它可选，备份体积立减 80%。

**knowledge 轨不存向量**是另一个刻意的边界。`knowledge.json` 只存分片原文，不存 embedding——向量是可再生产物，存它让归档膨胀数倍，而且换了 embedding 模型维度就不兼容（sqlite-vec 建表时维度钉死）。恢复后统一打 `needs_reindex` 标记，用当前配置的模型重新嵌入。这个决策让 knowledge 轨从「数据库快照」变成了「源数据 + 重建指令」，跨版本、跨模型都安全。

## 决策三：manifest 与版本探测

`manifest.json` 是整个归档的入口契约，用 Zod 在 `packages/shared` 的 `backup.ts` 里钉死：

```typescript
export const backupManifestSchema = z.object({
  backupSchemaVersion: z.literal(1),        // 备份格式版本，单调递增
  appVersion: z.string(),                    // 源应用版本，仅展示用
  createdAt: z.string(),                     // ISO 时间
  tracks: z.object({                         // 各轨存在性与条目数
    conversations: z.object({ count: z.number() }).optional(),
    knowledge: z.object({ count: z.number() }).optional(),
    settings: z.boolean().optional(),
    attachments: z.object({ count: z.number() }).optional(),
  }),
});
```

三个字段的分工：

- **`backupSchemaVersion` 是格式契约版本**，从 1 起步单调递增。它跟应用版本解耦——将来某次升级改了 DB schema，但备份格式没变，这个号就不动。未来如果备份格式本身要加字段（比如加一条 tasks 轨），号升到 2，恢复端按版本探测走迁移适配器链：v1 归档 → v1 读取器 → 内部统一表示 → 写入当前库。**读取器永远保留所有历史版本**，这是备份工具的铁律——用户可能拿着一年前的归档来恢复。
- **`appVersion` 只是元信息**，展示在恢复确认框里（「此备份由某个旧版本的应用创建于 2026-09」），不参与任何逻辑判断。用应用版本做格式判断是陷阱——应用版本语义会变，格式版本号永远单调。
- **`tracks.*.count`** 给 precheck 用：恢复前就能告诉用户「将导入 23 个会话 / 41 篇文档」，不用先解开几百 MB 的附件轨。

## 恢复端的读取顺序

```text
读 manifest.json → Zod 校验 → backupSchemaVersion 探测
  → precheck（版本兼容？轨道完整？磁盘空间够？）
  → 用户确认
  → 按勾选读轨道文件 → 单事务写入
```

每一步失败都有明确错误码：manifest 损坏（`BACKUP_INVALID`）、版本过新（`BACKUP_VERSION_TOO_NEW`，提示用户升级应用）、轨道缺失但用户勾选了（`BACKUP_TRACK_MISSING`）。**破坏性操作的错误信息必须告诉用户下一步能做什么**，「恢复失败」四个字是不合格的。

## 小结

备份格式设计的核心不是「怎么把数据装进去」，而是「三年后这个文件还能不能被读、被读错时会怎样」。

tar.gz 给了流式与可检视性，四轨划分给了选择性与体积控制，manifest 版本探测给了演进空间。三者共同的底色是：**把归档当成对外的、长期有效的契约来设计，而不是一次性的导出动作**。

下一篇 B03 讲恢复写入端：合并式恢复的事务边界——幂等跳过怎么实现、外键按什么顺序写、`needs_reindex` 标记怎么触发向量重建。
