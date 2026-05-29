# Forge 发布流程

Forge 使用 GitHub Releases 发布 Windows `.msi` 安装程序。

## 自动发布

1. 确认本地检查通过:

```powershell
npm test
npm run lint
npm run build
```

2. 创建并推送版本标签:

```powershell
git tag v0.1.1
git push origin v0.1.1
```

3. GitHub Actions 会自动执行 `.github/workflows/release.yml`:

- 安装依赖
- 运行测试和 lint
- 执行 `npm run dist:win`
- 使用当前 tag 创建 GitHub Release
- 上传 `release` 目录中的 `.msi` 安装程序

GitHub 会为每个 tag 自动显示 `Source code (zip)` 和 `Source code (tar.gz)`。这是 GitHub 的默认源码归档, 不是 Forge 的安装包。用户应下载 Release assets 中的 `.msi` 文件。

## 版本号

当前版本号来自 `package.json`。发布前应确保 tag 与 `package.json` 中的版本一致, 例如 `0.1.1` 对应 `v0.1.1`。

## 注意事项

- 当前 Windows 构建未配置代码签名
- 当前图标是临时 Forge 图标, 后续可以替换为正式品牌图标
- 不要手动上传未经过测试和构建的 `.msi` 安装包
- 如果 GitHub Actions 失败, 先修复 CI 后再重新推送新的 tag
