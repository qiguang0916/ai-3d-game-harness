# Harness v0.2 工作分解与验收清单

状态值：DONE（附证据）；RUNNING；BLOCKED（注明环境原因）；NOT RUN；FAIL。
严禁将设计/接口存在与真实游戏 E2E 通过混淆。

| ID | 阶段 | 工作项 | 测试/验收证据 | 初始状态 |
|---|---|---|---|---|
| H00 | 0 | 独立克隆、分支、基线记录、不触碰游戏目录 | Git status / HEAD | NOT RUN |
| H01 | 0 | 自包含方案、架构、验收指标、回滚策略 | docs/UPGRADE_V02_IMPLEMENTATION.md | NOT RUN |
| H10 | 1 | 本地 QA 工具输入适配（XML/PNG/日志） | adapter unit + actual NUnit XML | NOT RUN |
| H11 | 1 | XML 严格语义断言：完成且全过，拒绝空/失败/跳过/运行中 | negative tests | NOT RUN |
| H12 | 1 | PNG 证据完整性、尺寸、哈希、路径隔离 | PNG fixture+negative tests | NOT RUN |
| H13 | 1 | QA 结果统一进 EvidenceStore/Quality Gate/report | sample contract run-project | NOT RUN |
| H14 | 1 | 项目 preflight：工作树、Unity版本、可用空间、分支、Editor绑定 | doctor-json / unit | NOT RUN |
| H20 | 2 | Coplay 10.2.0 协议 Doctor 工具发现 | MCP handshake+tool list | NOT RUN |
| H21 | 2 | 真实目标 Unity Editor 绑定且禁止误连 | editor path + project hash | NOT RUN |
| H22 | 2 | MCP run_tests 完整生命周期（发起→轮询→证据） | matching runId/XML | NOT RUN |
| H30 | 3 | Harness 触发 QA19/QA22、输入重放、检查状态 | dev/evidence player run | NOT RUN |
| H31 | 3 | OS 真实鼠标与回放区分，按键/滚轮/窗口焦点测试 | os-input evidence | NOT RUN |
| H40 | 4 | 视觉黄金基线、区域/分辨率检查、失败热图 | PNG+diff report | NOT RUN |
| H50 | 5 | A/B 磨削与切纸流程合同、跨分支隔离 | actual Unity tests | NOT RUN |
| H60 | 6 | Codex 带隔离分支自动修复+成本与重试策略 | controlled failure->repair->pass | NOT RUN |
| H70 | 7 | PR、CI 与双模式 Player release gate | blocked release negative test | NOT RUN |

## 质量量化底线
- 所有必需证据路径必须真实存在，不能仅以工具响应 success 即通过。
- Unity XML：仅当 NUnit 测试完成、total>0、passed=total、failed=0、inconclusive=0、skipped=0 时通过；用例数量与根报告一致。
- 图片：PNG 文件头有效、合理尺寸、真实字节大小，并记录 SHA-256。
- 物理：不得出现脚本绕过真实 Rigidbody/接触直接设置磨削成果；最大穿透与持续支撑阈值由目标场景合同定义，不采用通用硬编码。
- A/B 视觉：动态状态、贴图指针、颜色一致性均需真实证据。像素容差/ROI 跟测试基准一起版本化。
- Release gate：Logic PASS + GPU Player PASS + Inspector / A/B PASS + physical behavior PASS 才可宣布可交付；缺任一 BLOCKED。

## 最小试点顺序
1. 先让 Harness 读取现有 HUD 的 NUnit XML 和双面 PNG，结构化记录 PASS/FAIL，证明可重复使用已有 QA。
2. 再打通本机 MCP 只读验证及正确 Editor 身份。
3. 再把 KnifeControlFrame 重放接入 Harness（有物理接触证据，不接入真实鼠标前声明 replay）。
4. 最后升级真实输入与 Paper Trial，逐步加入 Codex 修复和正式 App 构建。

## 安全禁区
- 不修改全局 Codex MCP enabled 状态；不擅自重启正在运行的其他 Unity Editor；
- 不清理 `~/.codex`、`Library`、旧 App、Unity 项目未提交文件；
- 目标游戏仓库默认只读，自动修复单独创建隔离工作区；
- 不将本机临时路径、账号、密钥、任何 token 提交到公共 GitHub 仓库。

## 可继续的验收命令（不得声称已运行）
```bash
npm install
npm test
npm run build
node dist/cli.js doctor path/to/private-config.json
node dist/cli.js preflight examples/knife-001/contracts path/to/private-config.json
node dist/cli.js run-project <separate-sandbox-project-root> <contracts-dir> <private-config.json>
```
