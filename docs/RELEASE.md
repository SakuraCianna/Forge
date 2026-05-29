# Forge 发布流程

Forge 使用 GitHub Releases 发布 Windows 安装包和压缩包。

## 自动发布

1. 确认本地检查通过:

```powershell
npm test
npm run lint
npm run build
```

2. 创建并推送版本标签:

```powershell
git tag v0.1.0
git push origin v0.1.0
```

3. GitHub Actions 会自动执行 `.github/workflows/release.yml`:

- 安装依赖
- 运行测试和 lint
- 执行 `npm run dist:win`
- 使用当前 tag 创建 GitHub Release
- 上传 `release` 目录中的安装包和压缩包

## 版本号

当前版本号来自 `package.json`。发布前应确保 tag 与 `package.json` 中的版本一致, 例如 `0.1.0` 对应 `v0.1.0`。

## 注意事项

- 当前 Windows 构建未配置代码签名
- 不要手动上传未经过测试和构建的安装包
- 如果 GitHub Actions 失败, 先修复 CI 后再重新推送新的 tag
