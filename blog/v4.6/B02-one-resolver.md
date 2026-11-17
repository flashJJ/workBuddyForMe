# 一个解析函数，修掉四处声线不一致

多角色 TTS 的声线绑定看起来很简单：给每个角色一个 sid，合成时传进去。真正上线后，问题往往不在合成，而在“谁来决定 sid”。

我们的应用里有四个地方需要知道“当前角色用什么声线”：

1. 服务端对话合成；
2. 设置页的形象展示；
3. 设置页的角色试听；
4. 舞台/小剧场的台词合成。

这四处各写了一套查表逻辑，平时结果一致，遇到 VRM 就分叉。

## 一、分叉是怎么发生的

服务端有一个函数，先查内置 VRM 表，再查 Live2D 表，最后回落默认角色。这个顺序是对的。

设置页的形象区却用了另一个思路：先通过 Live2D 注册表把 `avatarModelId` 转成模型，再拿模型 id 去查声线表。问题在于，Live2D 注册表只认识五个内置 Live2D 角色；任何 VRM id 传进去都会回落到 Haru。

于是内置雪团在设置页显示 Haru 的 sid，实际对话用的是雪团自己的 sid；点“角色试听”听到的是 Haru，聊天时听到的是雪团。

舞台更隐蔽：cast 数据里有一个 `voicePreference` 字段，注释写着“角色声线偏好”。但运行时只接收 `avatarModelId`，字段从未被读取。因为内置三席的偏好值碰巧和角色表一致，没人发现。

## 二、把“决定”收敛成一个纯函数

我们新增了一个解析函数：

```ts
function resolveAvatarVoice(avatarModelId, override?) {
  if (validSid(override?.speakerSid)) {
    return { sid: override.speakerSid, source: 'override' };
  }
  if (avatarModelId.startsWith('vrm:')) {
    const builtin = BUILTIN_VRM_VOICES[avatarModelId.slice(4)];
    if (builtin) return { ...builtin, source: 'builtin-vrm' };
  }
  const live2d = LIVE2D_VOICES[avatarModelId];
  if (live2d) return { ...live2d, source: 'live2d' };
  return { ...DEFAULT_VOICE, source: 'default' };
}
```

它只做四件事：校验 override、查内置 VRM、查 Live2D、回落默认。不读数据库、不读设置、不碰 HTTP。

返回的 `source` 不参与合成，只用于展示和排查：设置页可以显示“自定义声线”，日志可以知道这次是用户绑定还是默认回落。

## 三、让四个调用方都改用它

服务端合成调用解析函数，并把导入模型的绑定值作为 override 注入：

```ts
const override = readImportedVoiceOverride(db, avatarModelId);
const sid = explicitSpeakerId ?? resolveAvatarVoice(avatarModelId, override).sid;
```

设置页形象区直接把 `modelId` 和当前导入模型的 `voiceSid` 传进去，不再经过 Live2D 注册表：

```ts
const imported = avatars.find(a => a.fileRef === fileRef);
const voice = resolveAvatarVoice(modelId, { speakerSid: imported?.voiceSid });
```

舞台把 cast 的偏好作为第三个参数传下去：

```ts
speak(text, member.avatarModelId, member.voicePreference?.speakerSid);
```

试听按钮则用解析结果里的 sid 发请求。这样四个地方看到的都是同一个值。

## 四、为什么 override 不放在解析函数里查库

最直接的做法是让解析函数接收数据库，遇到导入 VRM 就查 `voice_sid`。这样调用方更省事，但会把纯函数变成 IO 函数：

- 测试要造数据库；
- 设置页/客户端无法直接调用；
- 解析函数被不同进程引用时，数据库句柄来源不一致；
- 未来加缓存或批量解析时，函数边界变得模糊。

现在的做法是“解析纯函数 + 调用方注入 override”。服务端查一次库，设置页从已经拉取的列表里找，舞台只传 cast 配置。谁有数据谁负责取，解析只负责决策。

## 五、测试怎么覆盖

解析函数是纯函数，测试可以穷举：

- 内置雪团 → 18，来源 `builtin-vrm`；
- 内置冉卡露丽 → 32；
- 内置菲比 → 3；
- 内置 Live2D Mark → 58，来源 `live2d`；
- 导入 VRM 未绑定 → 3，来源 `default`；
- 导入 VRM 绑定 58 → 58，来源 `override`；
- 越界 override 103 → 忽略，回落原角色；
- 空/未知 id → 默认。

设置页和舞台的测试只需要断言“调用了解析结果”，不需要重复覆盖整套表。

## 六、经验

1. **同一个决策出现两次，迟早会分叉。** 声线解析、主题解析、权限解析都一样，应该只有一个纯函数。
2. **不要用“注册表”兼任“声线表”。** Live2D 注册表负责模型资源，不负责角色声线；职责混在一起，VRM 就会被误判。
3. **配置字段必须有消费方。** 一个从未被读取的 `voicePreference` 比没有更危险，因为它让配置者以为已经生效。
4. **纯函数 + 注入依赖** 比“函数内部查库”更容易测试，也更容易在客户端与服务端复用。
5. **来源标记很便宜。** 多返回一个 `source`，排查时能省很多时间。

修完这一轮，设置页的试听和聊天里的声音终于一致了。它不是一个显眼的功能，但它是后面“导入模型绑定声线”能成立的前提。
