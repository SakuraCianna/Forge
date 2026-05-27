# Forge

Forge 是一个开源的本地 AI 代码编辑器桌面应用原型, 定位接近 Codex 桌面应用的 Agent 工作台, 而不是 VS Code fork 或插件市场。

当前目标是先完成主体核心能力: 用户选择本地项目, 自带 API Key 和模型, 创建任务线程, 让 Agent 生成计划和文件修改建议, 再由用户在 Diff Review 中确认应用, 最后可显式创建 Git commit。

## 当前能力

- Electron + React + TypeScript 桌面应用
- 默认中文界面, 支持 English 切换
- OpenAI, Anthropic, Gemini, OpenRouter, OpenAI Compatible provider catalog
- API Key 本地安全存储, 不写入项目文件
- Provider Base URL 可编辑, 支持中转站
- 支持自动拉取模型和手动添加模型
- Codex 风格模型选择器, 保留智能档位和速度档位
- 本地项目选择, 文件索引, 文件预览
- 任务线程和执行日志
- Agent 计划生成
- Agent 针对当前文件生成完整修改建议
- 文件编辑, diff 预览, 用户确认应用
- 受控 PowerShell 命令执行
- Git 状态查看和显式 commit

## 本地运行

```powershell
npm install
npm run dev
```

构建检查:

```powershell
npm test
npm run typecheck
npm run build
```

## 使用流程

1. 在设置区保存 provider API Key
2. 如使用中转站, 修改对应 provider 的 Base URL
3. 点击拉取模型, 或手动添加模型 ID
4. 启用想在任务菜单中使用的模型
5. 选择本地项目目录
6. 输入任务并选择模型, 智能档位和速度档位
7. 等待 Agent 生成计划
8. 在文件预览区选择文件, 点击 AI 修改生成建议
9. 查看 diff, 点击应用修改
10. 运行必要命令验证
11. 输入提交信息并点击提交

## Provider 说明

Forge 内部把不同 provider 统一成自己的模型配置, 但实际请求仍按各家 API 分别适配:

- OpenAI: Responses API
- Anthropic: Messages API
- Gemini: generateContent API
- OpenAI Compatible: chat completions API

参考官方文档:

- [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses/create)
- [Anthropic Messages API](https://docs.claude.com/en/api/messages)
- [Gemini generateContent API](https://ai.google.dev/api/generate-content)

## 安全边界

- API Key 不进入 Git
- Forge 不自动 push
- Git commit 需要用户显式点击
- 文件修改先进入 diff preview, 用户确认后才写入
- 命令执行限制在用户选择的项目目录内

## 仍在推进

- 多文件级 Agent 修改计划
- 更细粒度的变更接受/拒绝
- 更完整的 provider 能力探测
- 终端体验升级
- 打包安装器和发布流程
