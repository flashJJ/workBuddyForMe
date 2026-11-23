# manifest v9：给归档一个身份、一个序号和一条链

备份归档原本只有「什么时候导出的」和「各轨有多少条」。

这对单次恢复够用，但对增量与链式恢复不够：无法回答「这段归档属于哪条链、上一段是谁、我该先恢复谁」。

这一版把 manifest 升到 v9，补上归档的身份与链信息。

## 一、新增字段

```text
archiveId        归档唯一 id
kind             full | incremental
chainId          链 id
sequence         链序号（全量固定 0）
parentArchiveId  增量父段 id
startedAt        导出开始时间
```

全部是可选字段。

可选的原因不是因为新归档可以不写，而是为了让 v8 旧归档仍能被同一个 schema 解析。

## 二、身份与顺序分开

`archiveId` 回答「这是哪一份归档」，`sequence` 回答「它在链里的位置」。

两者不能合并：

- 同一个序号可能因为重新导出而产生不同归档；
- 同一个归档可能被复制多份，但序号不变。

分开之后，链校验可以同时检查「父指针是否对」与「序号是否连续」。

## 三、chainId 什么时候新建

全量导出时：

```text
archiveId = 新生成的 id
chainId   = archiveId
sequence  = 0
```

增量导出时：

```text
archiveId = 新生成的 id
chainId   = 父段的 chainId
sequence  = 父段 sequence + 1
parentArchiveId = 父段 archiveId
```

这样一条链的起点永远是一份全量。

## 四、旧归档怎么兼容

v8 归档没有这些字段。

恢复端用一个归一化函数补齐：

```text
archiveId = "legacy-" + createdAt
kind      = full
chainId   = archiveId
sequence  = 0
parent    = null
startedAt = createdAt
```

于是旧归档被视为「只有一段的链」。

预检、恢复、核对都可以用同一套结构处理，不需要在业务代码里到处判断「有没有新字段」。

## 五、为什么 startedAt 要单独存

manifest 原本有 `createdAt`，表示归档生成时间。

增量需要的是「导出开始时间」，因为 `createdAt` 在打包末尾生成，导出过程中新写入的数据可能落在两者之间。

`startedAt` 让下一段增量的下界更早，宁可重复，不可遗漏。

`createdAt` 继续用于展示与文件名。

## 六、版本号与兼容闸门

schema 版本从 8 升到 9。

恢复端仍然只拒绝「比当前更新」的归档：

```text
manifest.backupSchemaVersion > CURRENT → 拒绝并提示升级
```

旧版本应用读到 v9 会拒绝，这是预期行为，因为旧版本不理解增量语义。

v9 应用读到 v8 会正常恢复，因为归一化函数会补齐字段。

## 七、字段为什么不放进 tracks

这些字段描述的是「整份归档」，不是某一轨。

放进顶层有三个好处：

- 预检不需要解析轨道文件；
- 链校验只看 manifest；
- 未来增加归档级字段时，不需要改轨道结构。

轨道对象继续只描述「这一轨有什么」。

## 八、一条经验

归档格式的演进，先问「这个字段描述的是归档还是数据」。

归档级字段放顶层，数据级字段放轨道。边界清楚，兼容逻辑就不会散落在业务代码里。
