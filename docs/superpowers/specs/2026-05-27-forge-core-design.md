# Forge 核心产品设计草案

日期: 2026-05-27
状态: 已确认, 可进入实现计划

## 1. 产品定位

Forge 是一个开源的本地 AI 开发锻造台, 形态接近 Codex 桌面应用, 而不是 VS Code fork 或插件市场。

Forge 的目标是让用户在本地项目中创建开发任务, 由 Agent 理解代码仓库, 制定计划, 修改文件, 执行命令, 展示日志和 diff, 最后由用户确认是否接受改动。

第一阶段不做收费订阅, 不托管用户模型服务, 不建设插件市场。用户自带 API Key, 自己选择模型和推理强度。

## 2. 核心原则

- 开源优先, 用户自带 API Key
- 本地优先, 不依赖云端账号和任务同步
- 任务级 Agent 工作流, 不是完整 IDE
- 所有代码修改必须可审查, 可撤销, 可拒绝
- 只显示用户已配置并启用的模型
- 不提供自动智能档位, 用户必须明确选择模型和智能程度
- 模型能力统一到 Forge UI, 但底层按 provider 分别适配
- 默认中文界面, 支持中英双语切换

## 3. MVP 范围

第一版只做主体核心内容:

- 项目选择
- 任务线程
- Agent 计划生成
- 文件读取和修改
- 命令执行
- 执行日志
- Diff Review
- 模型设置
- Codex 风格模型选择器
- Git commit 支持
- 中英双语界面, 默认中文

第一版暂不做:

- 插件市场
- VS Code fork
- 云端账号
- 云端任务同步
- 多人协作
- 远程 sandbox
- 付费订阅
- 内置模型额度售卖
- 语音输入

## 4. 推荐技术栈

桌面端:

- Electron
- React
- TypeScript
- Tailwind CSS
- shadcn/ui

编辑和差异查看:

- Monaco Editor
- Git diff parser

终端:

- xterm.js
- node-pty

Agent Runtime:

- Node.js worker 或 child_process
- 文件系统访问
- Git 命令调用
- ripgrep 项目搜索
- tree-sitter 代码结构分析

模型层:

- OpenAI adapter
- Anthropic adapter
- Gemini adapter
- OpenAI Compatible adapter
- Provider capability registry
- Provider catalog, 借鉴 OpenCode 和 Models.dev 的 provider/model 元数据组织方式

## 5. 主要页面

### Projects

用户选择本地项目目录。Forge 记录最近打开的项目, 但不上传项目内容。

### Threads

一个需求对应一个任务线程。线程中包含用户需求, Agent 计划, 执行日志, 文件改动和最终结果。

### Plan

Agent 在修改前生成执行计划。用户可以继续对话调整计划, 也可以批准执行。

### Run Log

展示 Agent 的关键执行过程:

- 读取了哪些文件
- 准备修改哪些文件
- 运行了哪些命令
- 命令是否成功
- 遇到哪些错误
- 做了哪些修复

日志要偏工程化, 不展示冗长内部推理。

### Diff Review

展示所有文件改动。用户可以接受全部, 拒绝全部, 或按文件查看。

### Settings

管理 provider, API Key, Base URL, 模型列表, 模型能力检测和启用状态。

## 6. 模型系统

Forge 第一版支持两类 provider。

官方 Provider:

- OpenAI
- Anthropic
- Gemini

兼容 Provider:

- OpenRouter
- OpenAI Compatible
- 自定义中转站

每个 provider 支持:

- API Key
- Base URL
- Fetch Models
- Add Model Manually
- Enable / Disable
- Capability Test

Forge 第一版可以引入 OpenCode 或 Models.dev 风格的 provider catalog, 用于提供常见 provider 的名称, API 地址, 鉴权方式, 模型元数据和能力默认值。catalog 只作为初始元数据来源, 用户仍然只会在任务菜单中看到自己配置并启用的模型。

模型列表获取策略:

- OpenAI 调用 `/v1/models`
- Anthropic 调用官方 models list API
- Gemini 调用官方 models list API
- OpenRouter 调用 `/api/v1/models`
- OpenAI Compatible 优先尝试 `/v1/models`, 失败后允许手动添加
- Custom 只保证手动添加

## 7. 模型能力抽象

Forge 内部维护统一模型能力结构:

```ts
type ReasoningControl =
  | { type: "none" }
  | { type: "effort"; values: ("low" | "medium" | "high" | "xhigh")[] }
  | { type: "budget"; min: number; max: number };

type ForgeModel = {
  id: string;
  label: string;
  provider: "openai" | "anthropic" | "gemini" | "openai-compatible";
  modelName: string;
  enabled: boolean;
  capabilities: {
    reasoning: ReasoningControl;
    toolCalling: boolean | "unknown";
    streaming: boolean | "unknown";
    vision: boolean | "unknown";
    contextWindow?: number;
  };
  capabilitySource: "built-in" | "provider-api" | "probe" | "manual";
};
```

能力来源优先级:

1. Forge 内置能力表
2. Provider 元数据接口
3. 模型名规则推断
4. 轻量 probe 请求
5. 用户手动覆盖

如果模型不支持 reasoning, Forge 不发送 reasoning 参数, 并在 UI 中显示 `普通, 不可调`。

## 8. Codex 风格模型选择器

任务输入框旁显示当前选择:

```text
⚡ GPT-5.5  超高  快速  v
```

主菜单:

```text
智能
  低
  中
  高
  超高

────────

⚡ 当前模型 >
速度 >
```

模型二级菜单:

```text
模型
  ⚡ GPT-5.5
  ⚡ GPT-5.4
  GPT-5.4-Mini
  Claude Sonnet
  Gemini 2.5 Pro
  DeepSeek Reasoner
```

速度二级菜单:

```text
速度
  快速
  均衡
  谨慎
```

规则:

- 只显示用户已配置并启用的模型
- 不显示未配置的官方推荐模型
- 不显示 provider 返回但用户未启用的模型
- 不提供自动智能档位
- `⚡` 表示该模型支持 reasoning 或 thinking
- 智能控制模型推理强度
- 速度控制 Forge Agent 执行策略

## 9. 智能与速度的区别

智能:

- 低
- 中
- 高
- 超高

智能影响模型侧参数, 例如 reasoning effort, thinking level 或 thinking budget。

速度:

- 快速
- 均衡
- 谨慎

速度影响 Forge Agent 行为:

- 项目扫描范围
- 计划深度
- 修改前确认粒度
- 命令执行数量
- 测试和验证次数
- 命令超时时间
- 失败后的重试策略

示例:

- 高智能 + 快速: 模型深度思考, 但 Forge 少跑验证
- 低智能 + 谨慎: 模型低推理, 但 Forge 多做检查

## 10. API Key 存储

API Key 不写入项目文件, 不进入 Git, 不展示明文。

Electron 第一版可以使用系统加密能力保存 key。后续可升级为 OS keychain 方案。

设置页需要提供:

- 添加 key
- 测试连接
- 删除 key
- 替换 key
- 显示 key 尾号

## 11. Agent 执行流程

标准任务流程:

1. 用户选择项目
2. 用户输入任务
3. 用户选择模型, 智能档位和速度档位
4. Forge 扫描项目关键文件
5. Agent 生成计划
6. 用户确认计划
7. Agent 在受控环境中修改文件
8. Forge 运行必要命令
9. Agent 根据错误尝试修复
10. Forge 展示 diff
11. 用户接受或拒绝改动
12. 用户选择是否 commit

## 12. 安全边界

Forge 默认不允许 Agent 静默执行高风险操作。

需要用户确认的操作:

- 删除文件
- 修改 `.env`
- 修改密钥或支付配置
- 数据库迁移
- 执行未知脚本
- Git commit
- Git push

第一版允许 Agent 运行 install 命令, 例如 `npm install`, `pnpm install`, `yarn install`。install 命令必须出现在计划或执行日志中, 并且失败时不能通过删除功能或隐藏错误来绕过。

第一版不做自动 push。

## 13. Git 策略

MVP 直接在当前项目根目录工作并生成 diff, 不强制使用 Git worktree。设计上预留 worktree 隔离, 后续用于多任务并行和更强回滚能力。

推荐演进:

1. MVP: 当前目录 diff review
2. 稳定版: 每个任务一个 Git worktree
3. 后续: 多任务并行 worktree

如果项目不是 Git 仓库, Forge 仍然允许运行任务, 但 diff review 和回滚能力会受限。

## 14. 错误处理

模型错误:

- API Key 无效
- 模型不存在
- reasoning 参数不支持
- rate limit
- 上下文超限

命令错误:

- 命令不存在
- install 失败
- test 失败
- build 失败

文件错误:

- 权限不足
- 文件被外部修改
- 编码问题

处理原则:

- 错误对用户可见
- 能自动降级的降级
- 不能确定安全性的操作停止并请求确认
- 不为了通过检查删除功能或隐藏错误

## 15. 测试策略

单元测试:

- provider adapter
- reasoning 参数转换
- 模型能力检测
- 配置读写

集成测试:

- OpenAI Compatible mock server
- 模型拉取
- probe 降级
- Agent 文件修改
- diff 生成

端到端测试:

- 创建项目
- 添加模型
- 创建任务
- 执行命令
- 查看 diff
- 接受改动

## 16. 参考方向

- Codex 桌面应用: Agent 工作台形态
- OpenCode: provider 和模型目录思路
- OpenAI, Anthropic, Gemini: 官方模型 API 与 reasoning/thinking 能力
- OpenRouter: 中转站模型元数据和 supported parameters

## 17. 已确认决策

1. Forge MVP 直接在项目根目录工作, 使用当前工作区 diff review, 不强制 Git worktree
2. 第一版不做语音输入
3. 模型设置页可以引入 OpenCode 或 Models.dev 风格的 provider catalog
4. 第一版允许 Agent 运行 install 命令
5. 第一版内置中文和英文双语界面, 默认中文
