# Forge 发布流程

本文档记录面向普通 Windows 用户的安装包发布流程。当前只保留 NSIS 安装包作为分发产物, 用户下载后双击安装即可, 不需要 Node.js, npm 或源码。

## 发布前检查

1. 确认工作树干净, 并检查本次发布包含的变更

```powershell
git status --short
```

2. 运行完整发布检查

```powershell
npm run release:check
```

该命令会依次运行 ESLint 和 Electron/Vite 构建。

3. 运行 Built-in Tools 和 Browser QA

```powershell
npm run qa:built-in-tools
npm run qa:built-in-tools:browser
```

`npm run qa:built-in-tools:browser` 会临时启动本地 fixture 页面, 并用隐藏 Electron 窗口验证截图和页面控制台检查。发布流程和回归记录应使用这个真实脚本名, 不要写成临时别名。

## 生成 Windows 安装包

```powershell
npm run dist:win
```

该命令会生成 x64 NSIS 安装包, 并通过 `--publish never` 禁止 electron-builder 自动发布。安装包输出到 `release` 目录, 文件名类似 `Forge-0.2.0-x64-setup.exe`。

## GitHub Release 发布

1. 确认安装包已经生成

```powershell
Get-ChildItem release -Filter "*setup.exe"
```

2. 创建 tag 和 GitHub Release, 并上传安装包

```powershell
gh release create v0.2.0 release/Forge-0.2.0-x64-setup.exe --title "Forge v0.2.0" --notes-file release/RELEASE_NOTES_v0.2.0.md
```

如果 tag 已存在, 使用 `gh release upload v0.2.0 release/Forge-0.2.0-x64-setup.exe --clobber` 更新安装包。

上述 `v0.2.0`, `Forge-0.2.0-x64-setup.exe` 和 `RELEASE_NOTES_v0.2.0.md` 示例必须和 `package.json` 当前版本保持一致; 升级版本时只同步示例版本号, 不改变发布策略或自动发布行为。

## 冒烟测试清单

- 双击安装包, 确认安装流程可完成
- 启动 Forge, 确认应用能打开
- 新建或打开项目, 确认项目扫描和文件预览正常
- 运行一条安全命令, 确认命令历史、取消和复制输出正常
- 生成文件修改, 确认逐块接受或拒绝 diff 能更新草稿
- 打开 Git 状态视图, 确认可查看当前仓库状态
- 尝试高风险操作, 确认执行前必须人工确认

完成人工烟测后, 将结果记录到 `docs\V0_2_INSTALLER_SMOKE.json`, 再运行:

```powershell
npm run quality:installer-smoke
```

可以从 `docs\V0_2_INSTALLER_SMOKE.example.json` 复制结构开始填写。示例文件不是证据, 默认值不会满足安装烟测门禁; 只有实际安装并完成清单后, 才能生成正式的 `docs\V0_2_INSTALLER_SMOKE.json`。

记录烟测报告前, 先绑定本次实际测试的安装包哈希:

```powershell
(Get-FileHash -Algorithm SHA256 -LiteralPath "release\Forge-0.2.0-x64-setup.exe").Hash.ToLowerInvariant()
```

记录格式:

```json
{
  "forgeVersion": "0.2.0",
  "installerPath": "release/Forge-0.2.0-x64-setup.exe",
  "installerSha256": "填写上一步得到的 sha256",
  "testedAt": "2026-06-05T12:00:00.000Z",
  "platform": "Windows 11",
  "checks": {
    "appLaunches": true,
    "projectOpens": true,
    "filePreviewWorks": true,
    "safeCommandRuns": true,
    "generatedDiffAcceptRejectWorks": true,
    "gitStatusViewOpens": true,
    "highRiskRequiresConfirmation": true
  }
}
```

报告顶层必须是 JSON object, 且 `checks` 必须是 object。其中 `forgeVersion`, `installerPath`, `installerSha256`, `testedAt`, `platform` 是必填元数据。`forgeVersion` 必须和当前 `package.json` 版本一致; `testedAt` 必须是带时区的 ISO 时间戳, 例如 `2026-06-05T12:00:00.000Z`, 且必须是真实存在的日历日期, 不能晚于当前时间; `platform` 必须明确以 Windows 开头, 例如 `Windows 11`; `installerPath` 必须是当前工作区内的相对路径 `release/Forge-<当前版本>-x64-setup.exe`, 不能指向工作区外的同名安装包; `installerSha256` 必须和该安装包当前内容一致。所有 `checks` 字段都必须存在且为 `true`, 否则 `npm run quality:installer-smoke` 会失败。

可用级候选版本需要同时通过真实任务回归门禁、安装包烟测门禁和工程门禁。先运行 `npm run quality:v0.2` 或 `npm run dist:win` 生成当前安装包, 再安装烟测并记录当前 SHA-256。总门禁会先运行可用性证据预检并一次列出所有 blocker; 证据通过后, 再执行真实任务回归门禁、安装包烟测门禁以及不重写安装包的完整工程检查, 避免在烟测后重新打包导致 `installerSha256` 失效:

```powershell
npm run quality:v0.2:usable
```

## 当前已知打包警告

- 2026-06-06 复跑 `npm run dist:win` 退出码为 0, 安装包 `release\Forge-0.2.0-x64-setup.exe` 生成成功, 下列两个警告仍出现。
- `duplicate dependency references`: 当前由 electron-builder 在扫描 npm 依赖时输出, 安装包仍可生成。后续优化依赖树时再处理, 不为了消除该提示做依赖大升级。
- `DEP0190`: 当前出现在 electron-builder 打包阶段的子进程调用警告中。Forge 自有质量门禁脚本使用 `shell: false` 和 npm CLI 文件执行命令, 没有为规避该警告改动运行时代码。

## 发布注意事项

- 当前 Windows 安装包未接入代码签名, 因此用户首次安装可能看到系统安全提示
- 不要在未检查产物前上传安装包
- 如果未来要接入自动发布, 先新增独立 CI 流程并把 `--publish never` 调整为明确的发布策略
