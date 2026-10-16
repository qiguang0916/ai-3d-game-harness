# RealUnityPaperCut/v1 — Unity 真实切纸验收接口

该合同**只接受实际 Unity Player 采样**；例子用于开发双方对齐字段，不能复制例子作为正式游戏证据。

## 必需条件

独立真实 A4（210×297mm、portrait）、深灰蓝背景 `#46545E`、屏幕高占比 50–70%、实际 worldPaperMesh=true、玩家从上往下的拖动切割。单次 PlayMode/Player 过程必须产生连续裂口、暂停/恢复、受力/变形、声音。

必须用**同一游戏 Git 完整 SHA**对三档锋利度分别进行同样拖动：钝刀（高阻、较大压力变形、较短裂口）、中刀（中间）、锋利刀（低阻、连续完整裂口）。三档必须各有一个真实 PNG 截图和 WAV 音效样本。

## 示例结构（示意，不是测试证据）

```json
{
  "contract": "RealUnityPaperCut/v1",
  "source": "real-macos-unity-player",
  "gameCommit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "scene": "Assets/EngineTestAssets/PaperCutGuided.unity",
  "paper": {
    "widthMM": 210,
    "heightMM": 297,
    "orientation": "portrait",
    "background": "#46545E",
    "screenHeightRatio": 0.60,
    "worldPaperMesh": true
  },
  "trials": [
    {
      "sharpness": "dull",
      "samples": [
        {
          "timeSec": 0.1,
          "dragProgress": 0.0,
          "cutProgress": 0.0,
          "contactForce": 4.5,
          "deformation": 0.0
        }
      ],
      "cutSlitConnected": false,
      "pauseResume": {"resumed": true, "heldProgress": true},
      "screenshot": "/absolute/path/to/dull-cut.png",
      "tearAudio": "/absolute/path/to/dull-cut.wav"
    }
  ]
}
```

> 示例只展示了 1 帧和 1 个 trial，不符合真实验收。**实际至少需要 dull、medium、sharp 三组，每组至少 8 帧。** 每组按时间递增、拖动进度递增、裂口进度不得倒退；最大拖动进度至少 0.95。

## 验收断言

1. 完整 Git commit、Unity 场景、真实 Player source 字段；用户提供 `--expected-commit` 必须相同。
2. 实际 A4 几何比例、背景色、屏高占比、朝向、world paper mesh。
3. 三组锋利度样本数，每组真实递增时间、合法 0–1 切割与拖动进度，玩家操作覆盖纸张高度。
4. 清晰的裂口连通性（中锋利、锋利必须连续；钝刀可以尚未裂开），不得中途重新闭合。
5. 平均刀纸接触力 `dull > medium > sharp`，钝刀最大压力变形 > 锋利刀。
6. 锋利刀最终裂口进度 >=0.95，钝刀进度 < 锋利刀；防止钝刀无阻力切到底。
7. 所有级别执行暂停/继续，暂停时裂口进度保持不变。
8. 3 张 PNG 必须是真实图像证据（PNG CRC/IEND/IDAT 解码、尺寸不少于 1200×720，SHA-256）。
9. 3 份 WAV 录音，时长 0.15–30 秒，频率至少 22.05kHz，声道 1 或 2；三个文件的 SHA 不得相同。
10. 报告及媒体都必须存在于 `--evidence-root` 下；该目录不得处在由 Harness 编写的证据目录之外而没有授权。

## 运行

```bash
python3 scripts/init_paper_cut_pilot.py \
  --report /path/to/paper-qa/report.json \
  --evidence-root /path/to/paper-qa \
  --expected-commit <40-char-Git-SHA> \
  --out .local-pilot/paper
./bin/ai3d-harness preflight .local-pilot/paper/contracts .local-pilot/paper/config.json
./bin/ai3d-harness run-project .local-pilot/paper/runtime .local-pilot/paper/contracts .local-pilot/paper/config.json
```

如果真实场景未实现或缺少截图/音效/变形，返回 `FAIL/BLOCKED`。本方案**没有**修改已有纸张引擎，也不会声称视觉和真实接触测试已通过；此合同专门用于后续把纸张场景开发接入 Harness。
