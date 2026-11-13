# CMU 动捕片段（归档）

来源：**CMU Graphics Lab Motion Capture Database**（<http://mocap.cs.cmu.edu/>），数据库声明 **free for all uses**。
按数据库要求致谢：*This data was created with the support of NSF EIA-0196217.*

| 文件 | 源片段 | 取段 | 用途 |
|---|---|---|---|
| `cmu-idle-13_27.vrma` | 13_27 | 7.88–10.88s | 平稳站立（原「走位+转身」段已弃用） |
| `cmu-stand-40_10.vrma` | 40_10 | 46.25–49.25s | 双腿分开站立 |
| `cmu-stretch-42_01.vrma` | 42_01 | 4.25–7.25s | 伸懒腰 |
| `cmu-walk-01_01.vrma` | 01_01 | 0–3s | 原地走位 |

生成命令（3 秒、30fps、锁朝向、脚底贴地；A-pose 源默认做静息对齐）：

```bash
node scripts/motion/bvh-to-vrma.mjs <源.bvh> <输出.vrma> \
  --fps 30 --range 开始:结束 --lock-yaw --ground
```

校验口径：4 条片段 hips 前向量稳定 `(0,0,1)`，脚尖最低点 0.058–0.095；
文件与本轮最终版（`.tmp/mocap-clips`）SHA256 一致。

说明：

- 这里只是素材归档，**不会自动进入动作池**；运行时默认待机仍是 `daiji.vrma`。
- 需要试播时通过设置页导入，或由预览面板引用 `~/.workbuddy-for-me/motions/` 下已导入的条目。
- 旧的 `cmu-wave-13_27`（0–3s 实为走位+抱手）已废弃，不再归档。
