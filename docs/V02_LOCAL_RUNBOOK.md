# v0.2 本机操作手册：安全优先

## 1. 安装与回归
```sh
npm install
npm test
npm run build
```
结果需记录于私有 QA 目录，不应直接提交包含本机私有路径的日志。

## 2. 复用 Second Life Workshop 现有测试证据（只读）

使用此脚本生成私有 contracts/config，不需要更改 Unity 工程代码：
```sh
python3 scripts/init_hud_evidence_pilot.py \
  --game-root /path/to/second-life-workshop-hud-preview \
  --report-dir /path/to/previous/hud-qa-results \
  --qa22-summary /path/to/previous/qa22-flip-summary.json \
  --branch codex/v4-blade-hud-angle-widget-0.1.4 \
  --out .local-pilot/test-run

node dist/cli.js preflight \
  .local-pilot/test-run/contracts \
  .local-pilot/test-run/harness.config.json

node dist/cli.js run-project \
  .local-pilot/test-run/runtime \
  .local-pilot/test-run/contracts \
  .local-pilot/test-run/harness.config.json
```

**仅验证已有证据，不会启动游戏、执行新的 Player 或重现已过的测试。**
- PASS 的条件包括 NUnit XML 完整且全部 Passed、PNG/CRC/IEND/压缩数据有效、JSON 像素报告全通过、播放器启动日志包含预期事件，以及真实证据 hash 存档。
- `.local-pilot/test-run/runtime/.project/reports/latest.md` 是可读报告；`.project/evidence-files/` 按任务和尝试编号保存快照。

## 3. 验证真实 Coplay Unity MCP 协议（不连接 Editor）

创建私有 `mcp-stdio` 配置：
```json
{
  "version": 1,
  "adapters": {
    "unity": {
      "type": "mcp-stdio",
      "command": "uvx",
      "args": ["--from","mcpforunityserver==10.2.0","mcp-for-unity","--transport","stdio"],
      "env": {"UNITY_MCP_SKIP_STARTUP_CONNECT":"1","DISABLE_TELEMETRY":"1"},
      "timeoutMs":90000,
      "actions":{"tests":{"tool":"run_tests"},"console":{"tool":"read_console"}}
    }
  }
}
```
```sh
node dist/cli.js doctor .local-pilot/unity-mcp-protocol.json
node dist/cli.js discover .local-pilot/unity-mcp-protocol.json unity
```

Doctor 成功只代表 MCP 协议/工具发现，不代表目标 Editor 联通。**禁止**无确认使用 `manage_scene`、`delete_script`、`execute_code` 等写操作。

## 4. Editor 身份门禁

通过 `qa-file` 的 `project-identity` action 验证：
```json
{"path":"/path/to/Unity","branch":"codex/v4-blade-hud-angle-widget-0.1.4",
 "unityVersion":"6000.6.3f1","requireEditor":true}
```
未启动**该 worktree**对应 Editor 时必须 FAIL；其他目录的 Unity Editor 进程不算。

## 5. 后续 QA19/QA22 物理回放集成

- QA19：在开发测试模式下生成 `qa19-summary.json`，验收左右工作量、角度、接触、穿透、errors=[]。
- QA22：在开发测试模式下生成 `qa22-flip-summary.json`，验收接触帧数、翻面返回、最大穿透、unsafeFrames、cameraDriftFrames、errors=[]。
- 请使用 `qa-file/json-check` 的固定约束，例如：
```json
{"path":"/path/to/qa22-flip-summary.json","checks":[
 {"path":"flatFlipSupported","operator":"equals","value":true},
 {"path":"horizontalYawSupported","operator":"equals","value":true},
 {"path":"tipLeftFlipSupported","operator":"equals","value":true},
 {"path":"baseContactTicks","operator":"gte","value":25},
 {"path":"peakPenetrationMetres","operator":"lt","value":0.002},
 {"path":"errors.length","operator":"equals","value":0}
]}
```
**重要**：这些回放不是 OS 鼠标测试；无真实证据时不写 PASS。

## 6. 保护性规定

- 始终在隔离工作树运行 Harness；不要直接清理既有 Unity 的 Library/Temp。
- 正式游戏发布包必须是非 Development Build。编辑器 Replay 测试与 Player 渲染测评须独立通过。
- 不允许把 `run_tests` MCP 接受测试的响应当作已完成 NUnit 结果；必须轮询 `get_test_job` 并以 `unity-xml` 做最终门禁。
- 不在无人工授权的情况下调用自动 Codex 修复/PR merge/正式 App 交付。
