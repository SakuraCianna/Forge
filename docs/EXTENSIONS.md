# Forge Extensions

本文档说明 Forge v0.2.x 扩展系统的当前实现。扩展用于连接外部服务, 能读取、创建或修改外部系统中的真实数据。

## Skill 与 Extension

- Skill 是任务经验、提示词策略和工作流模板, 主要影响 Agent 如何思考和组织步骤。
- Extension 是能力模块, 连接邮件、日历、设计工具、代码托管等外部服务。
- Extension 更像 Forge 的手。它通过受控 Action 读取、创建或修改外部系统数据。
- 第三方 Skill 不会自动获得 Extension 权限。Agent 只有在扩展启用、权限允许且需要时经过确认, 才能调用 Extension。

## 架构

```text
src/shared/extensionTypes.ts       共享 manifest, 权限, 调用和日志类型
src/main/extensions/               主进程 Extension Runtime
src/main/extensionIpc.ts           渲染层到主进程的受控 IPC
src/preload/index.ts               window.forge.extensions API
src/renderer/src/state/extensions.ts
src/renderer/src/components/ExtensionsPanel.tsx
```

扩展注册、凭据读取和网络调用都在 Electron 主进程执行。渲染层只负责展示 Registry、配置权限、输入密钥、发起调用和处理确认。

## Extension Registry

Registry 负责:

- 注册内置 Extension Manifest。
- 读取和保存启用状态。
- 合并 Manifest、非敏感设置和密钥状态。
- 校验 Action 是否存在、扩展是否启用、凭据是否已配置。
- 根据权限模式和 Action 风险决定允许、拒绝或要求确认。
- 维护待确认调用 token, 防止高风险动作绕过 UI。

当前内置扩展:

- `qq-mail`: QQ Mail 邮件扩展。

## Manifest

Manifest 描述扩展能力:

- `id`, `name`, `description`, `version`, `category`, `builtIn`
- `auth.fields`: 需要保存的密钥字段
- `permissions`: 用户可配置的权限项
- `actions`: 可调用动作, 包含权限、风险、确认策略、输入和输出 schema

Action 风险分为:

- `read`: 读取外部数据
- `write`: 创建或修改外部数据
- `send`: 发送真实消息
- `delete`: 删除外部数据

确认策略分为:

- `never`: 不额外确认
- `ask`: 根据权限模式确认
- `always`: 始终要求二次确认

## Permission Model

每个权限可以设置为:

- `allow`: 允许直接执行
- `ask`: 执行前要求确认
- `deny`: 拒绝执行

`sendEmail` 的 Action 级策略是 `always`, 即使权限被设为 `allow`, 主进程仍会返回确认请求, 不会静默发送。

## Action Schema

Action 使用 JSON-like schema 描述输入。Agent 规划时会收到已启用扩展的 Action 摘要, 并生成 `invoke-extension` 动作:

```ts
{
  kind: "invoke-extension",
  extensionId: "qq-mail",
  extensionActionId: "searchEmails",
  extensionInput: {
    query: "invoice",
    limit: 10
  }
}
```

运行前 Forge 会再次检查 Agent Profile 工具权限、扩展启用状态、扩展权限模式和确认策略。

## Enable / Disable

扩展页面可以启用或禁用扩展。禁用后:

- 手动调用会失败。
- Agent 规划上下文不会把该扩展作为可用能力。
- 已存在的旧计划动作在运行时也会被主进程拒绝。

## 调用日志

扩展调用会写入本地日志:

- 扩展和动作名称
- 风险等级
- 线程 ID
- 输入摘要
- 输出摘要或错误
- 状态和时间戳

日志只保存摘要, 不保存授权码, 也不保存完整邮件正文。

## 敏感操作确认

当动作需要确认时, 主进程创建短期 token 并写入调用日志。渲染层必须通过 `confirmInvocation(token)` 才能继续执行。

Agent 调用高风险扩展动作时会:

1. 运行到 `invoke-extension`。
2. 主进程返回 `requiresConfirmation`。
3. Agent 队列暂停并写入确认项。
4. 用户在确认队列中批准。
5. 主进程使用 token 执行真实动作。
6. 结果摘要进入线程工具证据, 后续计划可以继续使用。

## QQ Mail 扩展

`qq-mail` 使用 QQ 邮箱授权码连接 IMAP/SMTP。

支持动作:

- `listInbox`: 读取最近收件箱摘要。
- `readEmail`: 按 IMAP UID 读取单封邮件正文和附件摘要。
- `searchEmails`: 在最近邮件摘要中按关键词、发件人和日期过滤。
- `createDraft`: 生成 MIME 并追加到草稿箱。
- `sendEmail`: 通过 SMTP 发送真实邮件, 始终要求用户确认。

连接参数:

- IMAP: `imap.qq.com`, SSL/TLS, `993`
- SMTP: `smtp.qq.com`, SSL/TLS, `465`

QQ Mail 凭据:

- 邮箱地址: QQ 邮箱地址
- 授权码: QQ 邮箱设置中开启 IMAP/SMTP 服务后生成的授权码, 不是 QQ 登录密码

## 限制

- 当前仅内置 QQ Mail, 还没有第三方 Extension 安装包格式。
- 当前日志是本地摘要日志, 不是完整审计数据库。
- 邮件附件只返回摘要, 不下载附件内容。
- `searchEmails` 会扫描最近一批邮件摘要, 不是服务端全文搜索。
- `createDraft` 会尝试常见草稿箱名称, 不同账号的文件夹命名可能仍需后续增强。

