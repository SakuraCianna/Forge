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

## 生成 Windows 安装包

```powershell
npm run dist:win
```

该命令会生成 x64 NSIS 安装包, 并通过 `--publish never` 禁止 electron-builder 自动发布。安装包输出到 `release` 目录, 文件名类似 `Forge-0.1.1-x64-setup.exe`。

## GitHub Release 发布

1. 确认安装包已经生成

```powershell
Get-ChildItem release -Filter "*setup.exe"
```

2. 创建 tag 和 GitHub Release, 并上传安装包

```powershell
gh release create v0.1.1 release/Forge-0.1.1-x64-setup.exe --title "Forge v0.1.1" --notes-file release/RELEASE_NOTES_v0.1.1.md
```

如果 tag 已存在, 使用 `gh release upload v0.1.1 release/Forge-0.1.1-x64-setup.exe --clobber` 更新安装包。

## 冒烟测试清单

- 双击安装包, 确认安装流程可完成
- 启动 Forge, 确认应用能打开
- 新建或打开项目, 确认项目扫描和文件预览正常
- 拉取模型列表, 确认 Provider 错误提示不会挤压按钮
- 运行一条安全命令, 确认命令历史、取消和复制输出正常
- 生成文件修改, 确认逐块接受或拒绝 diff 能更新草稿

## 发布注意事项

- 当前 Windows 安装包未接入代码签名, 因此用户首次安装可能看到系统安全提示
- 不要在未检查产物前上传安装包
- 如果未来要接入自动发布, 先新增独立 CI 流程并把 `--publish never` 调整为明确的发布策略
