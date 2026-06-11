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

外部服务请求默认带 30 秒超时保护。读类 `GET` 请求遇到 408、429、425、5xx 或短暂网络错误时会自动重试最多 3 次; 写入、发送和创建类动作默认不自动重试, 避免重复产生外部副作用。

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
- `bitbucket`: Bitbucket Cloud REST API 扩展。
- `confluence`: Confluence Cloud REST API 扩展。
- `slack`: Slack Web API 扩展。
- `notion`: Notion API 扩展。
- `airtable`: Airtable Web API 扩展。
- `hubspot`: HubSpot CRM API 扩展。
- `salesforce`: Salesforce REST API 扩展。
- `zendesk`: Zendesk Support API 扩展。
- `intercom`: Intercom REST API 扩展。
- `freshdesk`: Freshdesk Support API 扩展。
- `pipedrive`: Pipedrive REST API 扩展。
- `todoist`: Todoist API 扩展。
- `asana`: Asana API 扩展。
- `clickup`: ClickUp API 扩展。
- `monday`: monday.com GraphQL API 扩展。
- `trello`: Trello REST API 扩展。
- `stripe`: Stripe REST API 扩展。
- `shopify`: Shopify Admin GraphQL API 扩展。
- `mailchimp`: Mailchimp Marketing API 扩展。
- `postmark`: Postmark API 扩展。
- `twilio`: Twilio REST API 扩展。
- `google-calendar`: Google Calendar API 扩展。
- `calendly`: Calendly API 扩展。
- `miro`: Miro REST API 扩展。
- `zoom`: Zoom REST API 扩展。
- `figma`: Figma REST API 扩展。
- `gmail`: Gmail API 扩展。
- `google-drive`: Google Drive API 扩展。
- `dropbox`: Dropbox API 扩展。
- `microsoft-365`: Microsoft Graph API 扩展。
- `linear`: Linear GraphQL API 扩展。
- `sentry`: Sentry REST API 扩展。
- `pagerduty`: PagerDuty REST API 扩展。
- `datadog`: Datadog REST API 扩展。
- `cloudflare`: Cloudflare REST API 扩展。
- `okta`: Okta Core API 扩展。
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

以下内置服务使用用户保存的 token 或 API key 通过官方 API 调用。Forge 只保存密钥状态, 不会把 token 写入调用日志或线程上下文。写入、发送和创建类动作都设置为 `always` 确认, 即使权限被设为 `allow`, 主进程也会先返回确认 token。

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
3. GitLab、Bitbucket、Confluence Cloud、Slack、Notion、Airtable、HubSpot、Todoist、Asana、ClickUp、monday.com、Calendly、Miro、Zoom、Figma、Dropbox、Microsoft 365、Sentry、Jira Cloud 和 Discord 使用 brokered 模式。桌面端只打开 Forge 官方 OAuth 服务, 由服务端持有 client secret 并处理 HTTPS callback, 再把短期 broker code 回跳给本机 Forge。
4. 普通用户进入扩展页, 直接点击“网页登录授权”, 不需要自己创建 OAuth app、复制 client ID 或保存 client secret。
5. 对已声明 OAuth 的内置扩展, access token 和 refresh token 由网页登录授权自动写入本机安全存储, 扩展页不会再展示手动粘贴 token 的输入框。
6. 如果某个构建缺少产品方 OAuth 配置或 Forge OAuth broker, UI 会明确标注“当前构建未配置网页登录”, 这是维护者需要处理的发布配置问题。brokered 扩展出现该状态时, 通常缺少 `FORGE_OAUTH_BROKER_BASE_URL` 或对应 Forge OAuth broker 尚未部署。
7. loopback 和 brokered 模式下, 主进程在 `127.0.0.1` 随机端口启动短期 HTTP 回调监听。
8. Forge 生成 `state`, 支持的服务同时生成 PKCE `code_verifier` 和 `code_challenge`。
9. Forge 用系统浏览器打开官方授权页或 Forge OAuth 服务。
10. 服务或 broker 回跳到本地 callback 后, 主进程校验 `state`。
11. 主进程向官方 token endpoint 或 broker token endpoint 换取 token。
12. access token 和 refresh token 写入 Electron 主进程密钥库。
13. 扩展 Registry 刷新密钥状态, Agent 只看到动作 schema, 看不到 token。

不是所有服务都允许桌面端 loopback redirect。GitLab、Bitbucket、Confluence Cloud、Slack、Notion、Airtable、HubSpot、Todoist、Asana、ClickUp、monday.com、Calendly、Miro、Zoom、Figma、Dropbox、Microsoft 365、Sentry、Jira Cloud、Discord 等通常要求在服务后台预注册 HTTPS 回调地址或使用 confidential client。Forge 会在 UI 中标注这类服务需要 Forge 官方授权服务, 不会假装它们能直接用本地回调完成授权。

Salesforce、Zendesk、Intercom、Freshdesk、Pipedrive、Trello、Stripe、Shopify、Mailchimp、Postmark、Twilio、PagerDuty、Datadog、Cloudflare 和 Okta 当前先以手动凭据方式接入, 即用户在扩展页保存服务 token、API key 或站点域名后调用只读动作。后续如果接入产品级连接器, 应继续隐藏普通用户不该维护的 client secret, 并把 token exchange 放到 Forge 官方授权服务。

维护者配置项:

- `FORGE_GOOGLE_OAUTH_CLIENT_ID`: 覆盖内置 Google 桌面 OAuth client ID。
- `FORGE_GITHUB_OAUTH_CLIENT_ID`: 启用 GitHub device flow。
- `FORGE_LINEAR_OAUTH_CLIENT_ID`: 启用 Linear loopback + PKCE 授权。
- `FORGE_OAUTH_BROKER_BASE_URL`: 启用 GitLab、Bitbucket、Confluence Cloud、Slack、Notion、Airtable、HubSpot、Todoist、Asana、ClickUp、monday.com、Calendly、Miro、Zoom、Figma、Dropbox、Microsoft 365、Sentry、Jira Cloud 和 Discord 的 Forge brokered 授权入口。

不要把 client secret 写进桌面端代码或仓库; 需要 confidential client 的服务必须接入 Forge 官方 HTTPS 授权代理后再开放给普通用户。

参考官方做法:

- OpenAI Apps 的连接体验是用户选择 Connect 并完成 OAuth, 权限由连接时授权和工作区控制共同决定。
- OpenAI Apps SDK 的 MCP 授权推荐 authorization-code + PKCE, 由客户端触发浏览器授权并在后续请求中携带 Bearer token。
- Google installed apps 使用系统浏览器、本地 redirect URI、PKCE、`state` 和 token exchange。
- GitHub OAuth Apps 支持 device flow, 适合 CLI 和桌面应用这类不应保存 client secret 的场景。
- GitLab REST API 支持 OAuth 2.0 Bearer token, `read_user` 和 `read_api` 覆盖用户资料和只读 API 调用。
- Bitbucket Cloud OAuth 2.0 使用 `https://bitbucket.org/site/oauth2/authorize` 授权入口, API 请求通过 `Authorization: Bearer {access_token}` 调用 `https://api.bitbucket.org/2.0`。
- Confluence Cloud OAuth 2.0 使用 Atlassian `api.atlassian.com/ex/confluence/{cloudId}/wiki` 路径访问空间和页面搜索 API。
- Linear OAuth 支持 PKCE, refresh token 需要安全保存并用于后续刷新。
- Figma REST OAuth 需要配置 redirect URL; 对文件读取和评论读取分别使用 `file_content:read` 和 `file_comments:read` 等细粒度 scope。
- Notion token exchange 使用 HTTP Basic Authentication。
- Slack OAuth 要求 redirect URI 与 App Management 中的配置匹配, 且通常必须是 HTTPS。
- Airtable OAuth 常用读取 scope 包括 `schema.bases:read` 和 `data.records:read`。
- HubSpot OAuth 使用 authorization-code grant, 授权入口是 `https://app.hubspot.com/oauth/authorize`, token endpoint 是 `https://api.hubapi.com/oauth/v1/token`。
- HubSpot CRM object API 可以通过 date-versioned object endpoints 读取联系人、公司和交易记录, 推荐优先使用细粒度 `crm.objects.*.read` scope。
- Salesforce REST API 通过 OAuth Bearer token 访问实例域名下的 REST resources, SOQL 查询使用 `/services/data/{version}/query`。
- Zendesk Support API 支持 OAuth access token, 工单、用户和搜索 API 都在对应子域名的 `/api/v2` 下调用。
- Intercom REST API 使用 Bearer token 调用 `https://api.intercom.io`, 联系人和会话是常见的只读集成对象。
- Freshdesk API 使用子域名下的 `/api/v2` 路径, API key 通过 HTTP Basic Auth 传入。
- Pipedrive API 支持通过 `api_token` 查询参数调用 deals、organizations 和 users 等资源。
- Todoist OAuth 的 `data:read_write` scope 覆盖读取项目/任务和创建任务。
- Asana OAuth 支持 authorization-code + PKCE, 用户授权入口是 `https://app.asana.com/-/oauth_authorize`, token endpoint 是 `https://app.asana.com/-/oauth_token`, 读取工作区、项目和任务分别使用 `workspaces:read`, `projects:read`, `tasks:read`。
- ClickUp OAuth 使用 `https://app.clickup.com/api` 授权入口和 `https://api.clickup.com/api/v2/oauth/token` token endpoint, 用户授权后可读取已授权 Workspaces。
- monday.com OAuth 使用 `https://auth.monday.com/oauth2/authorize` 和 `https://auth.monday.com/oauth2/token`, API 调用集中到 GraphQL endpoint `https://api.monday.com/v2`。
- Trello REST API 可以通过 API key 和用户 token 作为查询参数调用, token 必须视为敏感凭据保存。
- Stripe API 使用 secret key 或 restricted key 鉴权, 只读集成应优先使用受限 key。
- Shopify Admin GraphQL API 使用 Admin API access token 和店铺域名调用, 商品读取需要 `read_products`, 订单读取需要 `read_orders` 等 scope。
- Mailchimp Marketing API 使用 API key 和 server prefix 调用 `https://{prefix}.api.mailchimp.com/3.0`。
- Postmark API 通过 `X-Postmark-Server-Token` 请求头调用, 发送邮件类动作必须二次确认。
- Twilio REST API 使用 Account SID 和 Auth Token 的 HTTP Basic Auth 调用账号、消息和通话记录接口。
- Calendly 推荐公共应用使用 OAuth 2.1, `users:read`, `event_types:read` 和 `scheduled_events:read` 分别覆盖当前用户、事件类型和预约事件读取。
- Miro REST API 应用需要 OAuth 2.0 authorization-code flow, `boards:read` 可读取 boards, `identity:read` 可读取当前身份信息。
- Zoom OAuth 使用 `https://zoom.us/oauth/authorize` 和 `https://zoom.us/oauth/token`, API base URL 是 `https://api.zoom.us/v2/`, 请求用 Bearer token。
- Dropbox OAuth 文档建议桌面端这类公开客户端使用 PKCE; 用户不应为使用产品而自行注册 Dropbox app, 产品维护者应只注册一次应用。
- Microsoft identity platform 通过 scope 请求 Microsoft Graph 权限, Forge 只请求 `User.Read`, `Mail.Read`, `Calendars.Read`, `Files.Read` 和 `offline_access`。
- Sentry 支持 OAuth2 authorization-code grant, 授权入口是 `https://sentry.io/oauth/authorize/`, token endpoint 是 `https://sentry.io/oauth/token/`, 常用只读 scope 包括 `org:read`, `project:read`, `event:read`。
- PagerDuty REST API 支持 API token, 事件和服务读取通过 `https://api.pagerduty.com` 调用。
- Datadog API 使用 `DD-API-KEY` 和 `DD-APPLICATION-KEY` 请求头鉴权, 不同站点使用不同 API host。
- Cloudflare API 使用 Bearer API token 调用 `https://api.cloudflare.com/client/v4`, 建议使用最小权限 token。
- Okta Core API 使用 `SSWS` API token 调用组织域名下的 `/api/v1` 资源。

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

### Bitbucket

`bitbucket` 使用 Bitbucket Cloud OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getCurrentUser`: 读取当前 Bitbucket 用户资料。
- `listRepositories`: 读取指定 workspace 下的仓库。
- `listRepositoryIssues`: 读取指定仓库的 Issue 列表。

建议 OAuth scope:

- `account`
- `repository`
- `issue`

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

### HubSpot

`hubspot` 使用 HubSpot OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `listContacts`: 读取 HubSpot CRM 联系人摘要。
- `listCompanies`: 读取 HubSpot CRM 公司摘要。
- `listDeals`: 读取 HubSpot CRM 交易摘要。

建议 HubSpot OAuth scope:

- `oauth`
- `crm.objects.contacts.read`
- `crm.objects.companies.read`
- `crm.objects.deals.read`

### Salesforce

`salesforce` 使用 Salesforce 实例 URL 和 OAuth access token。当前先提供手动保存凭据的只读动作, 适合连接已有 Connected App 或 CLI 获取的访问令牌。

支持动作:

- `getIdentity`: 读取当前 Salesforce OAuth 身份摘要。
- `listAccounts`: 通过 SOQL 读取 Account 摘要。
- `listOpportunities`: 通过 SOQL 读取 Opportunity 摘要。

### Zendesk

`zendesk` 使用 Zendesk 子域名和 OAuth access token。当前先提供手动保存凭据的只读动作。

支持动作:

- `getCurrentUser`: 读取当前 Zendesk 用户资料。
- `listTickets`: 读取最近工单摘要。
- `searchTickets`: 按 Zendesk 搜索语法读取工单摘要。

### Intercom

`intercom` 使用 Intercom private app access token 或 OAuth access token。当前先提供手动保存凭据的只读动作。

支持动作:

- `getCurrentAdmin`: 读取当前 Intercom 管理员和 workspace 摘要。
- `listContacts`: 读取 Intercom 联系人摘要。
- `listConversations`: 读取 Intercom 会话摘要。

### Todoist

`todoist` 使用 Todoist OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `listProjects`: 读取 Todoist 项目列表。
- `listTasks`: 读取 Todoist 任务列表。
- `createTask`: 创建 Todoist 任务, 始终要求确认。

建议 OAuth scope:

- `data:read_write`

### Asana

`asana` 使用 Asana OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getCurrentUser`: 读取当前 Asana 用户资料。
- `listWorkspaces`: 读取当前授权账号可见的 Asana 工作区。
- `listProjects`: 读取指定 Asana 工作区下的项目。
- `listTasks`: 读取指定 Asana 项目下的任务。

建议 OAuth scope:

- `users:read`
- `workspaces:read`
- `projects:read`
- `tasks:read`

### ClickUp

`clickup` 使用 ClickUp OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getCurrentUser`: 读取当前 ClickUp 用户资料。
- `listWorkspaces`: 读取当前授权账号可访问的 ClickUp 工作区。
- `listSpaces`: 读取指定 ClickUp 工作区下的空间。
- `listTasks`: 读取指定 ClickUp list 下的任务。

### monday.com

`monday` 使用 monday.com OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getCurrentUser`: 读取当前 monday.com 用户资料。
- `listBoards`: 读取当前授权账号可见的 monday.com boards。
- `listWorkspaces`: 读取当前授权账号可见的 monday.com workspaces。

建议 OAuth scope:

- `me:read`
- `boards:read`
- `workspaces:read`

### Trello

`trello` 使用 Trello API key 和用户 token。当前先提供手动保存凭据的只读动作。

支持动作:

- `getCurrentMember`: 读取当前 Trello 成员资料。
- `listBoards`: 读取当前成员可见的 Trello 看板。
- `listBoardCards`: 读取指定 Trello 看板的打开卡片。

### Stripe

`stripe` 使用 Stripe secret key 或 restricted key。建议使用只读 restricted key, 不要把高权限 live secret key 用作普通测试凭据。

支持动作:

- `getAccount`: 读取当前 Stripe 账号摘要。
- `listCustomers`: 读取 Stripe 客户列表。
- `listCharges`: 读取 Stripe charges 摘要。

### Shopify

`shopify` 使用 Shopify 店铺域名和 Admin API access token。当前通过 Shopify Admin GraphQL API 提供只读动作。

支持动作:

- `getShop`: 读取 Shopify 店铺摘要。
- `listProducts`: 读取 Shopify 商品摘要。
- `listOrders`: 读取 Shopify 订单摘要。

建议 Admin API scope:

- `read_products`
- `read_orders`

### Google Calendar

`google-calendar` 使用 Google Calendar API OAuth access token。

支持动作:

- `listEvents`: 读取指定日历事件列表。
- `createEvent`: 创建日历事件, 始终要求确认。

### Calendly

`calendly` 使用 Calendly OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getCurrentUser`: 读取当前 Calendly 用户资料。
- `listEventTypes`: 读取指定 Calendly 用户的事件类型。
- `listScheduledEvents`: 读取指定 Calendly 用户的已预约事件。

建议 Calendly OAuth scope:

- `users:read`
- `event_types:read`
- `scheduled_events:read`

### Miro

`miro` 使用 Miro OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `listBoards`: 读取当前授权账号可访问的 Miro boards。
- `getBoard`: 读取指定 Miro board 元数据。

建议 OAuth scope:

- `boards:read`
- `identity:read`

### Zoom

`zoom` 使用 Zoom OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `getCurrentUser`: 读取当前 Zoom 用户资料。
- `listMeetings`: 读取当前 Zoom 用户的会议列表。

建议 OAuth scope:

- `user:read:user`
- `meeting:read:list_user_meetings`

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

### Sentry

`sentry` 使用 Sentry OAuth access token。网页登录授权依赖 Forge brokered 授权服务, 普通用户不需要在扩展页手动粘贴 token。

支持动作:

- `listOrganizations`: 读取当前授权账号可访问的 Sentry 组织。
- `listProjects`: 读取指定 Sentry 组织下的项目。
- `listIssues`: 读取指定 Sentry 组织下的 Issue 列表。

建议 OAuth scope:

- `org:read`
- `project:read`
- `event:read`

### PagerDuty

`pagerduty` 使用 PagerDuty REST API token。当前先提供手动保存凭据的只读动作。

支持动作:

- `getCurrentUser`: 读取当前 PagerDuty 用户资料。
- `listIncidents`: 读取 PagerDuty incidents 摘要。
- `listServices`: 读取 PagerDuty services 摘要。

### Datadog

`datadog` 使用 Datadog site、API key 和 application key。当前先提供手动保存凭据的只读动作。

支持动作:

- `listMonitors`: 读取 Datadog monitors 摘要。
- `listIncidents`: 读取 Datadog incidents 摘要。
- `listDashboards`: 读取 Datadog dashboards 摘要。

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

