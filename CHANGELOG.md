# AI 3D Game Test Harness — Changelog

## v0.3.0 — 2026-10-16

**First self-contained AI game QA tool release.** This release stabilizes the
Harness orchestration/control plane and adds real macOS Unity Editor and
Player integrations. A functioning QA tool is distinct from a passing game.

### New
- Separate, exact-project Coplay Unity MCP v10.2.0 binding, strict run_tests
  job-id polling, completed PlayMode result verification, Unity console checks.
- Game Player controller: non-Development macOS A/B screenshot capture, optional
  Development Player QA19/QA22 real scripted-physics replay, SHA evidence and
  per-task HTML/Markdown/JSON reports.
- Local evidence verifier for NUnit XML, CRC-validated PNG, image ROI diff and
  heatmap, deterministic QA JSON assertions, Player P95/memory telemetry.
- Native macOS CGEvent input adapter with explicit opt-in, Accessibility /
  Screen Recording gates, exact foreground app+PID+window bounds and visual ROI.
- RealUnityPaperCut/v1 QA evidence contract, actual A4 geometry, 3 sharpness
  classes, continuous tears, force/deformation, audio and actual screenshots.
- Optional ChatGPT-account Codex repair adapter in a new isolated Git worktree,
  with explicit approval, no model sandbox bypass, mandatory post-repair tests,
  and never automatically merging or pushing the patch.
- Strict seven-category release gate, same Git commit, source provenance,
  actual file URI and SHA-256 readback, explicit non-Development build.
- `bin/ai3d-harness`, `bin/ai3d-game-qa`, guarded bootstrap, archive maker /
  checksum verifier, GitHub CI tests and distribution artifact publishing.
- Chinese manual, paper-cut contract, release-gate contract, detailed runbook.

### Correctly blocked external issues
- The supplied Second Life Workshop HUD game code currently fails some genuine
  rotation and 180° contact replay tests; Harness reports these failures.
- macOS Accessibility not yet authorized on the inspected Mac: native OS input
  is BLOCKED and will not be forged or silently bypassed.
- Full commercial 2.5D A4 paper tearing evidence is absent from the inspected
  HUD Unity branch; logic-only PaperTrial tests never certify the full scene.
- Self-hosted Metal Player + native input + paper + performance on one matching
  commit are needed before any **game Release Gate PASS**.

## v0.2.0-alpha.1

- Historical Unity NUnit/PNG/QA22 evidence checks, SHA snapshots,
  strict task gates and scenario plan, Coplay MCP tool discovery.
