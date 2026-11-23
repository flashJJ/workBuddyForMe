# 技能快照：同一版本可能有多行，占用统计和删除都不能只看一行

设置页的版本面板上写着「共 3 版 · 占用 96.4 MB」，可去磁盘上一看，明显没占这么多；删掉一个旧版本，提示成功，列表刷新后它又在列表里出现了。

这两个现象不是界面 bug，而是数据模型决定的：快照行不是按「技能」存的，而是按「技能状态行」存的，一个版本可能对应多行，多行还指向同一个目录。任何按行计数的实现，都会在这两处翻车。

## 一行快照绑定在哪个状态上

快照表里的每一行都带着状态行 id。能力包升级时会重建状态行，历史快照并不跟着搬走，于是同名同版本就会留下多条记录。当新状态行扫描到相同内容时，快照目录是可以复用的——同名、同版本、同校验和的行直接指向旧目录，不必再拷一份。

于是有三种朴素写法，三种都会出问题：

| 朴素写法 | 实际结果 |
|---|---|
| 把所有行的目录体积加起来 | 同一个共享目录被算多次，面板数字比磁盘大 |
| 只删「代表行」 | 其它状态行还引用着这个版本，列表刷新后它又回来了 |
| 删完行按版本删目录 | 目录可能仍被别的版本行引用，回退时报快照不存在 |

所以统计与删除都要先回答一个问题：这个版本在你的视图里，到底由哪一行代表。

## 代表行：每个版本只挑一行

列表接口按版本聚合，同名版本只保留一行：优先当前状态行，没有则取最新的一行，最后按创建时间倒序输出。

```text
function representativeRows(name, currentStateId):
  picked = {}
  for row in rowsOf(name):              // 含历史状态行
    if row.version not in picked:
      picked[row.version] = row
    else if row.skillStateId == currentStateId:
      picked[row.version] = row         // 当前状态行优先
  return sortByCreatedAtDesc(picked)
```

| 场景 | 行的情况 | 代表行 |
|---|---|---|
| 正常单状态 | 一个版本一行 | 就是它 |
| 能力包升级后 | 同版本，一条当前状态行、若干历史行 | 当前状态行 |
| 历史行残留 | 同版本，全是历史行 | 创建时间最新的一行 |
| 不同版本 | 每个版本各自一行 | 各取各的 |

面板上每个版本的体积、时间、启用标记都来自代表行。用户看到的是「版本」这个产品概念，而不是「数据库行」这个实现概念。

## 占用统计：按代表行求和

`totalBytes` 直接对代表行的目录体积求和。这样做之所以不会重复计数，是因为目录复用只发生在「同名、同版本、同校验和」之间——同一个版本的多行被代表行合并成了一条，不同版本的目录本来就各是各的，不会共享。

```text
function listVersions(name):
  reps = representativeRows(name, state.id)
  versions = [{ version, checksum, sizeBytes: directorySize(row.dirPath),
                createdAt, active: state.activeVersion == row.version } for row of reps]
  return { versions, totalBytes: sum(versions.sizeBytes) }
```

没有快照时返回空列表、总占用 0，并标记版本能力不可用——面板据此显示空态，而不是显示「0 版 · 占用 0 B」。

字节数的格式化放在前端做，B、KB、MB 三档就够了，不值得为此拉一个跨端工具进 core 包。

## 删除：按「名字 + 版本」清掉所有行

删除的粒度必须是版本，不是行。入口先把这个版本的全部状态行收齐，记录它们涉及的目录，然后逐行删除；全部行删完之后，再对每个目录查一次引用计数，只有真正没人引用了才删盘。

```text
function deleteVersion(name, version):
  rows = listByNameVersion(name, version)      // 跨状态行
  if rows is empty: raise MISSING
  if activeVersion == version: raise ACTIVE
  if representativeRows(name).length <= 1: raise LAST

  dirs = unique(rows.map(r => r.dirPath))
  for row of rows: removeRow(row.id)

  freed = 0
  dirDeleted = false
  for dir of dirs:
    if countRowsByDir(dir) > 0: continue       // 还有别的行在用
    if not exists(dir): continue               // 已被手工删掉
    size = directorySize(dir)                  // 先量体积再删
    rm -rf dir
    freed += size
    dirDeleted = true

  return { version, rowsRemoved: rows.length, freedBytes: freed, dirDeleted }
```

返回结果只描述「这一次删掉了什么」，不描述「现在还剩什么」；路由层把删除结果和最新版本列表一起返回，前端就不必删完再发一次查询。

| 字段 | 含义 |
|---|---|
| `version` | 被删除的版本号 |
| `rowsRemoved` | 实际删掉的状态行数，可能大于 1 |
| `freedBytes` | 真正被删掉的目录体积之和，共享目录只算一次 |
| `dirDeleted` | 本轮是否真的删掉了至少一个目录 |

## 四个容易写错的细节

**引用计数要放在删行之后。** 删行之前，这个目录至少被本次要删的行自己引用着，计数永远大于零，判断必然失效。顺序必须是「先删行，再计数」。

**先量体积，再删目录。** 删完就量不出来了，`freedBytes` 也就只能返回 0。体积在这里是给用户看的即时反馈，不是统计口径。

**目录不存在就跳过。** 用户手工清理过、或上次删除中途失败，都会留下「行在盘不在」的状态。这时不该报错，也不该把体积计进释放量。

**释放字节不等于版本体积。** 共享目录还在被别的版本引用时不会删，这一版的体积就不能算进释放量。面板显示的是「这一版占多少」，提示里说的是「这次能释放多少」，两个数本来就允许不同。

还有一条口径值得单独说明：删除只影响快照目录，不动技能自身的正式目录，也不改启用状态。快照是历史，不是安装产物，清理历史不该改变正在运行的技能。

## 面板如何呈现

标题区显示「共 N 版 · 占用 X」，每一行是一个版本：版本号、体积、创建时间、启用标记，以及回退与删除两个按钮。

删除按钮不是每行都有：只有「非启用且不止一版」的行才出现，其余位置显示保护文案。点击后弹二次确认，文案里带上技能名、版本号和这次预计释放的字节，按钮用危险样式。成功后按返回的新列表刷新，失败则展示结构化错误信息，不做前端猜测。

## 边界

这一轮不做批量删除，也不做「超期自动清理」。保留策略需要独立的配置语义与撤销路径，留到之后单独设计。删除本身不可逆，因此保护规则与审计留痕是同一件事的两面——那是下一篇要讲的部分。
