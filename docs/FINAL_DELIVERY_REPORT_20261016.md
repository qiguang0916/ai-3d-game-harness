# AI 3D Game Test Harness v0.3.0 — 最终工具交付 / QA 报告

> 记录日期：2026-10-16，开发分支 `feat/v0.2-unity-test-harness`。
> 本文记录工具自身可用性；**游戏 QA 不通过不是 Harness 失败。**

## 交付范围

工具不是“单个 Unity Skill”，而是完整的可安装 CLI 与真实设备测试编排系统：
MCP Editor 适配、NUnit PlayMode Job 轮询、真实 macOS Player、
QA19/QA22 物理控制回放、原生 macOS 输入（受系统权限门禁）、
视觉图像对比、性能数据、RealUnityPaperCut/v1、Codex 审核式自动修复、
严格 Release Gate、报告/证据/哈希、安装包/CI/使用手册。
详细使用方法见 `docs/USER_GUIDE_CN.md`。

## 已实际完成的测试（不是模拟结果）

| 验证项 | 记录 |
|---|---|
| Node 控制系统回归 | 最新版本所有 tests PASS（具体数字以 CI 输出为准） |
| Python 脚本正/反例 | 最新版本所有 tests PASS |
| macOS Swift 原生输入 | `swiftc -typecheck` PASS，当前 Mac `AXIsProcessTrusted=false` |
| Coplay Unity MCP | 真实 stdio initialize/listTools 发现 47 个工具 |
| Unity HUD Editor 绑定 | 真实 PID/工程路径/bridgePort 6401 验证，MCP Unity Console 实际读取成功 |
| Unity Editor PlayMode | 真实 8 项 HUD 状态测试 PASS；4 项 HUD 角度 PASS；8 项刀石接触 PASS |
| Unity 游戏 Bug | 操作中心 4 项中 3 项失败；玩家控制 12 项中 2 项失败，未修改游戏 |
| macOS Player | 真实启动非 Development App 并截取 A/B 双面 2880×1800，PNG/ROI 色值一致 PASS |
| Development Player QA19 | 双面实际磨削数据产生，但 360° yaw/roll 检查未完整通过 → FAIL |
| Development Player QA22 | 翻面支撑测试中，180°水平转向后无法恢复持续刀石接触 → FAIL |
| 真正 OS 鼠标/触控板 | 未获 Accessibility 授权 → BLOCKED，未向其他 App 发送模拟输入 |
| 完整切纸场景 | 当前 HUD 工作树未提供 A4 三档音效/变形/裂口完整证据 → BLOCKED |
| 性能 | 可解析真实 Player MINIMUM_TELEMETRY 和 P95/内存阈值；当前历史 QA19 采样数量与帧时不满足验收，不判 PASS |
| Codex 自修复 | 授权控制/隔离工作树/回归测试用 fake Codex 执行器验证；真实模型修复未获具体 Bug 合并授权，不调用真实模型 |
| Release Gate | 7 项强制证据、SHA-256 核验，负面场景全部拦截；当前游戏 Release BLOCKED |

## 实机发现的具体游戏缺陷

1. `KnifeStoneV4OperationMenuTests`：`HorizontalTurnIsHalfCircleAroundSameBodyCenter`、`InspectionMenuStepsExactlyFortyFiveAndReturnsToStone`、`KnifeBodyThroatTipPresetsHaveDifferentPivotAndSafeActualPose` 实测失败。
2. `KnifeStoneV4PlayerControlTests`：`HeldRenderIntentSurvivesIntermediatePhysicsSteps`、`TwoActualHorizontalTurnsStayVisibleThroughEveryStep` 实测失败。
3. `QA19` 双面磨削达到有效工作量，但 360° inspect yaw/roll 未完成。
4. `QA22` 180°水平翻转指令超时，无法重新获得持续真实支撑，测试工具按规定判失败。

上述故障属于独立的游戏工作区，**交付 Harness 不意味着擅自修复或合并这些游戏代码**。

## 工具与游戏的隔离

- Harness 自身代码在单独 Git 功能分支，不覆盖游戏工程。
- 新 QA App 使用独立打包目录，未覆盖之前商业基线；临时 Unity Editor ProjectSettings 修改已恢复。
- 用户原有游戏 worktree 中的 `OriginalNaturalWood.jpg.meta` 删除和其它未追踪数据保留。
- 本机 `.local-pilot/` 内含私有路径/历史证据，不进入源码、安装包或 GitHub。
- 全球 `~/.codex/config.toml` 未被修改；Codex 自动修复默认必须明确批准，实际游戏模型修改需人工审阅。
- Release Gate 不允许缺少 OS 原生输入、切纸或性能就作为商业发行的 PASS。

## 安装与交付文件

发布包 `ai-3dgame-test-harness-v0.3.0.tar.gz`，附 `SHA256SUMS`、`RELEASE_MANIFEST.json`。

```bash
tar -xzf ai-3dgame-test-harness-v0.3.0.tar.gz
cd ai-3dgame-test-harness-v0.3.0
./scripts/bootstrap.sh
./bin/ai3d-harness --help
./bin/ai3d-game-qa --help
```

完整源码、TypeScript 和 Python 测试、schema、Docs、example Contracts、CI、安装脚本与校验工具都在包内。安装需要用户本机具备 Node/OS 依赖；包不包含用户个人游戏数据、Unity Library 或 Codex 认证文件。

## 外部使用权与真实场景依赖

**工具可以完整交付，但不能凭空让一个仍有 Bug 的游戏通过质量验收。**
需要在 macOS「系统设置 > 隐私与安全性」授予当前自动输入应用 Accessibility + Screen Recording，才可以运行原生输入。需要在切纸项目分支实现实际三档场景、导出 `RealUnityPaperCut/v1` 报告，才能通过切纸完整验收。两者都不是在 Harness 内伪造数据可以解决的。

具体安装、使用、API、独立测试与隐私说明见：
- `USER_GUIDE_CN.md`
- `PAPER_CUT_EVIDENCE_CONTRACT.md`
- `RELEASE_GATE_CONTRACT.md`
- `V02_LOCAL_RUNBOOK.md`
- `UPGRADE_V02_IMPLEMENTATION.md`

只有完整、可复现、同游戏 Git commit 的所有 Release Gate 证据 PASS 才可对 Steam 商业版进行最终放行。
