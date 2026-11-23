# Next 15 + React 19 换代：真正会咬人的五处改动

早期实现里，web 端是 Next 14 配 React 18。把 Next 推到 15.5.28 之后，命中公告从 23 条归零，两条未认证 RCE 消失。但真正的成本不在改版本号，而在五个必须逐项确认的破坏点——其中一处，还是框架升级顺手照出来的老缺陷。

## 一、升级面只有三个包

| 包 | 升级前 | 升级后 |
|---|---|---|
| next | 14.2.35 | 15.5.28 |
| eslint-config-next | 14.2.35 | 15.5.28 |
| react / react-dom | 18.3.1 | 19.3.1 |
| @types/react / @types/react-dom | 18.x | 19.3.0 |

没有借机批量升依赖。Radix、TanStack Query、xyflow 这些库只在出现 peer 冲突或运行期报错时才动——安全升级不该被生态迁移拖成一次大扫除。

## 二、React 19 不是可选项

Next 15 的 App Router 要求 React 19，这不是建议。所以 18.3.1 → 19.3.1 是硬绑定，类型同步到 19.3.0。

先做的是**静态排查**，而不是直接跑编译。四类常见破坏点全仓检索均无命中：`useRef()` 无参调用、全局 `JSX.*`、`ReactDOM.render/hydrate`、函数组件的 `defaultProps`。确认没有大面积雷区之后，才让类型检查说话。

类型检查报出来的两类问题都很小：

- `RefObject<T>` 变成 `RefObject<T | null>`，一批 ref 的类型标注要跟着放宽；
- 客户端测试不能再直接渲染 async Server Component，改为渲染对应的 feature 组件。

小归小，但它们是**编译期就能拦住**的那一类，属于升级红利。

## 三、异步请求 API：四个页面加一次签名收窄

Next 15 里 `searchParams` 与 `params` 都是 `Promise`。四个服务端页面同步读取它们，升级后必须改成 `await`：

```ts
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  // ...
}
```

列表页与设置页之外，带动态段的路由页 `params` 同理，四处结构完全一致。

Route Handler 侧本来就写了 `await context.params`，逻辑没错，但类型里还留着「同步或异步」的联合。这次把它收窄成只有异步分支：

```ts
// 兼容单测里「只传 request」的调用，保留重载
type Ctx<P> = { params: Promise<P> };
```

收窄的价值不在这次升级，而在下一次：**类型里只要还留着同步分支，就总有人写回同步读取。**

## 四、缓存默认值变了，语义反而更安全

三个默认值同时变化：

- `fetch` 默认不再缓存（等价 `no-store`）；
- GET Route Handler 默认不再缓存；
- 页面段不再从客户端缓存复用（前进/后退仍复用）。

对这个应用来说，这三条恰好是想要的方向：供应商调用、知识库检索、MCP 连接全是实时或本地链路，本来就不该被缓存；业务 API 都带鉴权与动态数据，不缓存只会更安全。代价是列表页和设置页可能多一次请求，用端到端回归覆盖即可。

全仓也没有使用 `next/font`、`@next/font`、`experimental-edge` 运行时，以及请求对象上的 `geo/ip`，这几项无迁移成本。

## 五、配置键迁移：一个改名，一个消失

| 旧键 | 新版本状态 | 处理 |
|---|---|---|
| `experimental.serverComponentsExternalPackages` | 仍存在但标记弃用 | 移到顶层 `serverExternalPackages`，包清单不变 |
| `experimental.outputFileTracingIgnores` | 类型里已不存在 | 改 `outputFileTracingExcludes`，仅作非 Windows 兜底 |
| `experimental.outputFileTracingIncludes` | 提升为顶层键 | 移出 experimental |
| （新增）`outputFileTracingRoot` | 顶层键 | 显式钉到仓库根 |

第二个键是本轮最高风险项：它原本负责把应用数据目录挡在追踪范围外。键消失意味着「挡不住」不再是一个配置问题，而是产物问题——standalone 会把用户目录按绝对路径嵌进产物。这条单独展开讲，这里只记结论：**配置迁移不等于行为迁移，被移除的键必须重新论证。**

## 六、React 19 照出来一个真实缺陷

这次升级最有价值的发现不是兼容性，而是一个一直存在、只是没被稳定触发的 bug。

模型供应商面板里，用户切换供应商后，同一帧内会去拉取该供应商的模型列表。早期实现用的是组件闭包里的 id——切换刚发生，闭包里还是 `null`：

```ts
// 错误形态：同一帧内用旧闭包
await setProvider(id);
await mutateAsync();          // 内部读到的仍是 providerId = null
// 请求打到 /providers/null/models
// 空响应被当成 null 写进 state
setRemote(null);
```

后果有两层：请求打到不存在的路径；更糟的是把 `null` 当数组写进 state，渲染时读 `remote.length` 直接崩。React 19 更严格的调度和类型约束让这条路径稳定暴露。

修法是把「用哪个 id」从闭包里拿出来，变成显式参数，并在取值处做归一化：

```ts
// 修复形态：显式 id + 空值归一
mutationFn: async (overrideId?: string) => {
  const id = overrideId ?? providerId;
  if (!id) return [];
  const models = await apiGet(`/providers/${id}/models`);
  return models ?? [];
};
```

值得记一笔的是：**框架升级的收益不只在漏洞清零，还在于它会用更严格的约束把你原本含糊的状态写法照出来。**

## 七、验收

| 项 | 结果 |
|---|---|
| Next 公告 | 23 → **0**，两条 critical RCE 消失 |
| 全仓 critical | 6 → 4（构建链待下一步清） |
| 类型检查 | 14/14 包通过 |
| 静态检查 | lint 0 error，行数门禁通过 |
| 单测 | web 104 文件 / 555 例全绿 |
| standalone | 追踪命中 0，`/api/health` 返回 200 |

下一步是桌面壳换代，那里有一个比类型更麻烦的东西：一个被改成异步的剪贴板 API。
