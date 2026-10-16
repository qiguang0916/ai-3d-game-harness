# 商业版 Release Gate v1（证据强制验收）

`./bin/ai3d-harness release-gate /path/to/manifest.json`

工具不会替你决定游戏是否可以发布。**必须为同一完整 Git SHA 提供七类真实证据**，不得将原生脚本回放假装成 OS 鼠标，也不得将 Editor 内建测试充当真实 GPU Player。

## 必需类别

| 类别 | 必须验证 | 合法 source |
|---|---|---|
| `unity-editor` | 真实 MCP Editor PlayMode / job_id、完成状态、结果 | `live-unity-mcp` |
| `game-physics` | Rigidbody 实际接触、刀具翻面回石、磨削/错误、穿透 | `live-unity-mcp` 或 `real-macos-unity-player` |
| `player-visual` | 实机 Player A/B截图，视觉差异检查 | `real-macos-unity-player` |
| `os-input` | 经系统权限授权的 CGEvent 前台 Player 输入及真实画面变化 | `native-macos-input` |
| `paper-cut` | 真正 A4 纸、裂口、压力、三档阻力、音效，非逻辑模拟 | 真实纸张场景合同记录 |
| `performance` | 真实 Player 帧时间 P95、内存等，具采样统计 | 实机性能原始证据 |
| `nondev-build` | 与同一 commit 对应，明确 developmentBuild=false | Unity Player 构建记录 |

任何模块缺失、状态不是 PASS、当前仍存在同一 SHA 的失败证据、哈希不匹配、跨 SHA 重用都会 BLOCKED。

## Manifest 格式

```json
{
  "expectedCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "evidence": [
    {
      "category": "unity-editor",
      "passed": true,
      "verified": true,
      "sha256": "<64字符实际文件SHA-256>",
      "commitSha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "source": "live-unity-mcp",
      "capturedAt": "2026-10-16T08:00:00Z",
      "artifactUri": "file:///absolute/path/to/immutable-unity-test-job.json"
    }
  ]
}
```

> 上例仅包含一个类别，不可通过 Release Gate。真正需要七类均有实际文件、真实 SHA-256、来源、时间和同一游戏 Git Commit。非开发版额外需要 `"developmentBuild": false`。

## 工具硬性安全规则

1. 公共 CLI 会**强制包含全部七类**，即使 manifest 的 `required` 数组故意只写 Unity 一项也不能绕过。
2. `artifactUri` 只能用本机存在的 `file://` 普通文件；必须验证实际文件内容 SHA-256，不接受口头声明或 HTTP 网页。
3. `os-input` 的 `source` 必须为 `native-macos-input`，而不是 `scripted-replay`。
4. `player-visual` 必须来自 `real-macos-unity-player`；`unity-editor` 必须来自 `live-unity-mcp`。
5. `nondev-build` 必须显式 `developmentBuild:false`；不接受 Development 水印被 UI 遮挡的版本。
6. 手工发布是独立动作；Harness 的 Release Gate 通过后仍需适配不同平台、商店上传和实际玩家验收。

## 结果

退出码 `0` = 当前 manifest 完整通过；退出码 `1` = BLOCKED，有 `missing` 和 `rejected`。
**工具自身 CI 通过不代表任何游戏的 Release Gate 通过。**

## 反例检查

测试包含故意遗漏 os-input、伪造来源、不同 commit、篡改真实文件后 SHA-256 不一致，以及 Development Build 标志错误。这些情况必须全部返回 BLOCKED。
