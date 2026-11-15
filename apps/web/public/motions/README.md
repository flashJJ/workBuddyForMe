# 内置待机动作

`daiji.vrma` 是 VRMA 1.0 容器，动画曲线由
[`apps/web/scripts/generate-idle-motion.mjs`](../../scripts/generate-idle-motion.mjs)
生成：

- 呼吸/重心/头部微摆为原创曲线，幅度远小于旧版；
- 上臂/前臂按自然下垂求解，任何 VRM 都能直接用；
- 首尾同相，6 秒无缝循环。

生成脚本只使用 VRMA 标准 humanoid 节点名与文件结构，不包含第三方动作关键帧。
如需调整幅度，修改脚本里的 `DEG` 系数后执行：

```bash
node apps/web/scripts/generate-idle-motion.mjs
```
