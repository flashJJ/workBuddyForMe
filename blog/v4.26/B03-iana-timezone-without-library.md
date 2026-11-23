# 不引入时区库，也能算对 IANA 时区的 cron

需求很具体：每条定时声明一个 IANA 时区，服务端算出下一次执行时间。

可选方案有两个：

- 引入 `luxon` / `date-fns-tz` / `cron-parser`；
- 用 Node 与 Electron 内置的 `Intl`。

产品需要打安装包，少一个依赖就少一份体积与供应链风险；而 `Intl` 自带完整 ICU，已经能给出任意时区的墙钟分量。于是选了第二条。

## 一、核心思路：把问题挪到墙钟域

时区计算最难的部分是「cron 匹配的是墙钟，不是 UTC」。

所以算法分三步：

1. 把当前 UTC 瞬时换算成目标时区的墙钟分量（年、月、日、时、分）；
2. 在墙钟域里跑 cron 的跳进搜索，找到下一个候选墙钟；
3. 把候选墙钟换算回 UTC，并回读校验。

## 二、取得墙钟分量

```ts
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const parts = formatter.formatToParts(new Date(instantMs));
```

把分量拼成 `Date.UTC(y, m - 1, d, h, min, s)`，就得到一个「用 UTC 字段承载墙钟」的毫秒值。后续的月、日、时、分跳进都基于它，逻辑与系统本地时区的 cron 完全一致。

## 三、偏移与回写

给定瞬时 `t`，目标时区偏移是：

```ts
offset(t) = wallMsOf(t) - floorToSecond(t)
```

把墙钟 `w` 换回瞬时，需要知道「那一刻的偏移」。但偏移本身依赖瞬时，于是迭代两次：

```ts
const first = w - offset(w);
const instant = w - offset(first);
```

第一次把墙钟当作 UTC 瞬时取一个近似偏移，第二次用近似瞬时修正。对 DST 切换前后的边界，这个收敛足够稳定。

## 四、回读校验

换算后再取一次墙钟分量：

```ts
if (wallMsOf(instant) !== wall) {
  // DST 跳跃中不存在的时刻，跳过
}
```

这一步把「算出结果」变成「算出并验证结果」。没有它，春季跳变时会把一个不存在的本地时间当成有效执行点。

## 五、边界与成本

- 只支持 5 字段 cron，不引入秒级调度；
- 搜索上限 5 年，无解直接抛错；
- Intl formatter 按需缓存，最多 100 个时区；
- 非法时区在 schema 与计算入口都会拒绝。

整块实现零依赖、可单测，且不改变调度器原有的「扫描到期行」模型。
