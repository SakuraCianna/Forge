# Forge 发布流程

本文档记录本地打包和发布前检查流程。当前默认只生成本机产物, 不自动上传或发布。

## 发布前检查

1. 确认工作树干净, 并检查本次发布包含的变更

```powershell
git status --short
```

2. 运行完整发布检查

```powershell
npm run release:check
```

该命令会依次运行 ESLint, Vitest 和 Electron/Vite 构建。

## 生成本地解包目录

```powershell
npm run package:dir
```

产物会输出到 `release/win-unpacked`。这个目录适合本地冒烟测试, 不适合作为最终安装包分发。

## 生成 Windows 安装包

```powershell
npm run dist:win
```

该命令会生成 x64 NSIS 安装包, 并通过 `--publish never` 禁止自动发布。安装包输出到 `release` 目录。

## 冒烟测试清单

- 打开 `release/win-unpacked/Forge.exe`, 确认应用能启动
- 新建或打开项目, 确认项目扫描和文件预览正常
- 拉取模型列表, 确认 Provider 错误提示不会挤压按钮
- 运行一条安全命令, 确认命令历史、取消和复制输出正常
- 生成文件修改, 确认逐块接受或拒绝 diff 能更新草稿

## 发布注意事项

- 当前 Windows 构建未接入代码签名, 因此用户首次安装可能看到系统安全提示
- 不要在未检查产物前上传安装包
- 如果未来要接入自动发布, 先新增独立 CI 流程并把 `--publish never` 调整为明确的发布策略
