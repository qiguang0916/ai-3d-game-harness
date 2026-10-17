# AI 3D Game Test Harness v0.2 — Second Life Workshop 升级与执行方案

> 2026-10-15 · 方案与实际执行证据分离。v0.1 的 CI PASS **不等于**真实 Unity 游戏 E2E PASS。
> 适用范围：`qiguang0916/ai-3dgame-test-harness`，业务试点 `second-life-workshop-commercial`。
> 原则：一人 + AI，复用现有工具和工作树，不重写 Unity 操作引擎，不在正式环境进行无保护的自动修改。

## 1. 当前基线（已核实）

- Harness main `851ce9a`：Node/TypeScript 控制面、DAG、任务契约、MCP stdio、JSON 进程适配、证据历史、质量门禁、重试修复、CI 假服务器与 Coplay MCP 协议冒烟。
- 目标 Mac：Apple Silicon、Node 22、uvx，Unity 6000.6.3f1。
- 当前 HUD 工作树：`second-life-workshop-hud-preview-20261013`，分支 `codex/v4-blade-hud-angle-widget-0.1.4`。存在未提交文件，**不得覆盖、切换或清理**。
- 工程已含 Coplay Unity MCP 10.2.0，但 Codex 的 `unityMCP` 关闭；127.0.0.1:8080/mcp 拒绝连接；此端点的存在不能作为已联通证据。
- 游戏已存在 31 个 EngineTestAssets/Tests 文件、Unity/NUnit 测试、KnifeControlFrame / ApplyControlFrame、QA19/QA22、HUD A/B QA 截图和颜色像素检查。
- 上述 QA19/QA22/KnifeControlEvidence 被 `UNITY_EDITOR || DEVELOPMENT_BUILD` 条件编译保护，不能以非 Development Player 代替 Replay 验证。
- 当前 Harness 配置只有 `mcp-stdio` 和 `json-process`；Coplay HTTP/Streamable HTTP 需经单独适配或使用 stdio 代理。
- 现有 MCP 适配器在缺少 `successPath/checks` 时可能仅凭调用无异常判断 PASS。必须建立强制结果约束。

## 2. 交付目标与不可替代的验收

目标不是“所有工具都能启动”，而是在**指定 Unity 工作树**上完成可审计闭环：

```
Contract/DAG -> project preflight (repo+branch+clean/allowlist+editor)
  -> deterministic replay / actual player input (separate evidence)
  -> PlayMode and standalone Player -> physics/state/runtime checks
  -> A/B screenshot + pixel/layout regression + performance measurements
  -> consolidated QA gate -> repair proposal -> approved Codex patch
  -> rerun all impacted checks -> fast QA build -> release gate
```

分别记录 4 种证据来源：
- unit/logic: Unity NUnit、原生 C# 核心状态；
- simulated replay: 内置 KnifeControlFrame，不等于真实 USB 鼠标/玩家体验；
- editor integration: Unity Editor + MCP，校验所连 projectPath 和资产 GUID；
- hardware player: 真实 macOS 图形 Player 的启动、焦点、输入、截图、退出码和日志。

任何完成声明必须同时包含：commit、worktree、Unity 版本、构建选项、测试用例数、失败数、截图路径、验收脚本结果、遗留风险。缺失证据判 **BLOCKED/FAIL** 而非 PASS。

## 3. 分阶段实施（由低风险到高风险）

### P0 / Phase 0 — 隔离与设计（本轮目标）
1. 在单独克隆中创建 `feat/v0.2-unity-test-harness`，不在游戏主目录更改任何文件。
2. 冻结并记录 game project 路径/commit；设备、Unity Editor、显存、磁盘可用空间和 MCP 状态。
3. 产出本方案、`UPGRADE_V02_TASKS.md`、证据格式、DoD 和回滚说明。
**DoD**：方案可执行，目录独立，未修改目标 Unity 工程。

### P0 / Phase 1 — Harness 质量门禁与本地执行（本轮目标）
1. 增加 `unity-test-results` 结构化动作：校验 Unity Test Framework 的 NUnit XML（已结束、总数>0、passed=total、failed/skipped/inconclusive=0、XML 完整）及退出码。
2. 增加证据文件真实性校验（存在、非空、位于允许根目录内）；不再接受只有摘要字符串的“截图成功”。
3. 增加可由任务契约声明的严格结果检查策略、错误测试和攻击性负例回归（启动测试≠测试结束；空 XML≠0 失败）。
4. 增加只读 `unity-doctor` / project preflight：projectPath、ProjectVersion、锁文件、目标分支与已连接 Editor；不自动更改 MCP 全局配置。
5. 配置一个可在离线状态运行的本地测试处理适配器，实际读取并验收已有 HUD 测试 XML，而不再次构建 2GB Player。
**DoD**：模拟 MCP/本地 XML 测试全通过；故意失败/空报告被正确拒绝；不会修改游戏代码。

### P0 / Phase 2 — 真实 Unity MCP 接入（需真实设备证据）
1. 优先复用现有 Coplay Unity MCP v10.2.0 的 `mcp-stdio` 入口；如必须用 HTTP，则增加 Streamable HTTP 适配及初始化/会话管理/受控超时。
2. 严格识别目标 Unity Editor 的 projectPath，禁止命中另一工作树；Doctor、Tool discovery、Console、只读 Scene 查询顺序执行。
3. 在 Editor 激活后逐项验证 `run_tests`、结果轮询、截图、Profiler，保存真实返回结构与有效证据；工具调用返回 accepted/running 不算通过。
4. 验证可中断/断连可恢复，并防止两个 Harness 同时写同一个 Unity project。
**DoD**：能在指定项目获得真实 test-run ID+完成结果、截图、日志、指标；否则状态为 BLOCKED，不能标 E2E PASS。

### P1 / Phase 3 — 玩家交互 QA 试点
1. 复用 `KnifeControlFrame/ApplyControlFrame` 构造固定种子的操作序列：刀根/刀腹/刀尖定位→360° 旋转→翻面→落石→磨刀→A/B 检查→返回。
2. 每个动作验证物理证据（支持接触帧数、最大穿透、滑动/接触、姿态误差、实际磨削量、A/B 独立工作字段），禁止直接伪造刀/石坐标。
3. 单独增加 OS 输入路径验证：真实窗口焦点、点击区域、drag/wheel 延迟、UI 阻塞/文本；明确 replay 与真实鼠标结果的差异。
4. 游戏操作失败时保存到逐步骤目录：scene snapshot、frame CSV、PNG、Player.log、NUnit XML。
**DoD**：固定序列连续通过3次，无错误共享写入或状态丢失；错误注入能被门禁截获。

### P1 / Phase 4 — 视觉 QA 系统
1. 建立 reference baseline + 多维检查：16:9和16:10，Retina比例，A/B 两面，初始/除锈/研磨/抛光各状态。
2. 定量规则：图例与外缘RGB差值、HUD不遮挡、对象屏占比、刀石距离/阴影、模型轮廓一致；禁止仅凭 AI “看起来还可以”。
3. 动态内容使用区域ROI、遮罩与容差；截图必须携带实际分辨率、分支和渲染版本。差异应输出热图和指标。
**DoD**：至少8项回归场景，能稳定区分正确图与三类故意破坏图。

### P1 / Phase 5 — 游戏完整循环与切纸
1. 逐步覆盖接单→检查→拆柄→除锈→磨削→抛光→清洁→组装→测试→评级。
2. 切纸需对接当前锋利度引擎分支：真实 A4 纸、下切进度、缺口形变、钝刀阻力、声音触发、暂停继续、最终评分。
3. 先建立分支隔离的数据/场景合同；禁止直接合并有冲突的 Knife/HUD/切纸功能分支。
**DoD**：每关数据跨场景保留；同一刀具完成整轮流程，不允许以静态图代替模拟结果。

### P2 / Phase 6 — AI 自修复（高风险需确认）
1. Codex 是独立修复执行器，Harness 仅授权在临时分支修复；用户优先使用 Pro 配额，避免默认 API 花费。
2. 失败归因需引用日志+diff+可重复复现；修复前后测试证据对应同一目标工作树。
3. 限额：单 Bug 最多3次尝试；单次30分钟；超限必须停止/升级人工。禁止任意执行、删除、覆盖和重置其他工作区。
4. 几何/资产与商业 UI 风格变更必须审核；环境配置和远程凭证修改须用户授权。
**DoD**：真实缺陷修复→重测 PASS，失败自动停止且历史完整。

### P2 / Phase 7 — Git/CI/正式交付
1. PR 门禁：静态检查、Unit、PlayMode、玩家输入、GPU/Player 视觉与关键物理指标都必须 PASS。
2. CI 可使用无图形测试，但 **不能**将其作为 Metal GPU 实机测试。GPU/Player 分离运行。
3. 与 Release 分支单向合并并经过用户确认；正式 App 构建与测试包必须区分。
**DoD**：任何必需证据缺失、结果不匹配或分支污染都阻止 Release。

## 4. 版本、资源、存储、性能策略
- 每个 project 唯一 Editor 所属校验；只读探测不改本机 Codex config。
- Git 目标开发分支与游戏 QA 分支分离；保护既有 worktrees、未提交改动和已有 App。
- 运行产物默认写 `.project/evidence/<task>/<attempt>`；用 JSON 包含 ref SHA、Unity/平台、格式、hash、timestamp、人工复核标记。
- 日常先重用现有本地 NUnit XML/Player PNG，新增完整 Player 构建仅在关键验收/打包节点；避免在磁盘紧张时反复生成约 2GB 包。
- 非开发 Player 以正式材质/光照为准；自动输入重放如带条件编译，必须在 Editor/Development 独立测试。

## 5. 完成定义与报告
- PASS: 校验返回明确结果且证据被复制并 hash、每项真实数值达阈值；
- FAIL: 断言明确失败，保留截图/日志和缺陷分类；
- BLOCKED: 环境未连接、工具/证据不可得，绝不写“已解决”；
- NOT RUN: 尚未执行。
- 每轮报告：实际改动 / 各任务状态 / 代码 commit / tests 统计 / E2E 状态 / 未完成事项和下轮顺序。

## 6. 回滚
- Harness 所有开发在 `feat/v0.2-unity-test-harness`；若失败可切回 `main`。
- 游戏工作树默认只读，不修改全局 `~/.codex/config.toml`、Unity MCP 全局状态、不清理 Library/会话；未经明确授权不向游戏生产分支提交代码。
