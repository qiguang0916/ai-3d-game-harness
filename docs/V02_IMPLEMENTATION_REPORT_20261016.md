# AI 3D Game Harness v0.2-alpha — 实施记录与实测结论

记录日期：2026-10-16（本机时区 PDT）。基线 main `851ce9a`，新分支 `feat/v0.2-unity-test-harness`。
如需复核原始机器输出，查看 Git 未追踪且忽略的 `.local-pilot/`（绝不推送本机绝对路径、截图和日志）。

## 1. 已实际交付

| 任务 | 状态 | 完成证据 |
|---|---|---|
| H00 隔离开发 | DONE | 新克隆 + 独立 Git 分支；游戏 HUD worktree 的未提交文件原样保留 |
| H01 方案与任务分解 | DONE | UPGRADE_V02_IMPLEMENTATION.md / UPGRADE_V02_TASKS.md |
| H10 本地证据适配器 | DONE | `qa-file` actions: unity-xml / png / json-pass / json-check / log-markers / project-identity |
| H11 NUnit 强制门禁 | DONE | 检查完成时间、total>0、失败/跳过/不确定=0、叶子用例数/总数一致、用例均通过 |
| H12 PNG 证据完整性 | DONE | PNG header/chunk/CRC、IDAT 解压、有效尺寸、SHA-256、归档路径隔离 |
| H13 端到端证据 DAG | DONE（旧 QA 证据） | 8 个历史 QA 任务在 Harness run-project 中全部 PASS |
| H14 目标项目身份识别 | DONE（只读） | Unity 版本、Git HEAD/branch、dirty 标记、运行中的 Editor projectPath 精确匹配 |
| H20 Coplay MCP 协议检测 | DONE（协议层） | 10.2.0 MCP stdio Doctor PASS，发现47种可用工具，包含 run_tests/get_test_job |
| H21 真实 HUD Unity Editor 绑定 | BLOCKED | 指定 HUD 工程的 Editor 未启动，验证按预期失败；无误连 |
| H22 Unity MCP 实际 TestJob + 截图 | NOT RUN | 无目标 Editor 连接，不能称已通过 |
| H30 玩家动作操作联动 | PARTIAL | 历史 QA22 JSON 的 10 条物理约束通过；尚未让 Harness 发起新的 QA22 Player replay |
| H31 真实 OS 鼠标 | NOT RUN | `KnifeControlFrame` replay 不是 OS 设备验证 |
| H40 视觉金图和差异热图 | PARTIAL | 复用既有 HUD 真实 PNG 和色差检查；尚未做新增的自动视觉基线管理 |
| H50 切纸完整交互 | NOT RUN | 还需指定正式分支及实际场景 |
| H60 Codex 隔离自动修复 | NOT RUN | 现有修复接口未绑定本地授权 Codex，勿声明成功 |
| H70 CI/Release 门禁 | PARTIAL | 严格证据门禁已加入，正式发布流程尚未绑定 GPU/OS 输入验证 |

## 2. 数字证据

- Node TypeScript tests：**46 PASS，0 FAIL**（.local-pilot/test-v02-output.log）。
- 旧 Unity HUD 试点任务：**8/8 PASS**；其中 NUnit 8 + HUD Regression 4，由旧 XML 证据验证。
- QA22 原生翻面落石历史结果：**10/10 条 JSON 断言 PASS**。支持帧数 72、72、72，最大穿透约 0.0016007m，unsafeFrames=0，cameraDriftFrames=0，errors=[]。***这是既有历史测试，不是本轮新执行的玩家操作***。
- 故意注入失败的 QA22 JSON：单任务返回非零并拒绝通过（.local-pilot/negative）。
- 目标 HUD Unity Editor 不存在时：身份检查拒绝通过，防止其他工作树 Editor 被错误识别（.local-pilot/editor-result.json）。
- MCP：真实 v10.2.0 stdio server 初始化+Tool discovery 成功，47 tools（.local-pilot/unity-mcp-doctor.json）。**不是目标 Unity Editor 连通证明**。
- 8 个 QA Task 的 .project/state/evidence/reports 均隔离保存，源游戏报告目录未修改。

## 3. 风险与未完成

1. **必须先开启且绑定正确的 Unity Editor**，再跑真正的 MCP `run_tests` / `get_test_job` 轮询与 PlayMode。
2. macOS 上游戏项目多个 worktrees 并存，必须验证 `-projectPath` 精确匹配，目标 Editor 未启动时绝不可自动连接另一个 Editor。
3. Unity 测试脚本 `KnifeControlEvidence`、`KnifeQualityReplayQA19`、`KnifeFlipLandingEvidenceQA22` 是 `UNITY_EDITOR || DEVELOPMENT_BUILD`：生产 Player 不能用来代替这些特定 Replay。
4. 现有 `ai-3d-game-harness` 的重试/修复提供接口，但 Codex 修复执行器尚未有安全隔离配置，默认禁用。
5. 本地磁盘剩余空间约 41GiB；应避免重复完整 Unity Player 打包。
6. `qa-file` 强制校验读取时的原始证据并留有 SHA-256 副本；为了完全防止事后篡改，未来还需在跨设备持久报告复核时再次验证副本哈希。

## 4. 本次测试的明确限制

- 与真实 Unity 的 *protocol handshake* != Editor integration；
- 与原 Unity 生成的历史证据校验 != 本轮实际启动游戏；
- KnifeControlFrame 模拟输入 != 硬件鼠标；
- 自动修复提供接口 != Codex 已自动修复；
- CI PASS != 商业级 Steam release PASS。

## 5. 后续必做的最短路径

1. 打开**指定** HUD Unity 工作树的 Unity Editor（必须保证没有持有同项目另一个 Editor/编译任务），再在独立 Harness 配置里进行只读 MCP Tool discovery + project identity。
2. 针对 Editor 真实 `run_tests` 建立 start/get_test_job 轮询，最终以已完成的 NUnit XML + SHA snapshot 判定测试通过。
3. 使用现有 QA19/QA22 专用 Development Player 独立运行新的 scripted replay，复用 `json-check`；OS input 仍另起测试层。
4. 增加 HUD/刀石接触/纸张切割的多场景 golden snapshot 与定量视觉验收。
5. 通过之后再审慎接入 Codex 带审阅的自动修复、CI+Release 阻断和游戏 App 构建。

## 6. 安全与回滚

- Harness 使用独立分支 `feat/v0.2-unity-test-harness`。
- 游戏仓库、现有 App、Codex 全局 MCP 配置、Unity Library 等均未改动。
- 本机 `.local-pilot` 已加入 .gitignore，保存私有绝对路径及报告，不纳入公开提交。
- 如需回滚，切回 Harness main；不影响其他工作树。
