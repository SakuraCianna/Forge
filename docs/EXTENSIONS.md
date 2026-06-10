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
- `github`: GitHub REST API 扩展。
- `gitlab`: GitLab REST API 扩展。
- `slack`: Slack Web API 扩展。
- `notion`: Notion API 扩展。
- `airtable`: Airtable Web API 扩展。
- `todoist`: Todoist API 扩展。
- `google-calendar`: Google Calendar API 扩展。
- `figma`: Figma REST API 扩展。
- `gmail`: Gmail API 扩展。
- `google-drive`: Google Drive API 扩展。
- `dropbox`: Dropbox API 扩展。
- `microsoft-365`: Microsoft Graph API 扩展。
- `linear`: Linear GraphQL API 扩展。
- `jira-cloud`: Jira Cloud API 扩展。
- `discord`: Discord API 扩展。

## Manifest

Manifest 描述扩展能力:

- `id`, `name`, `description`, `version`, `category`, `builtIn`
- `auth.fields`: 需要保存的密钥字段
- `auth.oauth`: 可选 OAuth 元数据, 用于网页登录授权
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

## 常用服务扩展

以下内置服务使用用户保存的 token 通过官方 REST API 调用。Forge 只保存密钥状态, 不会把 token 写入调用日志或线程上下文。写入、发送和创建类动作都设置为 `always` 确认, 即使权限被设为 `allow`, 主进程也会先返回确认 token。

### 网页登录授权

支持 OAuth 的内置扩展会在 manifest 中声明:

- 授权端点和 token 端点。
- `scope` 列表。
- access token 和 refresh token 写入的密钥字段。
- 产品方 OAuth client 配置, 或维护者专用的 client ID / client secret 字段。
- 是否支持 PKCE。
- redirect 模式。

Forge 当前实现了三类产品化授权路径:

1. 产品维护者在发布前为可本地回调的服务配置 OAuth app。Google Calendar、Gmail 和 Google Drive 默认使用 Forge 内置桌面 OAuth client ID。
2. GitHub 使用 device flow。Forge 打开本地说明页显示一次性验证码, 用户在 GitHub 官方页面输入验证码后, 主进程轮询 token endpoint 并保存 token。
3. GitLab、Slack、Notion、Airtable、Todoist、Figma、Dropbox、Microsoft 365、Jira Cloud 和 Discord 使用 brokered 模式。桌面端只打开 Forge 官方 OAuth 服务, 由服务端持有 client secret 并处理 HTTPS callback, 再把短期 broker code 回跳给本机 Forge。
4. 普通用户进入扩展页, 直接点击“网页登录授权”, 不需要自己创建 OAuth app、复制 client ID 或保存 client secret。
5. 对已声明 OAuth 的内置扩展, access token 和 refresh token 由网页登录授权自动写入本机安全存储, 扩展页不会再展示手动粘贴 token 的输入框。
6. 如果某个构建缺少产品方 OAuth 配置或 Forge OAuth broker, UI 会明确标注“当前构建未配置网页登录”, 这是维护者需要处理的发布配置问题。
7. loopback 和 brokered 模式下, 主进程在 `127.0.0.1` 随机端口启动短期 HTTP 回调监听。
8. Forge 生成 `state`, 支持的服务同时生成 PKCE `code_verifier` 和 `code_challenge`。
9. Forge 用系统浏览器打开官方授权页或 Forge OAuth 服务。
10. 服务或 broker 回跳到本地 callback 后, 主进程校验 `state`。
11. 主进程向官方 token endpoint 或 broker token endpoint 换取 token。
12. access token 和 refresh token 写入 Electron 主进程密钥库。
13. 扩展 Registry 刷新密钥状态, Agent 只看到动作 schema, 看不到 token。

不是所有服务都允许桌面端 loopback redirect。GitLab、Slack、Notion、Airtable、Todoist、Figma、Dropbox、Microsoft 365、Jira Cloud、Discord 等通常要求在服务后台预注册 HTTPS 回调地址或使用 confidential client。Forge 会在 UI 中标注这类服务需要 Forge 官方授权服务, 不会假装它们能直接用本地回调完成授权。

维护者配置项:

- `FORGE_GOOGLE_OAUTH_CLIENT_ID`: 覆盖内置 Google 桌面 OAuth client ID。
- `FORGE_GITHUB_OAUTH_CLIENT_ID`: 启用 GitHub device flow。
- `FORGE_LINEAR_OAUTH_CLIENT_ID`: 启用 Linear loopback + PKCE 授权。
- `FORGE_OAUTH_BROKER_BASE_URL`: 启用 GitLab、Slack、Notion、Airtable、Todoist、Figma、Dropbox、Microsoft 365、Jira Cloud 和 Discord 的 Forge brokered 授权入口。

不要把 client secret 写进桌面端代码或仓库; 需要 confidential client 的服务必须接入 Forge 官方 HTTPS 授权代理后再开放给普通用户。

参考官方做法:

- OpenAI Apps 的连接体验是用户选择 Connect 并完成 OAuth, 权限由连接时授权和工作区控制共同决定。
- OpenAI Apps SDK 的 MCP 授权推荐 authorization-code + PKCE, 由客户端触发浏览器授权并在后续请求中携带 Bearer token。
- Google installed apps 使用系统浏览器、本地 redirect URI、PKCE、`state` 和 token exchange。
- GitHub OAuth Apps 支持 device flow, 适合 CLI 和桌面应用这类不应保存 client secret 的场景。
- GitLab REST API 支持 OAuth 2.0 Bearer token, `read_user` 和 `read_api` 覆盖用户资料和只读 API 调用。
- Linear OAuth 支持 PKCE, refresh token 需要安全保存并用于后续刷新。
- Figma REST OAuth 需要配置 redirect URL; 对文件读取和评论读取分别使用 `file_content:read` 和 `file_comments:read` 等细粒度 scope。
- Notion token exchange 使用 HTTP Basic Authentication。
- Slack OAuth 要求 redirect URI 与 App Management 中的配置匹配, 且通常必须是 HTTPS。
- Airtable OAuth 常用读取 scope 包括 `schema.bases:read` 和 `data.records:read`。
- Todoist OAuth 的 `data:read_write` scope 覆盖读取项目/任务和创建任务。
- Dropbox OAuth 文档建议桌面端这类公开客户端使用 PKCE; 用户不应为使用产品而自行注册 Dropbox app, 产品维护者应只注册一次应用。
- Microsoft identity platform 通过 scope 请求 Microsoft Graph 权限, Forge 只请求 `User.Read`, `Mail.Read`, `Calendars.Read`, `Files.Read` 和 `offline_access`。

### GitHub

`github` 使用 GitHub personal access token 或 OAuth access token。网页登录授权使用 GitHub device flow, 需要维护者配置 `FORGE_GITHUB_OAUTH_CLIENT_ID`。

支持动作:

- `getAuthenticatedUser`: 读取当前 token 对应账号摘要。
- `listIssues`: 读取指定仓库 Issue 列表。
- `createIssue`: 在指定仓库创建 Issue, 始终要求确认。

建议 token scope:

- 读取仓库 Issue: 目标仓库只读 metadata / issues 权限。
- 创建 Issue: 目标仓库 issues 写权限。

### GitLab

`gitlab` 使用 GitLab OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getCurrentUser`: 读取当前 GitLab 用户摘要。
- `listProjects`: 读取当前用户参与的 GitLab 项目列表。
- `listProjectIssues`: 读取指定 GitLab 项目的 Issue 列表。

建议 OAuth scope:

- `read_user`
- `read_api`

### Slack

`slack` 使用 Slack app bot token。网页登录授权依赖 Forge brokered 授权服务。

支持动作:

- `listChannels`: 读取频道列表。
- `postMessage`: 向指定频道发送消息, 始终要求确认。

建议 bot scope:

- `channels:read`, `groups:read`
- `chat:write`

### Notion

`notion` 使用 Notion internal integration token 或 OAuth access token。目标页面或数据库需要在 Notion 中分享给该 integration。网页登录授权依赖 Forge brokered 授权服务。

支持动作:

- `searchPages`: 搜索已授权页面和数据库。
- `createDatabasePage`: 在指定数据库中创建页面, 始终要求确认。

### Airtable

`airtable` 使用 Airtable OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `listBases`: 读取当前授权账号可访问的 Airtable bases。
- `listRecords`: 读取指定 base 和 table 的记录摘要。

### Todoist

`todoist` 使用 Todoist OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `listProjects`: 读取 Todoist 项目列表。
- `listTasks`: 读取 Todoist 任务列表。
- `createTask`: 创建 Todoist 任务, 始终要求确认。

建议 OAuth scope:

- `data:read_write`

### Google Calendar

`google-calendar` 使用 Google Calendar API OAuth access token。

支持动作:

- `listEvents`: 读取指定日历事件列表。
- `createEvent`: 创建日历事件, 始终要求确认。

### Figma

`figma` 使用 Figma personal access token 或 OAuth access token。OAuth 模式通过 Forge brokered 授权接入。

支持动作:

- `getFile`: 读取 Figma 文件 JSON 摘要。
- `listComments`: 读取 Figma 文件评论。

### Gmail

`gmail` 使用 Gmail API OAuth access token, 也可以通过支持 loopback + PKCE 的网页登录授权保存 token。

支持动作:

- `getProfile`: 读取当前 Gmail 账号摘要。
- `listMessages`: 按 Gmail 搜索语法读取邮件 ID 和线程摘要。

### Google Drive

`google-drive` 使用 Google Drive API OAuth access token, 也可以通过支持 loopback + PKCE 的网页登录授权保存 token。

支持动作:

- `listFiles`: 搜索 Google Drive 文件列表。
- `getFileMetadata`: 读取指定文件元数据。

### Dropbox

`dropbox` 使用 Dropbox OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getCurrentAccount`: 读取当前 Dropbox 账号摘要。
- `listFolder`: 读取指定 Dropbox 文件夹条目摘要。

### Microsoft 365

`microsoft-365` 使用 Microsoft Graph OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getProfile`: 读取当前 Microsoft 365 账号资料。
- `listMessages`: 读取最近邮件摘要。
- `listEvents`: 读取日历事件摘要。
- `listDriveRoot`: 读取 OneDrive 根目录文件和文件夹摘要。

建议 Microsoft Graph delegated permission:

- `User.Read`
- `Mail.Read`
- `Calendars.Read`
- `Files.Read`
- `offline_access`

### Linear

`linear` 使用 Linear API token 或 OAuth access token。OAuth 模式支持 loopback + PKCE, 需要维护者配置 `FORGE_LINEAR_OAUTH_CLIENT_ID`。

支持动作:

- `getViewer`: 读取当前 Linear 用户摘要。
- `listIssues`: 读取最近更新的 Linear Issue 列表。

### Jira Cloud

`jira-cloud` 使用 Atlassian OAuth access token。网页登录授权依赖 Forge brokered 授权服务。

支持动作:

- `listAccessibleResources`: 读取当前 token 可访问的 Atlassian Cloud 资源。
- `searchIssues`: 在指定 Jira Cloud 站点按 JQL 搜索 Issue。

### Discord

`discord` 使用 Discord OAuth access token。网页登录授权依赖 Forge brokered 授权服务。

支持动作:

- `getCurrentUser`: 读取当前 Discord 用户摘要。
- `listGuilds`: 读取当前用户加入的服务器列表。

## 限制

- OAuth 基座当前支持 `loopback`, `device-code` 和 `brokered` 三种模式。brokered 模式需要外部 Forge OAuth 服务真实部署后才可用。
- 当前保存 refresh token, 但还没有后台自动刷新 access token。
- 当前还没有第三方 Extension 安装包格式。
- 当前日志是本地摘要日志, 不是完整审计数据库。
- 邮件附件只返回摘要, 不下载附件内容。
- `searchEmails` 会扫描最近一批邮件摘要, 不是服务端全文搜索。
- `createDraft` 会尝试常见草稿箱名称, 不同账号的文件夹命名可能仍需后续增强。
- 非 QQ Mail 的内置服务目前主要供 Agent 调用和权限链路使用, 扩展页展示动作 schema 和策略, 还没有逐服务的手动输入表单。

