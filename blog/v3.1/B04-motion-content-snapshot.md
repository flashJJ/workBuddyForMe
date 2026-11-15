# 动效内容怎么从静态表变成可注入快照，同时保证默认零差异

3D 角色的动作系统有一个尴尬的中间状态：内容已经数据化了，但数据仍然写死在代码里。

姿势、动作、行为都是数组常量，运行时构造函数直接 import。想换一组内容，只能改代码；想测试“只有一组自定义动作时能不能跑”，只能改全局常量再恢复。

我们的桌面 AI 应用有三个消费方：桌宠、主窗形象栏、舞台。它们共用同一个动画运行时。运行时越稳定，内容越应该从外面进来。

## 一、先定义“内容”是什么

动效系统分四层：

| 层 | 例子 | 是否属于内容 |
|---|---|---|
| 骨骼与数学 | 四元数、插值、遮罩 | 否 |
| 姿势 | 站立、垂手、抱手 | 是 |
| 动作 | 挥手、点头、摸鱼 | 是 |
| 行为 | 待机、睡觉、被拎起 | 是 |

内容快照只装后三层：

```ts
interface MotionContent {
  version: string;
  poses: readonly PoseDefinition[];
  motions: readonly MotionDefinition[];
  behaviors: readonly BehaviorDefinition[];
}
```

`version` 不是装饰。一次会话应该固定一份快照，让校验器、生成器与运行时读同一份内容；内容变化时由注入方递增版本，避免“白名单里有、运行时没有”。

## 二、默认快照必须是同一引用

最容易出问题的实现是“默认值也拷贝一份”。拷贝会让默认快照与静态表分家，后续修改静态表时观感悄悄漂移。

我们的做法是直接引用：

```ts
const DEFAULT_MOTION_CONTENT = {
  version: 'builtin',
  poses: POSES,
  motions: MOTIONS,
  behaviors: BEHAVIORS,
};
```

运行时构造参数默认使用它：

```ts
constructor(bones, content = DEFAULT_MOTION_CONTENT) {
  this.poses = new PoseLibrary(content.poses);
  this.motions = new MotionLibrary(content.motions);
  this.behaviors = new BehaviorLibrary(content.behaviors);
}
```

默认路径零拷贝、零差异。注入路径则完全绕开全局表。

## 三、剧本白名单也要读同一份快照

剧本生成器需要一份受限白名单：哪些姿势、动作、行为可以被模型引用。以前这份白名单由静态 import 生成，改造后抽成函数：

```ts
function createScriptPrimitives(content = DEFAULT_MOTION_CONTENT) {
  return {
    poses: content.poses.map(p => p.id),
    motions: content.motions.map(m => m.id),
    behaviors: content.behaviors.map(b => b.id),
    ...
  };
}

const SCRIPT_PRIMITIVES = createScriptPrimitives();
```

调用方仍然可以继续用 `SCRIPT_PRIMITIVES`，测试可以传入自定义内容，验证“白名单只包含注入项”。

## 四、注入测试怎么证明“只看到注入内容”

我们写了一个很小的内容包：只含一个姿势，没有动作、没有行为。然后断言四件事：

1. 自定义姿势存在。
2. 内置姿势不存在。
3. 内置动作不存在。
4. 播放内置行为返回 false。

最后实际应用这个姿势，确认骨骼四元数被改写。

这比“构造函数没报错”强得多：它证明运行时真的只读注入内容，而不是在默认表上做增量。

## 五、默认观感怎么守住

内容快照改造最大的风险不是功能坏掉，而是观感漂移。

我们的门禁是 golden 快照：每个行为在固定时间点采样全部骨骼四元数与 root 偏移，量化到 0.02 网格后取摘要。改造前后 16 项快照零差异。

另外补了一条身份断言：

```ts
expect(DEFAULT_MOTION_CONTENT.poses).toBe(POSES);
```

`toBe` 而不是 `toEqual`，就是为了锁住“默认快照直接引用静态表”这个实现约束。

## 六、边界：执行器不进快照

程序化姿势执行器没有被放进 `MotionContent`。它们是代码，不是数据。例如垂手、握拳、坐姿这些需要求解骨骼链的动作，仍然由适配层静态注册。内容包只能引用已注册执行器，或者使用通用骨骼姿势。把执行器也塞进快照，等于允许内容包携带代码，安全和兼容成本会立刻上升。

完整包化（内部包 / 独立仓库）留到契约冻结后再评估。

## 七、结果

- 默认内容下 golden 16 项零差异。
- 注入单姿势内容后运行时可播放，旧内容不可见。
- 剧本白名单可由同一快照派生。
- 动效与剧本校验 34 个测试文件、215 项测试通过。
- 运行时文件保持在 300 行以内。

## 八、可迁移的结论

把静态内容变成可注入快照，关键不是加一个参数，而是三件事同时成立：

1. 默认值与被替换值同源，保证零差异。
2. 所有消费方读同一份快照，避免白名单漂移。
3. 有快照级测试，证明注入内容真的替换了默认内容。

下一篇讲这套改造怎么验证：golden 快照、身份断言与注入测试各自负责什么。
