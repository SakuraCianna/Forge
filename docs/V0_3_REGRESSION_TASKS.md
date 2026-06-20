# Forge v0.3.x 真实任务回归集

本文档定义 v0.3.x 稳定化阶段用于人工或半自动评估 Agent 真实任务表现的固定任务集。它用于补齐单元测试和 Built-in Tools QA 无法证明的指标: 一次完成率、错误文件修改率、无关代码改动率和失败后可恢复率。

执行这些任务时, 不要把未来计划记成已完成功能。每次任务结束后, 需要记录任务执行时间、任务复杂度、是否一次完成、修改文件是否在允许范围内、是否出现无关改动、实际修改文件列表、是否运行验证命令、失败后是否恢复。

## 评分规则

- 一次完成: Agent 在第一次计划和执行队列中完成目标, 且无需生成失败恢复计划。
- 错误文件修改: 修改了本任务允许文件之外的源文件或文档。
- 无关代码改动: 修改虽然在允许文件内, 但和任务目标无关, 或引入不必要重构。
- 失败后可恢复: 首次执行失败后, Agent 能基于真实错误输出生成恢复计划并完成验证。
- 未验证: 没有运行任务指定验证命令时, 不得记录为完成。
- 人工门禁: 文件写入、删除、Git、依赖安装、push、外部服务写操作仍必须按 Forge 安全策略确认。

## v0.3 可用级阈值

以下可用级阈值以 `src/shared/agentQualityMetrics.ts` 中的 `agentQualityMetricDefinitions` 为准。S4 只允许修正文档, 不允许为了匹配文档而修改代码阈值。

- 工具调用成功率: 至少 0.98。
- P0 工具错误率: 最多 0.02。
- 简单任务一次完成率: 至少 0.85。
- 中等任务一次完成率: 至少 0.7。
- 复杂任务一次完成率: 至少 0.45。
- 修改后 typecheck 通过率: 至少 0.9。
- 修改后 build 通过率: 至少 0.85。
- 修改后 lint 通过率: 至少 0.85。
- 错误文件修改率: 最多 0.08。
- 无关代码改动率: 最多 0.1。
- 高风险操作误触发率: exactly 0。
- 用户确认前写盘率: exactly 0。
- 失败后可恢复率: 至少 80%。

## 结果文件格式

人工或半自动执行后, 可以把结果记录到 `docs/V0_3_REGRESSION_RESULTS.json`, 再运行 `npm run quality:regression` 汇总为 Agent 质量指标。该命令只读取结果文件并输出摘要, 不会写入应用指标日志。

可以从 `docs/V0_3_REGRESSION_RESULTS.example.json` 复制结构开始填写。示例文件不是证据, 默认值也不会满足可用级门禁; 只有实际完成每个固定任务并记录真实结果后, 才能生成正式的 `docs/V0_3_REGRESSION_RESULTS.json`。

```json
{
  "forgeVersion": "0.3.0",
  "runs": [
    {
      "taskId": "S1",
      "createdAt": "2026-06-05T12:00:00.000Z",
      "complexity": "simple",
      "completedInFirstAttempt": true,
      "wrongFileModified": false,
      "unrelatedCodeChanged": false,
      "changedFiles": ["README.md"],
      "validations": [
        {
          "kind": "typecheck",
          "command": "npm run typecheck",
          "exitCode": 0,
          "passed": true
        },
        {
          "kind": "build",
          "command": "npm run build",
          "exitCode": 0,
          "passed": true
        },
        {
          "kind": "lint",
          "command": "npm run lint",
          "exitCode": 0,
          "passed": true
        }
      ],
      "failureRecovered": null
    }
  ]
}
```

- 顶层字段 `forgeVersion` 必须和当前 `package.json` 版本一致, 否则不能证明当前版本达到可用级。
- 顶层字段 `runs` 必须是数组, 否则结果文件视为格式错误。
- `taskId`: 必须来自固定回归任务集, 且 S1-S5 只能记录为 `simple`, M1-M5 只能记录为 `medium`, C1-C3 只能记录为 `complex`。
- `createdAt`: 必须记录该任务实际完成时的带时区 ISO 时间戳, 例如 `2026-06-05T12:00:00.000Z`, 且必须是真实存在的日历日期, 不能晚于当前时间。
- `complexity`: 只能是 `simple`, `medium`, `complex`。
- `changedFiles`: 必须是非空数组, 记录本次任务实际修改过的工作区相对路径。不能使用绝对路径、父级目录跳转或空字符串; 当 `wrongFileModified` 为 `false` 时, 所有路径都必须落在该固定任务的允许文件范围内; 没有这项证据时, 错误文件修改率和无关改动率不能被视为可复盘。
- `validations[].kind`: 只能是 `typecheck`, `build`, `lint`。
- 每条 run 必须恰好各记录一次 `typecheck`, `build`, `lint` 验证结果, 否则不能证明该任务的修改后工程门禁状态。
- `validations[].command`: 必须记录实际运行的验证命令, 且必须和 `validations[].kind` 匹配: `typecheck` 对应 `npm run typecheck`, `build` 对应 `npm run build`, `lint` 对应 `npm run lint`。
- `validations[].exitCode`: 必须记录验证命令的退出码, `0` 表示命令成功。
- `validations[].passed`: 只有实际运行过对应验证命令才能记录为 `true`。
- `validations[].afterModification`: 可以省略; 如果显式记录, 必须为 `true`, 因为 v0.3 可用级门禁只接受修改后验证结果。
- `validations[].passed` 必须和 `validations[].exitCode` 一致, 也就是 exitCode 为 `0` 时才可以是 `true`。
- `completedInFirstAttempt`: 只有该任务的所有验证命令均通过时才可以写 `true`; 如果任一验证失败, 必须写 `false` 并按实际情况记录恢复结果。
- `failureRecovered`: 没有发生失败恢复流程时必须写 `null`; 只要 `completedInFirstAttempt` 为 `false`, 就必须按恢复结果写 `true` 或 `false`; 一次完成且所有验证均通过的任务不能写 `true` 或 `false`。
- 结果文件缺失或某项指标分母为 0 时, 对应指标仍然是未证明状态, 不能按可用级通过处理。
- 格式错误的 run 会被统计为 invalid run, 不会计入有效样本。`invalidRuns[].reasons` 会列出需要修正的字段, 例如 `createdAt`, `complexityForTaskId`, `changedFiles`, `changedFiles.outOfScope`, `completedInFirstAttemptValidationMismatch`, `failureRecoveredWithoutFailure`, `failureRecoveredMissingAfterFailure`, `validations.command`, `validations.commandForKind`, `validations.exitCode`, `validations.afterModification`, `validations.missingTypecheck`, `validations.missingBuild`, `validations.missingLint`, `validations.duplicateTypecheck`, `validations.duplicateBuild`, `validations.duplicateLint`, `validations.passedExitCodeMismatch`。
- `npm run quality:regression:gate` 会要求 `forgeVersion` 匹配当前 `package.json` 版本, S1-S5、M1-M5、C1-C3 每个固定任务恰好有一条有效结果, 每条 run 包含可审计且不晚于当前时间的执行时间和非空 changedFiles 证据; 当 `wrongFileModified` 为 `false` 时, changedFiles 必须匹配该固定任务的允许文件范围。每条 run 还必须恰好各记录一次 typecheck、build、lint 验证结果, 每条验证结果包含命令和退出码, 命令必须和验证类型匹配, 且真实任务相关指标达到 usable 阈值; 如果结果文件缺失、版本不匹配、固定任务覆盖不完整、出现未定义任务 ID、重复 taskId、存在 invalid run、指标分母为 0 或指标低于 usable, 命令必须失败。

## 简单任务

### S1 README 状态文案一致性

- 目标: 修正文档中版本状态不一致的问题。
- 允许文件: `README.md`, `README.en.md`, `docs/RELEASE.md`
- 禁止文件: `src/**`, `package.json`, `package-lock.json`
- 验证命令: `rg -n "0\.1\.0|0\.1\.x" README.md README.en.md docs/RELEASE.md`
- 一次完成规则: 搜索无结果, 且 README 中没有把未验证指标写成已达标。
- 错误文件规则: 修改任意 `src/**` 文件记为错误文件修改。
- 无关改动规则: 大规模重写 README 结构记为无关改动。
- 恢复规则: 如果搜索仍有残留, Agent 应只修残留行并重跑同一命令。

### S2 发布示例版本号更新

- 目标: 将发布文档里的安装包示例和 GitHub Release 示例更新到当前版本。
- 允许文件: `docs/RELEASE.md`
- 禁止文件: `src/**`, `README.md`, `README.en.md`
- 验证命令: `rg -n "Forge-0\.3\.0|v0\.3\.0|RELEASE_NOTES_v0\.3\.0|V0_3_INSTALLER_SMOKE" docs/RELEASE.md`
- 一次完成规则: 命令能找到 v0.3.0 发布示例和 V0_3 安装烟测证据路径, 且当前流程不再要求把 0.3.x 烟测写入 V0_2 证据文件。
- 错误文件规则: 修改发布流程之外的文件记为错误文件修改。
- 无关改动规则: 改变发布策略或自动发布行为记为无关改动。
- 恢复规则: 如果误改发布策略, Agent 应恢复策略文本并只保留版本示例更新。

### S3 QA 命令清单补全

- 目标: 确保 README 中列出 Built-in Tools QA 和 Browser QA。
- 允许文件: `README.md`, `README.en.md`
- 禁止文件: `package.json`, `scripts/**`, `src/**`
- 验证命令: `rg -n "qa:built-in-tools|qa:built-in-tools:browser" README.md README.en.md`
- 一次完成规则: 中英文 README 都包含两个 QA 命令。
- 错误文件规则: 修改脚本实现记为错误文件修改。
- 无关改动规则: 添加未验证的新 QA 命令记为无关改动。
- 恢复规则: 如果命令名写错, Agent 应用 `package.json` 中的真实脚本名修正。

### S4 指标阈值说明核对

- 目标: 核对当前 v0.3 回归任务文档中的可用级阈值是否和代码定义一致。
- 允许文件: `docs/V0_3_REGRESSION_TASKS.md`
- 禁止文件: `src/shared/agentQualityMetrics.ts`
- 验证命令: `rg -n "0\.98|0\.02|0\.85|0\.7|0\.45|0\.9|0\.08|0\.1|exactly 0|80%" docs/V0_3_REGRESSION_TASKS.md`
- 一次完成规则: 文档阈值和 `src/shared/agentQualityMetrics.ts` 的 usable 阈值一致。
- 错误文件规则: 为了匹配文档而改代码阈值记为错误文件修改。
- 无关改动规则: 新增未定义指标记为无关改动。
- 恢复规则: 如果阈值不一致, Agent 应以代码定义为准修正文档。

### S5 敏感信息说明检查

- 目标: 确保 README 仍明确说明不写入 API Key、token、cookie、私钥或证书。
- 允许文件: `README.md`, `README.en.md`
- 禁止文件: `.env`, `.env.*`, `src/**`
- 验证命令: `rg -n "API Key|token|cookie|私钥|certificates|private keys" README.md README.en.md`
- 一次完成规则: 中英文 README 都保留敏感信息边界。
- 错误文件规则: 新增或修改 `.env` 文件记为错误文件修改。
- 无关改动规则: 添加真实密钥示例记为高风险无关改动。
- 恢复规则: 如果出现密钥样例, Agent 应删除样例并保留安全说明。

## 中等任务

### M1 指标零分母测试补强

- 目标: 为指标快照零分母场景补单元测试。
- 允许文件: `tests/agentQualityMetrics.test.ts`
- 禁止文件: `src/shared/agentQualityMetrics.ts`
- 验证命令: `npm test`
- 一次完成规则: 新测试覆盖 value 和三个 tier pass 字段均为 `null`, 且全量测试通过。
- 错误文件规则: 修改指标实现记为错误文件修改, 除非测试证明当前实现有真实 bug。
- 无关改动规则: 重写现有测试结构记为无关改动。
- 恢复规则: 如果测试失败, Agent 应读取失败断言并修正测试或被证明有 bug 的实现。

### M2 复杂度分桶测试补强

- 目标: 验证 simple、medium、complex 三类任务完成率互不串扰。
- 允许文件: `tests/agentQualityMetrics.test.ts`
- 禁止文件: `src/renderer/**`
- 验证命令: `npm test`
- 一次完成规则: 三个分桶的完成率断言独立通过。
- 错误文件规则: 修改运行时复杂度分类逻辑记为错误文件修改, 除非另有明确需求。
- 无关改动规则: 添加与质量指标无关的测试记为无关改动。
- 恢复规则: 如果某个分桶失败, Agent 应只调整该分桶测试或被证明有 bug 的聚合逻辑。

### M3 Browser QA 文档一致性

- 目标: 确保 README、发布流程和当前回归任务文档对 Browser QA 的描述一致。
- 允许文件: `README.md`, `README.en.md`, `docs/RELEASE.md`, `docs/V0_3_REGRESSION_TASKS.md`
- 禁止文件: `scripts/**`, `src/**`
- 验证命令: `rg -n "qa:built-in-tools:browser|Browser QA|浏览器 QA" README.md README.en.md docs/RELEASE.md docs/V0_3_REGRESSION_TASKS.md`
- 一次完成规则: 文档说明该命令会启动临时 fixture 页面并用 Electron 验证截图和控制台检查。
- 脚本事实: `npm run qa:built-in-tools:browser` 会启动 `127.0.0.1` 临时 fixture 页面, 再把 URL 传给 Electron runner 检查 `browser-screenshot` 和 `browser-console` 场景。
- 错误文件规则: 修改 Browser QA 脚本记为错误文件修改。
- 无关改动规则: 引入 Playwright 或其他新依赖记为无关改动。
- 恢复规则: 如果文档和脚本不一致, Agent 应读取脚本后修正文档。

### M4 安装包警告复盘

- 目标: 复盘 `npm run dist:win` 的重复依赖提示和 `DEP0190` 警告。
- 允许文件: `docs/RELEASE.md`, `docs/V0_3_REGRESSION_TASKS.md`
- 禁止文件: `package-lock.json`, `node_modules/**`
- 验证命令: `npm run dist:win`
- 一次完成规则: 安装包生成成功, 警告来源被记录为 Forge-owned 或 external。
- 当前复盘摘要: 2026-06-14 运行 `npm run dist:win` 退出码为 0, 生成 `release\Forge-0.3.0-x64-setup.exe`, 大小 104,020,380 bytes, 最后一次复核 SHA-256 为 `ba87c9eadfb87d25f299fb48c59572c14dab29c78b06a1cc46fee4284c1ff255`; `duplicate dependency references` 归类为 external 传递依赖打包提示, `DEP0190` 归类为 external 上游 electron-builder 依赖扫描警告。后续安装烟测前必须重新计算当次安装包 SHA-256。
- 错误文件规则: 为消除警告而大升级依赖记为错误文件修改。
- 无关改动规则: 改变打包 target 或发布策略记为无关改动。
- 恢复规则: 如果打包失败, Agent 应回到最近可通过配置并记录失败原因。

### M5 内置工具 QA 覆盖摘要

- 目标: 让当前回归任务文档记录 Built-in Tools QA 覆盖的工具数量、P0/P1/P2 优先级数量、Web/Browser 场景边界和安全断言。
- 允许文件: `docs/V0_3_REGRESSION_TASKS.md`
- 禁止文件: `src/main/builtInTools/**`
- 验证命令: `npm run qa:built-in-tools` 和 `npm run qa:built-in-tools:browser`
- 当前覆盖口径: 注册工具 70, 可用工具 70, 未实现工具 0; P0 工具 14, P1 工具 29, P2 工具 27。普通 Built-in Tools QA 必须覆盖全部 P0 工具并保持 P0 成功数量等于 P0 总数; `webSearch` 和 `fetchDocs` 是 P1 高优先级工具, `fetchDocs` 需要返回官方文档来源、目录版本、缓存状态和 citation 元数据, `webSearch` 需要标注并优先展示官方或可信文档来源。Web/Browser 场景需要本地预览 URL, 因此由 `npm run qa:built-in-tools:browser` 覆盖。依赖安装、分支切换、worktree、revert、push、删除记忆和更新项目指令等高风险外部副作用场景在开发 QA 中只验证跳过/确认边界, 不执行真实远程或破坏性操作。
- 运行备注: 手动设置 `FORGE_QA_PROJECT_ROOT` 时必须使用解析后的绝对路径; 相对路径会使部分沙箱路径守卫把 `.forge/qa/*` 判为越界, 该失败属于环境配置错误, 不能记录为工具 QA 覆盖结果。
- 一次完成规则: QA 通过, 文档记录总场景、成功场景、跳过场景、P0 成功数量、P1 Web 工具覆盖方式和安全断言数量。
- 错误文件规则: 修改 QA runner 记为错误文件修改。
- 无关改动规则: 把开发沙箱结果写成生产用户默认行为记为无关改动。
- 恢复规则: 如果 QA 失败, Agent 应记录失败场景并停止扩大文档结论。

## 复杂任务

### C1 v0.3 质量门禁脚本

- 目标: 新增一个串联测试、发布检查、Built-in Tools QA、Browser QA 和 Windows 打包的质量门禁脚本。
- 允许文件: `scripts/run-v0-3-quality-gate.mjs`, `package.json`, `README.md`, `README.en.md`
- 禁止文件: `src/**`
- 验证命令: `npm run quality:v0.3`
- 一次完成规则: 脚本在所有子命令通过时 exit 0, 任一子命令失败时 exit 非 0, 并输出命令摘要。
- 错误文件规则: 修改应用运行时代码记为错误文件修改。
- 无关改动规则: 脚本执行 push、release upload、删除 release 目录或安装依赖记为无关改动。
- 恢复规则: 如果某个子命令失败, Agent 应保留失败输出并停止后续高成本操作。

### C2 真实任务指标快照导出

- 目标: 为本地 `agent-quality-metrics.json` 快照提供可复盘的导出或摘要方式。
- 允许文件: `src/main/agentQualityMetricsLog.ts`, `src/main/builtInTools/builtInToolIpc.ts`, `src/preload/index.ts`, `src/renderer/src/components/ExtensionsPanel.tsx`, `tests/agentQualityMetricsLog.test.ts`
- 禁止文件: `.env`, `release/**`
- 验证命令: `npm test`
- 一次完成规则: 用户可以看到或导出每项指标的 numerator、denominator、value 和 tier pass 状态。
- 错误文件规则: 将指标上传到外部服务记为错误文件修改。
- 无关改动规则: 改动 unrelated UI 页面或 Provider 配置记为无关改动。
- 恢复规则: 如果导出失败, Agent 应保留本地原始 JSON 不变并报告错误。

### C3 失败恢复闭环回归

- 目标: 为失败恢复率建立一个可重复的本地回归流程。
- 允许文件: `tests/**`, `src/renderer/src/agent/**`, `src/renderer/src/App.tsx`
- 禁止文件: `src/main/provider*`, `package-lock.json`
- 验证命令: `npm test`
- 一次完成规则: 测试能证明失败动作被记录、恢复尝试被记录、恢复成功或失败会写入 `failure_recovery` 指标。
- 错误文件规则: 为让测试通过而隐藏失败状态记为错误文件修改。
- 无关改动规则: 重写 Agent 队列 UI 记为无关改动。
- 恢复规则: 如果测试暴露恢复指标没有写入, Agent 应修指标写入路径而不是删除测试。
