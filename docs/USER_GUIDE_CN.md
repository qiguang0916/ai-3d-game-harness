# AI 3D Game Harness 完整使用手册（v0.3.0）

工具仓库：`qiguang0916/ai-3d-game-harness`。
目的：**一人 + AI** 进行真实 Blender / Unity 开发与验证，自动发现故障、保存证据、输出修复候选、经批准再交付。不是代替真实游戏或绕过操作系统权限的软件。

## 0. 理解三个相互独立的状态

- **工具已安装**：Node/Python 构建与自测通过，只证明 Harness 控制面工作。
- **游戏 QA 通过**：真实 Unity Editor / Player 在指定 commit 跑完了全部规定任务，证据有 SHA-256。
- **正式发行通过**：同一个游戏 commit 的所有 Unity、物理、画面、系统鼠标、切纸、性能、非 Development 构建七个门禁全部有真实证据，并且没有失败记录。

不能把三种状态混为一谈。当前 Second Life Workshop 的游戏操作存在真实测试失败，Mac Accessibility 也未授权；工具可以交付运行，但不能宣称游戏通过所有验收。

## 1. 安装

macOS Apple Silicon（推荐 Unity 6000.6.3f1）：

```bash
# 在已下载/解压的项目根目录
./scripts/bootstrap.sh
./bin/ai3d-harness doctor examples/second-life-workshop/harness.config.example.json
./bin/ai3d-game-qa --help
```

需要 Node.js >=20、npm、Python 3.12（>=3.10 通常可用）、Git。
Unity 自动控制需要 Unity Editor、Coplay MCP for Unity 10.2.0、`uvx`。
真实 OS 输入仅 macOS，需要 Xcode CLI Swift 编译器、Pillow 与 Accessibility/Screen Recording 权限：
```bash
python3 -m pip install Pillow
swiftc -typecheck scripts/macos_input_driver.swift
swift scripts/macos_input_driver.swift --probe
```
权限未授予时输出 `BLOCKED` 是正常且安全的行为，工具不会发送鼠标事件。
安装不执行 `sudo`，不修改全局 `~/.codex/config.toml`，不安装后门程序。

## 2. 只读验收已有游戏证据（不启动 Unity）

```bash
python3 scripts/init_hud_evidence_pilot.py \
  --game-root /path/to/second-life-workshop \
  --report-dir /path/to/hud-qa-history \
  --qa22-summary /path/to/qa22-flip-summary.json \
  --branch codex/v4-blade-hud-angle-widget-0.1.4 \
  --out .local-pilot/history
./bin/ai3d-harness preflight .local-pilot/history/contracts .local-pilot/history/harness.config.json
./bin/ai3d-harness run-project .local-pilot/history/runtime .local-pilot/history/contracts .local-pilot/history/harness.config.json
```

实际检查 NUnit XML、PNG 完整性、日志、QA22 物理数据、像素报告、Git 分支与 Unity 版本。
报告在 `.local-pilot/history/runtime/.project/reports/latest.md`，哈希证据在 `.project/evidence-files/`。**这些是历史证据验证，不是本轮真实游戏重跑。**

## 3. 连接真正 Unity Editor 与运行 PlayMode

先启动目标工作树的 Unity Editor。**允许多个不同项目 Editor，但每个项目只能匹配一个目标进程，绝不向错误的项目发命令。**

从 Editor 对应的 MCP 端口获得 `bridgePort`（必须由该 Editor PID 持有，例 6401），不要猜端口：
```bash
python3 scripts/init_live_unity_pilot.py \
  --game-root /path/to/second-life-workshop \
  --branch codex/v4-blade-hud-angle-widget-0.1.4 \
  --bridge-port 6401 --test-class KnifeBladeInspectionConditionV4Tests \
  --minimum-tests 8 --out .local-pilot/editor
./bin/ai3d-harness preflight .local-pilot/editor/contracts .local-pilot/editor/harness.config.json
./bin/ai3d-harness run-project .local-pilot/editor/runtime .local-pilot/editor/contracts .local-pilot/editor/harness.config.json
```

Harness 会绑定指定 PID/工程路径/端口，调用真实 Coplay MCP `run_tests`，轮询 `get_test_job` 到 terminal 状态；读取测试数量、失败断言、结束时间并存档 Job 证据。仅“Test job started”绝不会被判通过。

## 4. 真正 macOS 游戏 Player、QA19/QA22、A/B 和颜色

适用 Second Life Workshop 的独立测试版本和非开发版：

```bash
python3 scripts/run_game_qa.py \
 --game-root /path/to/second-life-workshop \
 --branch codex/v4-blade-hud-angle-widget-0.1.4 \
 --mode player \
 --app /path/to/non-development/WorkshopSharpening.app \
 --dev-app /path/to/development/WorkshopSharpening.app \
 --out .local-pilot/full-qa
```

游戏测试脚本接收 `-inspectHtmlQaCapture`（A/B 面截图）、`-knifeQa19Dir`（双面磨削/360° 重放）、`-knifeQa22FlipDir`（翻转重新落石）。3 类测试返回独立任务门禁。颜色像素回归重用项目内已有 `scripts/inspection-ui/check_player_color_parity.py`，并采用当轮 Player 刚产生的 PNG。
如果 QA19/QA22 游戏本身失败，**整体 Player QA FAIL**，其它通过的截图仍保存为证据，不降低门禁。

统一命令（Editor + Player）：
```bash
./bin/ai3d-game-qa --mode all --game-root /path/to/game \
 --branch codex/v4-blade-hud-angle-widget-0.1.4 \
 --app /path/to/nondev.app --dev-app /path/to/dev.app \
 --out .local-pilot/full-run --launch-editor \
 --test-class KnifeBladeInspectionConditionV4Tests \
 --test-class KnifeStoneV4ContactTruthTests
```

建议先在 `--mode editor` 或 `--mode player` 分开诊断，再运行 `all`。不要在游戏仍有用户未提交修改时自动切换分支。

## 5. 真实 OS 原生鼠标/键盘（需要系统授权）

这是**真正发送 CGEvent 到前台 App**，不等于内部 `KnifeControlFrame` 重放。需先为执行程序授权 macOS「系统设置 > 隐私与安全性 > 辅助功能」，并启用「屏幕录制」。

启动测试 App，查询真实 PID，手工选定**游戏窗口内部**的拖拽起止点及截图 ROI：
```bash
python3 scripts/init_native_input_pilot.py \
  --game-root /path/to/game --app /path/to/QA.app --pid 12345 \
  --drag 800 500 850 650 --roi 650 350 450 400 \
  --out .local-pilot/native
./bin/ai3d-harness run-project .local-pilot/native/runtime \
 .local-pilot/native/contracts .local-pilot/native/config.json
```

系统未授权、App 不在前台、PID 不属于该 App、鼠标坐标不在该 App 窗口、ROI 没有实测像素变化、录屏失败等都必须 **FAIL/BLOCKED**。
当前工具也支持 `--key <macOS虚拟键码>`。权限授予前不要绕过或替换成内部重放。

## 6. 自动视觉 QA 与性能 QA

`qa-file/image-diff`：输入两张实际 PNG、指定 ROI、忽略动态时间区域、颜色容差以及最大差异比例。自动生成红色差异热图、数值与哈希快照。

`qa-file/performance-log`：从真实 Player 的 `MINIMUM_TELEMETRY` 采样读取 `frameMs`、`memoryMiB`，默认至少 20 个样本、P95 不高于 33.3ms、峰值内存不高于 1024MiB；用户可在任务合同中设更严格的阈值。无样本或超限判失败。**已有 QA19 的失败回放性能不代表游戏性能正常。**

## 7. 切纸场景接入

`scripts/paper_cut_qa.py` 使用实际 Unity Player 生成的 `RealUnityPaperCut/v1` JSON+截图+音效，而非静态插画。专用安装和验收：
```bash
python3 scripts/init_paper_cut_pilot.py \
  --report /path/to/paper-qa/report.json \
  --evidence-root /path/to/paper-qa \
  --expected-commit <40字符的真实游戏Git SHA> \
  --out .local-pilot/paper
./bin/ai3d-harness run-project .local-pilot/paper/runtime \
 .local-pilot/paper/contracts .local-pilot/paper/config.json
```
详见 [真实切纸 QA 合同](PAPER_CUT_EVIDENCE_CONTRACT.md)。旧版 `PaperTrial` 逻辑的通过**不能替代**商业场景中的纸张几何、压力、连续裂口、声效和三档阻力测试；当前游戏工作树未提供全部真实输出时保持 `BLOCKED`。

## 8. AI 自动修复（可选，默认不执行）

`scripts/codex_repair_provider.py` 通过已登录 ChatGPT 的本机 Codex CLI，**仅在明确授权后**创建独立 Git worktree，给 Codex 注入失败测试证据，运行允许清单中的回归命令，保存修复方案，不自动合并、推送或发布。

使用前在私人 Harness config 中配置 `repair` 为 `json-process`，命令指向 `python3`，参数为 `scripts/codex_repair_provider.py`。需要明确设置：
```bash
HARNESS_REPAIR_APPROVED=1
HARNESS_REPAIR_SOURCE_REPO=/path/to/git-root
HARNESS_REPAIR_WORKTREE_ROOT=/path/to/isolated-repairs
HARNESS_REPAIR_TEST_ARGS_JSON='["npm","test"]'
```
没有这些授权，自动修复返回 BLOCKED。这不是游戏代码的自动无限重试；关键差异必须人工批准。

## 9. 发行门禁（永远不能跳过）

```bash
./bin/ai3d-harness release-gate /path/to/release-evidence-manifest.json
```
工具要求同一个游戏 Commit 的七类证据：Unity Editor、物理、真实 macOS Player 视觉、原生 OS 输入、切纸、性能、非 Development Build。
每个通过条目必须带 **真实文件的 `artifactUri: file:///...`、SHA-256、版本 SHA 和来源**；所有文件会再次核验 SHA-256，缺失、修改、伪造均不得通过。详见 [Release Gate](RELEASE_GATE_CONTRACT.md)。

没有操作权限、没有纸张场景、Player 测试失败时，`RELEASE=BLOCKED` **代表工具正常起效**，不允许将其涂改为 PASS。

## 10. 问题排查

- Unity MCP 可以列出工具但连接不到游戏：确认 Editor 真正运行、`projectPath` 与 Git 工作树相符、该 Editor 自己持有 bridge TCP 端口；不可使用其他 Unity Editor 的监听端口。
- 工具报告 `QA19` 或 `QA22` FAIL：检查 `.project/player-qa/<任务>/attempt-*/` 中的报告和日志，游戏本身可能有 360° 旋转/翻面落石问题。
- PlayMode run_tests 有 job_id 但没有 summary：继续轮询 `get_test_job`；未达到 terminal/缺 test result 为失败或超时。
- App 截图出不来：检查前台窗口与 Unity QA 脚本（需脚本实际编译进对应 Player）。
- macOS `AXIsProcessTrusted()` 为 false：请手工授权，不要尝试关闭系统保护。
- 磁盘空间不足：避免频繁构建 2GB Player；只记录必要的 SHA 证据，旧版本按人工批准的保留政策清理。
- **不要把仿真测试当作玩家体验**：真实输入和游戏内部 replay 是两个不同的测试类别。

## 11. 项目与交付

Harness 的源代码、测试工具、文档、示例合同、CI 和发布脚本一起打包；`.local-pilot`、`~/.codex`、Unity Library、账号、密钥、历史素材和游戏 App 不打包。

解压 `ai-3d-game-harness-v0.3.0.tar.gz` 后运行 `./scripts/bootstrap.sh`，即可拥有可安装与重复验证的完整 Harness 控制工具。真正的 Steam 游戏发行仍由七类质量门禁共同决定。
