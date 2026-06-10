// 本文件说明: 注册常见外部服务内置 Extension, 通过官方 REST API 执行受控动作
import type {
  ExtensionActionDefinition,
  ExtensionAuthDefinition,
  ExtensionOAuthDefinition,
  ExtensionManifest
} from "../../shared/extensionTypes.js";
import type {
  ExtensionActionHandler,
  ExtensionActionHandlerContext
} from "./qqMailExtension.js";

type BuiltInServiceExtension = {
  handlers: Record<string, ExtensionActionHandler>;
  manifest: ExtensionManifest;
  summarizeInput?: (actionId: string, input: Record<string, unknown>) => string;
};

type HttpRequestOptions = {
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  service: string;
  url: string;
};

const defaultListLimit = 20;
const maxListLimit = 100;
const notionVersion = "2022-06-28";

const googleOAuthAuthorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleOAuthTokenUrl = "https://oauth2.googleapis.com/token";
const googleOAuthDocsUrl = "https://developers.google.com/identity/protocols/oauth2/native-app";
const forgeGoogleOAuthClientId =
  process.env.FORGE_GOOGLE_OAUTH_CLIENT_ID?.trim() ||
  "294153456393-3ce5vjc1bfu67kcblgte15be2qipts3q.apps.googleusercontent.com";
const forgeOAuthBrokerBaseUrl = trimTrailingSlash(process.env.FORGE_OAUTH_BROKER_BASE_URL?.trim());

function readProductClientId(envVar: string): string | undefined {
  return process.env[envVar]?.trim() || undefined;
}

function createBrokerUrl(extensionId: string, action: "authorize" | "token"): string | undefined {
  return forgeOAuthBrokerBaseUrl
    ? `${forgeOAuthBrokerBaseUrl}/oauth/${extensionId}/${action}`
    : undefined;
}

function trimTrailingSlash(value: string | undefined): string | undefined {
  return value ? value.replace(/\/+$/u, "") : undefined;
}

function createGoogleOAuth(scopes: string[], setupUrl: string): ExtensionOAuthDefinition {
  return {
    provider: "Google",
    authorizationUrl: googleOAuthAuthorizeUrl,
    tokenUrl: googleOAuthTokenUrl,
    scopes,
    accessTokenFieldId: "accessToken",
    refreshTokenFieldId: "refreshToken",
    productClientId: forgeGoogleOAuthClientId,
    productClientIdEnvVar: "FORGE_GOOGLE_OAUTH_CLIENT_ID",
    docsUrl: googleOAuthDocsUrl,
    setupUrl,
    redirectUriMode: "loopback",
    usePkce: true,
    tokenRequestAuth: "none",
    extraAuthorizeParams: {
      access_type: "offline",
      prompt: "consent"
    }
  };
}

function createOAuthTokenAuth({
  accessTokenDescription,
  accessTokenFieldId = "accessToken",
  accessTokenLabel = "OAuth access token",
  accessTokenPlaceholder = "Bearer access token",
  clientSecret = false,
  oauth,
  refreshTokenFieldId = "refreshToken"
}: {
  accessTokenDescription: string;
  accessTokenFieldId?: string;
  accessTokenLabel?: string;
  accessTokenPlaceholder?: string;
  clientSecret?: boolean;
  oauth?: ExtensionOAuthDefinition;
  refreshTokenFieldId?: string;
}): ExtensionAuthDefinition {
  const exposeOAuthClientIdField = Boolean(oauth?.clientIdFieldId && !oauth.productClientId);
  const exposeOAuthClientSecretField = Boolean(
    clientSecret &&
      oauth?.clientSecretFieldId &&
      oauth.tokenRequestAuth !== "none" &&
      !oauth.productClientSecretEnvVar
  );
  const connectorManagedToken = Boolean(oauth);

  return {
    type: "secret",
    fields: [
      {
        id: accessTokenFieldId,
        label: accessTokenLabel,
        description: accessTokenDescription,
        placeholder: accessTokenPlaceholder,
        ...(connectorManagedToken ? { manualInput: false } : {})
      },
      {
        id: refreshTokenFieldId,
        label: "OAuth refresh token",
        description: "OAuth 刷新令牌, 由网页登录授权自动保存, 手动 token 可留空",
        placeholder: "refresh_token",
        ...(connectorManagedToken ? { manualInput: false } : {}),
        required: false
      },
      ...(exposeOAuthClientIdField
        ? [
            {
              id: "oauthClientId",
              label: "OAuth client ID",
              description: "开发者 OAuth app client ID, 仅自定义授权配置需要填写",
              placeholder: "client_id",
              required: false
            }
          ]
        : []),
      ...(exposeOAuthClientSecretField
        ? [
            {
              id: "oauthClientSecret",
              label: "OAuth client secret",
              description: "开发者 OAuth app client secret, 仅自定义授权配置需要填写",
              placeholder: "client_secret",
              required: false
            }
          ]
        : [])
    ],
    ...(oauth ? { oauth } : {})
  };
}

export const serviceExtensionDefinitions: BuiltInServiceExtension[] = [
  createGitHubExtension(),
  createGitLabExtension(),
  createSlackExtension(),
  createNotionExtension(),
  createAirtableExtension(),
  createTodoistExtension(),
  createGoogleCalendarExtension(),
  createFigmaExtension(),
  createGmailExtension(),
  createGoogleDriveExtension(),
  createDropboxExtension(),
  createMicrosoft365Extension(),
  createLinearExtension(),
  createJiraCloudExtension(),
  createDiscordExtension()
];

export function createServiceExtensionInputSummary(
  extensionId: string,
  actionId: string,
  input: Record<string, unknown>
): string | null {
  const definition = serviceExtensionDefinitions.find(
    (candidate) => candidate.manifest.id === extensionId
  );

  return definition?.summarizeInput?.(actionId, input) ?? null;
}

function createGitHubExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "github",
    name: "GitHub",
    description: "读取仓库 Issue, 查看账号信息, 并在确认后创建 Issue",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription:
        "GitHub fine-grained/classic token 或 OAuth access token, 建议只授予目标仓库所需权限",
      accessTokenFieldId: "token",
      accessTokenLabel: "Personal access token",
      accessTokenPlaceholder: "github_pat_...",
      oauth: {
        provider: "GitHub",
        authorizationUrl: "https://github.com/login/device",
        tokenUrl: "https://github.com/login/oauth/access_token",
        deviceAuthorizationUrl: "https://github.com/login/device/code",
        scopes: ["repo", "read:user"],
        accessTokenFieldId: "token",
        refreshTokenFieldId: "refreshToken",
        productClientId: readProductClientId("FORGE_GITHUB_OAUTH_CLIENT_ID"),
        productClientIdEnvVar: "FORGE_GITHUB_OAUTH_CLIENT_ID",
        docsUrl:
          "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps",
        setupUrl: "https://github.com/settings/developers",
        redirectUriMode: "device-code",
        usePkce: false,
        tokenRequestAuth: "none"
      }
    }),
    permissions: [
      {
        id: "github.read",
        label: "读取 GitHub 数据",
        description: "允许读取账号和仓库 Issue 摘要",
        defaultMode: "ask"
      },
      {
        id: "github.write",
        label: "写入 GitHub 数据",
        description: "允许创建仓库 Issue",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getAuthenticatedUser",
        label: "查看当前账号",
        description: "调用 GitHub REST API 获取当前 token 对应的账号摘要",
        permission: "github.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listIssues",
        label: "列出 Issues",
        description: "读取指定仓库的 Issue 列表",
        permission: "github.read",
        risk: "read",
        confirmation: "ask",
        required: ["owner", "repo"],
        properties: {
          owner: { type: "string", description: "仓库 owner 或组织名" },
          repo: { type: "string", description: "仓库名称" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "Issue 状态" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "createIssue",
        label: "创建 Issue",
        description: "在指定 GitHub 仓库创建 Issue",
        permission: "github.write",
        risk: "write",
        confirmation: "always",
        required: ["owner", "repo", "title"],
        properties: {
          owner: { type: "string", description: "仓库 owner 或组织名" },
          repo: { type: "string", description: "仓库名称" },
          title: { type: "string", description: "Issue 标题" },
          body: { type: "string", description: "Issue 正文" },
          labels: { type: "array", items: { type: "string" }, description: "Issue 标签" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getAuthenticatedUser: async (_input, context) => {
      const user = await githubRequest({
        context,
        path: "/user"
      });

      return {
        output: { user },
        outputSummary: `GitHub 当前账号: ${readObjectText(user, "login", "unknown")}`
      };
    },
    listIssues: async (input, context) => {
      const owner = readRequiredString(input.owner, "owner", 120);
      const repo = readRequiredString(input.repo, "repo", 120);
      const state = readEnum(input.state, ["open", "closed", "all"], "open");
      const limit = readLimit(input.limit, defaultListLimit);
      const issues = await githubRequest({
        context,
        path: `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/issues`,
        query: {
          per_page: String(limit),
          state
        }
      });

      return {
        output: { issues },
        outputSummary: `GitHub ${owner}/${repo} 返回 ${readArrayLength(issues)} 个 Issue`
      };
    },
    createIssue: async (input, context) => {
      const owner = readRequiredString(input.owner, "owner", 120);
      const repo = readRequiredString(input.repo, "repo", 120);
      const title = readRequiredString(input.title, "title", 240);
      const body = readOptionalString(input.body, 20_000);
      const labels = readOptionalStringList(input.labels, "labels", 20);
      const issue = await githubRequest({
        body: {
          title,
          ...(body ? { body } : {}),
          ...(labels.length > 0 ? { labels } : {})
        },
        context,
        method: "POST",
        path: `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/issues`
      });

      return {
        output: { issue },
        outputSummary: `已创建 GitHub Issue: ${title}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (_actionId, input) => {
      const owner = String(input.owner ?? "");
      const repo = String(input.repo ?? "");

      return owner && repo ? `github ${owner}/${repo}` : "github";
    }
  };
}

function createGitLabExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "gitlab",
    name: "GitLab",
    description: "读取 GitLab 当前用户、项目和 Issue 摘要",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "GitLab OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "gitlab_access_token",
      oauth: {
        provider: "GitLab",
        authorizationUrl: "https://gitlab.com/oauth/authorize",
        tokenUrl: "https://gitlab.com/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("gitlab", "authorize"),
        brokerTokenUrl: createBrokerUrl("gitlab", "token"),
        scopes: ["read_user", "read_api"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://docs.gitlab.com/integration/oauth_provider/",
        setupUrl: "https://gitlab.com/-/user_settings/applications",
        redirectUriMode: "brokered",
        usePkce: true,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "gitlab.read",
        label: "读取 GitLab",
        description: "允许读取 GitLab 当前用户、项目和 Issue 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 GitLab 用户摘要",
        permission: "gitlab.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listProjects",
        label: "列出项目",
        description: "读取当前用户参与的 GitLab 项目列表",
        permission: "gitlab.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listProjectIssues",
        label: "列出项目 Issues",
        description: "读取指定 GitLab 项目的 Issue 列表",
        permission: "gitlab.read",
        risk: "read",
        confirmation: "ask",
        required: ["projectId"],
        properties: {
          projectId: { type: "string", description: "项目数字 ID 或 namespace/project 路径" },
          state: { type: "string", enum: ["opened", "closed", "all"], description: "Issue 状态" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "GitLab access token");
      const user = await gitlabRequest({
        method: "GET",
        path: "/user",
        token
      });

      return {
        output: toOutputRecord(user),
        outputSummary: `GitLab 当前用户: ${readObjectText(user, "username", "unknown")}`
      };
    },
    listProjects: async (input, context) => {
      const token = await readSecret(context, "accessToken", "GitLab access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const projects = await gitlabRequest({
        method: "GET",
        path: "/projects",
        query: {
          membership: "true",
          order_by: "last_activity_at",
          per_page: String(limit),
          simple: "true",
          sort: "desc"
        },
        token
      });

      return {
        output: Array.isArray(projects) ? { projects } : toOutputRecord(projects),
        outputSummary: `GitLab 返回 ${readArrayLength(projects)} 个项目`
      };
    },
    listProjectIssues: async (input, context) => {
      const token = await readSecret(context, "accessToken", "GitLab access token");
      const projectId = readRequiredString(input.projectId, "projectId", 240);
      const state = readEnum(input.state, ["opened", "closed", "all"], "opened");
      const limit = readLimit(input.limit, defaultListLimit);
      const issues = await gitlabRequest({
        method: "GET",
        path: `/projects/${encodePathSegment(projectId)}/issues`,
        query: {
          per_page: String(limit),
          state
        },
        token
      });

      return {
        output: Array.isArray(issues) ? { issues } : toOutputRecord(issues),
        outputSummary: `GitLab ${projectId} 返回 ${readArrayLength(issues)} 个 Issue`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listProjectIssues"
        ? `gitlab ${String(input.projectId ?? "")}`
        : "gitlab"
  };
}

function createSlackExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "slack",
    name: "Slack",
    description: "读取 Slack 频道列表, 并在确认后发送消息",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription:
        "Slack app 的 xoxb bot token, 建议只授予 channels:read, groups:read 和 chat:write 等必要 scope",
      accessTokenFieldId: "botToken",
      accessTokenLabel: "Bot token",
      accessTokenPlaceholder: "xoxb-...",
      oauth: {
        provider: "Slack",
        authorizationUrl: "https://slack.com/oauth/v2/authorize",
        tokenUrl: "https://slack.com/api/oauth.v2.access",
        brokerAuthorizationUrl: createBrokerUrl("slack", "authorize"),
        brokerTokenUrl: createBrokerUrl("slack", "token"),
        scopes: ["channels:read", "groups:read", "chat:write"],
        accessTokenFieldId: "botToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://docs.slack.dev/authentication/installing-with-oauth/",
        setupUrl: "https://api.slack.com/apps",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body",
        scopeSeparator: "comma"
      }
    }),
    permissions: [
      {
        id: "slack.read",
        label: "读取 Slack 频道",
        description: "允许读取工作区频道摘要",
        defaultMode: "ask"
      },
      {
        id: "slack.send",
        label: "发送 Slack 消息",
        description: "允许向指定频道发送真实消息",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listChannels",
        label: "列出频道",
        description: "读取 Slack 频道列表",
        permission: "slack.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量" },
          types: { type: "string", description: "频道类型, 例如 public_channel,private_channel" }
        }
      }),
      createAction({
        id: "postMessage",
        label: "发送消息",
        description: "向 Slack 频道发送消息",
        permission: "slack.send",
        risk: "send",
        confirmation: "always",
        required: ["channel", "text"],
        properties: {
          channel: { type: "string", description: "频道 ID, 例如 C0123..." },
          text: { type: "string", description: "消息正文" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listChannels: async (input, context) => {
      const token = await readSecret(context, "botToken", "Slack bot token");
      const limit = readLimit(input.limit, defaultListLimit);
      const types = readOptionalString(input.types, 120) || "public_channel,private_channel";
      const channels = await slackRequest({
        method: "GET",
        path: "/conversations.list",
        query: {
          exclude_archived: "true",
          limit: String(limit),
          types
        },
        token
      });

      return {
        output: toOutputRecord(channels),
        outputSummary: `Slack 返回 ${readArrayLength(readRecord(channels).channels)} 个频道`
      };
    },
    postMessage: async (input, context) => {
      const token = await readSecret(context, "botToken", "Slack bot token");
      const channel = readRequiredString(input.channel, "channel", 120);
      const text = readRequiredString(input.text, "text", 4_000);
      const result = await slackRequest({
        body: {
          channel,
          text
        },
        method: "POST",
        path: "/chat.postMessage",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `已发送 Slack 消息到 ${channel}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "postMessage"
        ? `slack ${String(input.channel ?? "")}: ${String(input.text ?? "").slice(0, 80)}`
        : "slack listChannels"
  };
}

function createNotionExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "notion",
    name: "Notion",
    description: "搜索 Notion 页面, 并在数据库中创建页面",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription:
        "Notion internal integration secret 或 OAuth access token, 需要把目标页面或数据库分享给该连接",
      accessTokenFieldId: "integrationToken",
      accessTokenLabel: "Integration token",
      accessTokenPlaceholder: "secret_...",
      oauth: {
        provider: "Notion",
        authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
        tokenUrl: "https://api.notion.com/v1/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("notion", "authorize"),
        brokerTokenUrl: createBrokerUrl("notion", "token"),
        scopes: [],
        accessTokenFieldId: "integrationToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developers.notion.com/guides/get-started/authorization",
        setupUrl: "https://www.notion.so/profile/integrations",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "basic",
        tokenRequestBody: "json",
        extraAuthorizeParams: {
          owner: "user"
        }
      }
    }),
    permissions: [
      {
        id: "notion.read",
        label: "读取 Notion",
        description: "允许搜索已授权的 Notion 页面和数据库",
        defaultMode: "ask"
      },
      {
        id: "notion.write",
        label: "写入 Notion",
        description: "允许在已授权数据库中创建页面",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "searchPages",
        label: "搜索页面",
        description: "按标题搜索 Notion 页面和数据库",
        permission: "notion.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          query: { type: "string", description: "搜索关键词" },
          limit: { type: "number", description: "最多返回数量" }
        }
      }),
      createAction({
        id: "createDatabasePage",
        label: "创建数据库页面",
        description: "在指定 Notion 数据库中创建页面",
        permission: "notion.write",
        risk: "write",
        confirmation: "always",
        required: ["databaseId", "title"],
        properties: {
          databaseId: { type: "string", description: "Notion database ID" },
          title: { type: "string", description: "页面标题" },
          titlePropertyName: { type: "string", description: "标题属性名, 默认 Name" },
          content: { type: "string", description: "可选首段正文" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    searchPages: async (input, context) => {
      const token = await readSecret(context, "integrationToken", "Notion integration token");
      const query = readOptionalString(input.query, 200);
      const pageSize = readLimit(input.limit, defaultListLimit);
      const result = await notionRequest({
        body: {
          ...(query ? { query } : {}),
          page_size: pageSize
        },
        path: "/search",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Notion 返回 ${readArrayLength(readRecord(result).results)} 个结果`
      };
    },
    createDatabasePage: async (input, context) => {
      const token = await readSecret(context, "integrationToken", "Notion integration token");
      const databaseId = readRequiredString(input.databaseId, "databaseId", 200);
      const title = readRequiredString(input.title, "title", 240);
      const titlePropertyName = readOptionalString(input.titlePropertyName, 80) || "Name";
      const content = readOptionalString(input.content, 10_000);
      const result = await notionRequest({
        body: {
          parent: {
            database_id: databaseId
          },
          properties: {
            [titlePropertyName]: {
              title: [
                {
                  text: {
                    content: title
                  }
                }
              ]
            }
          },
          ...(content
            ? {
                children: [
                  {
                    object: "block",
                    paragraph: {
                      rich_text: [
                        {
                          text: {
                            content
                          },
                          type: "text"
                        }
                      ]
                    },
                    type: "paragraph"
                  }
                ]
              }
            : {})
        },
        path: "/pages",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `已创建 Notion 页面: ${title}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "createDatabasePage"
        ? `notion create ${String(input.title ?? "")}`
        : `notion search ${String(input.query ?? "")}`
  };
}

function createAirtableExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "airtable",
    name: "Airtable",
    description: "读取 Airtable bases 和表记录摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Airtable OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "airtable_access_token",
      oauth: {
        provider: "Airtable",
        authorizationUrl: "https://airtable.com/oauth2/v1/authorize",
        tokenUrl: "https://airtable.com/oauth2/v1/token",
        brokerAuthorizationUrl: createBrokerUrl("airtable", "authorize"),
        brokerTokenUrl: createBrokerUrl("airtable", "token"),
        scopes: ["schema.bases:read", "data.records:read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://www.airtable.com/developers/web/api/oauth-reference",
        setupUrl: "https://airtable.com/create/oauth",
        redirectUriMode: "brokered",
        usePkce: true,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "airtable.read",
        label: "读取 Airtable",
        description: "允许读取 Airtable bases 和指定表记录摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listBases",
        label: "列出 Bases",
        description: "读取当前授权账号可访问的 Airtable bases",
        permission: "airtable.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listRecords",
        label: "读取表记录",
        description: "读取指定 Airtable base 和 table 的记录摘要",
        permission: "airtable.read",
        risk: "read",
        confirmation: "ask",
        required: ["baseId", "tableNameOrId"],
        properties: {
          baseId: { type: "string", description: "Airtable base ID, 例如 app..." },
          tableNameOrId: { type: "string", description: "表名或 table ID" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listBases: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Airtable access token");
      const result = await airtableRequest({
        method: "GET",
        path: "/meta/bases",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Airtable 返回 ${readArrayLength(readRecord(result).bases)} 个 base`
      };
    },
    listRecords: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Airtable access token");
      const baseId = readRequiredString(input.baseId, "baseId", 120);
      const tableNameOrId = readRequiredString(input.tableNameOrId, "tableNameOrId", 200);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await airtableRequest({
        method: "GET",
        path: `/${encodePathSegment(baseId)}/${encodePathSegment(tableNameOrId)}`,
        query: {
          maxRecords: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Airtable 返回 ${readArrayLength(readRecord(result).records)} 条记录`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listRecords"
        ? `airtable ${String(input.baseId ?? "")}/${String(input.tableNameOrId ?? "")}`
        : "airtable bases"
  };
}

function createTodoistExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "todoist",
    name: "Todoist",
    description: "读取 Todoist 项目和任务, 并在确认后创建任务",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Todoist OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "todoist_access_token",
      oauth: {
        provider: "Todoist",
        authorizationUrl: "https://todoist.com/oauth/authorize",
        tokenUrl: "https://todoist.com/oauth/access_token",
        brokerAuthorizationUrl: createBrokerUrl("todoist", "authorize"),
        brokerTokenUrl: createBrokerUrl("todoist", "token"),
        scopes: ["data:read_write"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developer.todoist.com/api/v1/",
        setupUrl: "https://developer.todoist.com/appconsole.html",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "todoist.read",
        label: "读取 Todoist",
        description: "允许读取 Todoist 项目和任务摘要",
        defaultMode: "ask"
      },
      {
        id: "todoist.write",
        label: "写入 Todoist",
        description: "允许创建 Todoist 任务",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listProjects",
        label: "列出项目",
        description: "读取 Todoist 项目列表",
        permission: "todoist.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listTasks",
        label: "列出任务",
        description: "读取 Todoist 任务列表",
        permission: "todoist.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          projectId: { type: "string", description: "可选项目 ID" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "createTask",
        label: "创建任务",
        description: "在 Todoist 中创建任务",
        permission: "todoist.write",
        risk: "write",
        confirmation: "always",
        required: ["content"],
        properties: {
          content: { type: "string", description: "任务标题" },
          description: { type: "string", description: "任务说明" },
          projectId: { type: "string", description: "可选项目 ID" },
          dueString: { type: "string", description: "可选自然语言截止时间, 例如 tomorrow" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listProjects: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Todoist access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await todoistRequest({
        method: "GET",
        path: "/projects",
        query: {
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Todoist 返回 ${readCollectionLength(result)} 个项目`
      };
    },
    listTasks: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Todoist access token");
      const projectId = readOptionalString(input.projectId, 120);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await todoistRequest({
        method: "GET",
        path: "/tasks",
        query: {
          limit: String(limit),
          ...(projectId ? { project_id: projectId } : {})
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Todoist 返回 ${readCollectionLength(result)} 个任务`
      };
    },
    createTask: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Todoist access token");
      const content = readRequiredString(input.content, "content", 500);
      const description = readOptionalString(input.description, 4_000);
      const projectId = readOptionalString(input.projectId, 120);
      const dueString = readOptionalString(input.dueString, 240);
      const result = await todoistRequest({
        body: {
          content,
          ...(description ? { description } : {}),
          ...(projectId ? { project_id: projectId } : {}),
          ...(dueString ? { due_string: dueString } : {})
        },
        method: "POST",
        path: "/tasks",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `已创建 Todoist 任务: ${readObjectText(result, "content", content)}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "createTask"
        ? `todoist create ${String(input.content ?? "")}`
        : `todoist ${String(input.projectId ?? "")}`
  };
}

function createGoogleCalendarExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "google-calendar",
    name: "Google Calendar",
    description: "读取 Google Calendar 日程, 并在确认后创建事件",
    version: "0.2.1",
    category: "calendar",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Google Calendar API OAuth 访问令牌, 需要 calendar 相关 scope",
      accessTokenPlaceholder: "ya29...",
      oauth: createGoogleOAuth(
        [
          "https://www.googleapis.com/auth/calendar.events",
          "https://www.googleapis.com/auth/calendar.readonly"
        ],
        "https://console.cloud.google.com/apis/credentials"
      )
    }),
    permissions: [
      {
        id: "calendar.read",
        label: "读取日历",
        description: "允许读取指定 Google 日历事件",
        defaultMode: "ask"
      },
      {
        id: "calendar.write",
        label: "写入日历",
        description: "允许创建 Google 日历事件",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listEvents",
        label: "列出事件",
        description: "读取指定日历的事件列表",
        permission: "calendar.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          calendarId: { type: "string", description: "日历 ID, 默认 primary" },
          timeMin: { type: "string", description: "ISO 起始时间" },
          timeMax: { type: "string", description: "ISO 结束时间" },
          limit: { type: "number", description: "最多返回数量" }
        }
      }),
      createAction({
        id: "createEvent",
        label: "创建事件",
        description: "在指定 Google 日历中创建事件",
        permission: "calendar.write",
        risk: "write",
        confirmation: "always",
        required: ["summary", "startDateTime", "endDateTime"],
        properties: {
          calendarId: { type: "string", description: "日历 ID, 默认 primary" },
          summary: { type: "string", description: "事件标题" },
          description: { type: "string", description: "事件说明" },
          startDateTime: { type: "string", description: "ISO 开始时间" },
          endDateTime: { type: "string", description: "ISO 结束时间" },
          timeZone: { type: "string", description: "时区, 例如 Asia/Shanghai" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listEvents: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Google Calendar access token");
      const calendarId = readOptionalString(input.calendarId, 200) || "primary";
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await googleCalendarRequest({
        method: "GET",
        path: `/calendars/${encodePathSegment(calendarId)}/events`,
        query: {
          maxResults: String(limit),
          orderBy: "startTime",
          singleEvents: "true",
          ...(typeof input.timeMin === "string" && input.timeMin ? { timeMin: input.timeMin } : {}),
          ...(typeof input.timeMax === "string" && input.timeMax ? { timeMax: input.timeMax } : {})
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Google Calendar 返回 ${readArrayLength(readRecord(result).items)} 个事件`
      };
    },
    createEvent: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Google Calendar access token");
      const calendarId = readOptionalString(input.calendarId, 200) || "primary";
      const summary = readRequiredString(input.summary, "summary", 240);
      const startDateTime = readRequiredIsoDate(input.startDateTime, "startDateTime");
      const endDateTime = readRequiredIsoDate(input.endDateTime, "endDateTime");
      const timeZone = readOptionalString(input.timeZone, 80);
      const description = readOptionalString(input.description, 8_000);
      const result = await googleCalendarRequest({
        body: {
          ...(description ? { description } : {}),
          end: {
            dateTime: endDateTime,
            ...(timeZone ? { timeZone } : {})
          },
          start: {
            dateTime: startDateTime,
            ...(timeZone ? { timeZone } : {})
          },
          summary
        },
        path: `/calendars/${encodePathSegment(calendarId)}/events`,
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `已创建 Google Calendar 事件: ${summary}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "createEvent"
        ? `calendar create ${String(input.summary ?? "")}`
        : `calendar ${String(input.calendarId ?? "primary")}`
  };
}

function createFigmaExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "figma",
    name: "Figma",
    description: "读取 Figma 文件元数据和评论",
    version: "0.2.1",
    category: "design",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription:
        "Figma personal access token 或 OAuth access token, 需要 file_content:read 和 file_comments:read scope",
      accessTokenFieldId: "personalAccessToken",
      accessTokenLabel: "Figma access token",
      accessTokenPlaceholder: "figd_...",
      oauth: {
        provider: "Figma",
        authorizationUrl: "https://www.figma.com/oauth",
        tokenUrl: "https://api.figma.com/v1/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("figma", "authorize"),
        brokerTokenUrl: createBrokerUrl("figma", "token"),
        scopes: ["file_content:read", "file_comments:read"],
        accessTokenFieldId: "personalAccessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developers.figma.com/docs/rest-api/oauth-apps/",
        setupUrl: "https://www.figma.com/developers/apps",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "figma.read",
        label: "读取 Figma",
        description: "允许读取 Figma 文件摘要和评论",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getFile",
        label: "读取文件",
        description: "读取 Figma 文件 JSON 摘要",
        permission: "figma.read",
        risk: "read",
        confirmation: "ask",
        required: ["fileKey"],
        properties: {
          fileKey: { type: "string", description: "Figma file key" },
          depth: { type: "number", description: "节点深度, 默认 1" }
        }
      }),
      createAction({
        id: "listComments",
        label: "列出评论",
        description: "读取 Figma 文件评论",
        permission: "figma.read",
        risk: "read",
        confirmation: "ask",
        required: ["fileKey"],
        properties: {
          fileKey: { type: "string", description: "Figma file key" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getFile: async (input, context) => {
      const token = await readSecret(context, "personalAccessToken", "Figma personal access token");
      const fileKey = readRequiredString(input.fileKey, "fileKey", 200);
      const depth = typeof input.depth === "number" ? Math.max(1, Math.min(4, Math.round(input.depth))) : 1;
      const result = await figmaRequest({
        method: "GET",
        path: `/files/${encodePathSegment(fileKey)}`,
        query: {
          depth: String(depth)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `读取 Figma 文件: ${readObjectText(result, "name", fileKey)}`
      };
    },
    listComments: async (input, context) => {
      const token = await readSecret(context, "personalAccessToken", "Figma personal access token");
      const fileKey = readRequiredString(input.fileKey, "fileKey", 200);
      const result = await figmaRequest({
        method: "GET",
        path: `/files/${encodePathSegment(fileKey)}/comments`,
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Figma 返回 ${readArrayLength(readRecord(result).comments)} 条评论`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (_actionId, input) => `figma ${String(input.fileKey ?? "")}`
  };
}

function createGmailExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "gmail",
    name: "Gmail",
    description: "读取 Gmail 当前账号资料和邮件摘要",
    version: "0.2.1",
    category: "mail",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Gmail API OAuth 访问令牌, 需要 gmail.readonly scope",
      accessTokenPlaceholder: "ya29...",
      oauth: createGoogleOAuth(
        ["https://www.googleapis.com/auth/gmail.readonly"],
        "https://console.cloud.google.com/apis/credentials"
      )
    }),
    permissions: [
      {
        id: "gmail.read",
        label: "读取 Gmail",
        description: "允许读取 Gmail 账号资料和邮件摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getProfile",
        label: "查看 Gmail 账号",
        description: "读取当前 Gmail 账号 profile 摘要",
        permission: "gmail.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listMessages",
        label: "列出邮件",
        description: "按 Gmail 搜索语法读取邮件 ID 和线程摘要",
        permission: "gmail.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          query: { type: "string", description: "Gmail 搜索语法, 例如 from:alice newer:7d" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getProfile: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Gmail access token");
      const profile = await gmailRequest({
        method: "GET",
        path: "/users/me/profile",
        token
      });

      return {
        output: toOutputRecord(profile),
        outputSummary: `Gmail 当前账号: ${readObjectText(profile, "emailAddress", "unknown")}`
      };
    },
    listMessages: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Gmail access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const query = readOptionalString(input.query, 500);
      const result = await gmailRequest({
        method: "GET",
        path: "/users/me/messages",
        query: {
          maxResults: String(limit),
          ...(query ? { q: query } : {})
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Gmail 返回 ${readArrayLength(readRecord(result).messages)} 封邮件摘要`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listMessages" ? `gmail ${String(input.query ?? "")}` : "gmail profile"
  };
}

function createGoogleDriveExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "google-drive",
    name: "Google Drive",
    description: "搜索 Google Drive 文件并读取文件元数据",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Google Drive API OAuth 访问令牌, 需要 drive.metadata.readonly scope",
      accessTokenPlaceholder: "ya29...",
      oauth: createGoogleOAuth(
        ["https://www.googleapis.com/auth/drive.metadata.readonly"],
        "https://console.cloud.google.com/apis/credentials"
      )
    }),
    permissions: [
      {
        id: "drive.read",
        label: "读取 Drive",
        description: "允许搜索 Google Drive 文件和读取元数据",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listFiles",
        label: "搜索文件",
        description: "搜索 Google Drive 文件列表",
        permission: "drive.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          query: { type: "string", description: "Drive 查询语句, 例如 name contains 'report'" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "getFileMetadata",
        label: "读取文件元数据",
        description: "读取指定 Google Drive 文件的基础元数据",
        permission: "drive.read",
        risk: "read",
        confirmation: "ask",
        required: ["fileId"],
        properties: {
          fileId: { type: "string", description: "Google Drive file ID" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listFiles: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Google Drive access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const query = readOptionalString(input.query, 500);
      const result = await googleDriveRequest({
        method: "GET",
        path: "/files",
        query: {
          fields: "files(id,name,mimeType,modifiedTime,webViewLink),nextPageToken",
          orderBy: "modifiedTime desc",
          pageSize: String(limit),
          ...(query ? { q: query } : {})
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Google Drive 返回 ${readArrayLength(readRecord(result).files)} 个文件`
      };
    },
    getFileMetadata: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Google Drive access token");
      const fileId = readRequiredString(input.fileId, "fileId", 200);
      const result = await googleDriveRequest({
        method: "GET",
        path: `/files/${encodePathSegment(fileId)}`,
        query: {
          fields: "id,name,mimeType,modifiedTime,webViewLink,size,owners(displayName,emailAddress)"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `读取 Google Drive 文件: ${readObjectText(result, "name", fileId)}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "getFileMetadata"
        ? `drive file ${String(input.fileId ?? "")}`
        : `drive ${String(input.query ?? "")}`
  };
}

function createDropboxExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "dropbox",
    name: "Dropbox",
    description: "读取 Dropbox 当前账号和文件夹条目摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Dropbox OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "dropbox_access_token",
      oauth: {
        provider: "Dropbox",
        authorizationUrl: "https://www.dropbox.com/oauth2/authorize",
        tokenUrl: "https://api.dropboxapi.com/oauth2/token",
        brokerAuthorizationUrl: createBrokerUrl("dropbox", "authorize"),
        brokerTokenUrl: createBrokerUrl("dropbox", "token"),
        scopes: ["account_info.read", "files.metadata.read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developers.dropbox.com/oauth-guide",
        setupUrl: "https://www.dropbox.com/developers/apps",
        redirectUriMode: "brokered",
        usePkce: true,
        tokenRequestAuth: "body",
        extraAuthorizeParams: {
          token_access_type: "offline"
        }
      }
    }),
    permissions: [
      {
        id: "dropbox.read",
        label: "读取 Dropbox",
        description: "允许读取 Dropbox 当前账号和文件夹元数据",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentAccount",
        label: "查看当前账号",
        description: "读取当前 Dropbox 账号摘要",
        permission: "dropbox.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listFolder",
        label: "列出文件夹",
        description: "读取指定 Dropbox 文件夹条目摘要",
        permission: "dropbox.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          path: { type: "string", description: "Dropbox 路径, 留空表示根目录" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentAccount: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Dropbox access token");
      const result = await dropboxRequest({
        body: {},
        path: "/users/get_current_account",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Dropbox 当前账号: ${readObjectText(result, "email", "unknown")}`
      };
    },
    listFolder: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Dropbox access token");
      const path = readOptionalString(input.path, 500);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await dropboxRequest({
        body: {
          include_deleted: false,
          include_has_explicit_shared_members: false,
          include_mounted_folders: true,
          include_non_downloadable_files: true,
          limit,
          path
        },
        path: "/files/list_folder",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Dropbox 返回 ${readArrayLength(readRecord(result).entries)} 个条目`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listFolder" ? `dropbox ${String(input.path ?? "")}` : "dropbox account"
  };
}

function createMicrosoft365Extension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "microsoft-365",
    name: "Microsoft 365",
    description: "通过 Microsoft Graph 读取个人资料、邮件、日历和 OneDrive 文件摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Microsoft Graph OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "microsoft_graph_access_token",
      oauth: {
        provider: "Microsoft",
        authorizationUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        brokerAuthorizationUrl: createBrokerUrl("microsoft-365", "authorize"),
        brokerTokenUrl: createBrokerUrl("microsoft-365", "token"),
        scopes: ["offline_access", "User.Read", "Mail.Read", "Calendars.Read", "Files.Read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://learn.microsoft.com/en-us/graph/use-the-api",
        setupUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
        redirectUriMode: "brokered",
        usePkce: true,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "microsoft365.read",
        label: "读取 Microsoft 365",
        description: "允许通过 Microsoft Graph 读取账号、邮件、日历和 OneDrive 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getProfile",
        label: "查看账号资料",
        description: "读取当前 Microsoft 365 账号资料",
        permission: "microsoft365.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listMessages",
        label: "列出邮件",
        description: "读取当前邮箱最近邮件摘要",
        permission: "microsoft365.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listEvents",
        label: "列出日历事件",
        description: "读取当前日历事件摘要",
        permission: "microsoft365.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listDriveRoot",
        label: "列出 OneDrive 根目录",
        description: "读取 OneDrive 根目录文件和文件夹摘要",
        permission: "microsoft365.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getProfile: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Microsoft Graph access token");
      const result = await microsoftGraphRequest({
        method: "GET",
        path: "/me",
        query: {
          $select: "id,displayName,userPrincipalName,mail"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Microsoft 365 当前账号: ${readObjectText(result, "displayName", "unknown")}`
      };
    },
    listMessages: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Microsoft Graph access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await microsoftGraphRequest({
        method: "GET",
        path: "/me/messages",
        query: {
          $orderby: "receivedDateTime desc",
          $select: "id,subject,from,receivedDateTime,webLink",
          $top: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Microsoft 365 返回 ${readArrayLength(readRecord(result).value)} 封邮件`
      };
    },
    listEvents: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Microsoft Graph access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await microsoftGraphRequest({
        method: "GET",
        path: "/me/events",
        query: {
          $orderby: "start/dateTime",
          $select: "id,subject,start,end,webLink",
          $top: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Microsoft 365 返回 ${readArrayLength(readRecord(result).value)} 个日历事件`
      };
    },
    listDriveRoot: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Microsoft Graph access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await microsoftGraphRequest({
        method: "GET",
        path: "/me/drive/root/children",
        query: {
          $select: "id,name,folder,file,webUrl,lastModifiedDateTime,size",
          $top: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Microsoft 365 返回 ${readArrayLength(readRecord(result).value)} 个 OneDrive 条目`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `microsoft365 ${actionId}`
  };
}

function createLinearExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "linear",
    name: "Linear",
    description: "读取 Linear 当前账号和 Issue 列表",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Linear API token 或 OAuth access token, 建议只授予 read scope",
      accessTokenPlaceholder: "lin_api_...",
      oauth: {
        provider: "Linear",
        authorizationUrl: "https://linear.app/oauth/authorize",
        tokenUrl: "https://api.linear.app/oauth/token",
        scopes: ["read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        productClientId: readProductClientId("FORGE_LINEAR_OAUTH_CLIENT_ID"),
        productClientIdEnvVar: "FORGE_LINEAR_OAUTH_CLIENT_ID",
        docsUrl: "https://linear.app/developers/oauth-2-0-authentication",
        setupUrl: "https://linear.app/settings/api/applications/new",
        redirectUriMode: "loopback",
        usePkce: true,
        tokenRequestAuth: "none"
      }
    }),
    permissions: [
      {
        id: "linear.read",
        label: "读取 Linear",
        description: "允许读取 Linear 当前账号和 Issue 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getViewer",
        label: "查看 Linear 账号",
        description: "读取当前 Linear 用户摘要",
        permission: "linear.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listIssues",
        label: "列出 Issues",
        description: "读取最近更新的 Linear Issue 列表",
        permission: "linear.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getViewer: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Linear access token");
      const result = await linearGraphqlRequest({
        query: "query ForgeViewer { viewer { id name displayName email } }",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Linear 当前账号: ${readNestedObjectText(result, ["viewer", "displayName"], "unknown")}`
      };
    },
    listIssues: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Linear access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await linearGraphqlRequest({
        query:
          "query ForgeIssues($first: Int!) { issues(first: $first, orderBy: updatedAt) { nodes { id identifier title url updatedAt state { name } assignee { displayName } team { key name } } } }",
        token,
        variables: {
          first: limit
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Linear 返回 ${readArrayLength(readRecord(readRecord(result).issues).nodes)} 个 Issue`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: () => "linear"
  };
}

function createJiraCloudExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "jira-cloud",
    name: "Jira Cloud",
    description: "读取 Atlassian Jira Cloud 站点和 Issue 搜索结果",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Atlassian OAuth access token, 需要 read:jira-work scope",
      accessTokenPlaceholder: "atlassian_access_token",
      oauth: {
        provider: "Atlassian",
        authorizationUrl: "https://auth.atlassian.com/authorize",
        tokenUrl: "https://auth.atlassian.com/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("jira-cloud", "authorize"),
        brokerTokenUrl: createBrokerUrl("jira-cloud", "token"),
        scopes: ["read:jira-work", "read:me", "offline_access"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developer.atlassian.com/cloud/jira/software/oauth-2-3lo-apps/",
        setupUrl: "https://developer.atlassian.com/console/myapps/",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body",
        tokenRequestBody: "json",
        extraAuthorizeParams: {
          audience: "api.atlassian.com",
          prompt: "consent"
        }
      }
    }),
    permissions: [
      {
        id: "jira.read",
        label: "读取 Jira",
        description: "允许读取 Jira Cloud 站点和 Issue 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listAccessibleResources",
        label: "列出 Jira 站点",
        description: "读取当前 token 可访问的 Atlassian Cloud 资源",
        permission: "jira.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "searchIssues",
        label: "搜索 Jira Issues",
        description: "在指定 Jira Cloud 站点按 JQL 搜索 Issue",
        permission: "jira.read",
        risk: "read",
        confirmation: "ask",
        required: ["cloudId", "jql"],
        properties: {
          cloudId: { type: "string", description: "Atlassian Cloud resource ID" },
          jql: { type: "string", description: "Jira JQL, 例如 project = HSP ORDER BY updated DESC" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listAccessibleResources: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Atlassian access token");
      const result = await jiraApiRequest({
        method: "GET",
        path: "/oauth/token/accessible-resources",
        token
      });

      return {
        output: Array.isArray(result) ? { resources: result } : toOutputRecord(result),
        outputSummary: `Jira Cloud 返回 ${readArrayLength(result)} 个站点`
      };
    },
    searchIssues: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Atlassian access token");
      const cloudId = readRequiredString(input.cloudId, "cloudId", 200);
      const jql = readRequiredString(input.jql, "jql", 1_000);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await jiraApiRequest({
        method: "GET",
        path: `/ex/jira/${encodePathSegment(cloudId)}/rest/api/3/search/jql`,
        query: {
          fields: "summary,status,assignee,updated",
          jql,
          maxResults: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Jira Cloud 返回 ${readArrayLength(readRecord(result).issues)} 个 Issue`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "searchIssues" ? `jira ${String(input.jql ?? "")}` : "jira resources"
  };
}

function createDiscordExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "discord",
    name: "Discord",
    description: "读取 Discord 当前用户和服务器列表",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Discord OAuth access token, 需要 identify 和 guilds scope",
      accessTokenPlaceholder: "discord_access_token",
      oauth: {
        provider: "Discord",
        authorizationUrl: "https://discord.com/oauth2/authorize",
        tokenUrl: "https://discord.com/api/v10/oauth2/token",
        brokerAuthorizationUrl: createBrokerUrl("discord", "authorize"),
        brokerTokenUrl: createBrokerUrl("discord", "token"),
        scopes: ["identify", "guilds"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://discord.com/developers/docs/topics/oauth2",
        setupUrl: "https://discord.com/developers/applications",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "basic"
      }
    }),
    permissions: [
      {
        id: "discord.read",
        label: "读取 Discord",
        description: "允许读取 Discord 当前用户和服务器摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Discord 用户摘要",
        permission: "discord.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listGuilds",
        label: "列出服务器",
        description: "读取当前用户加入的 Discord 服务器列表",
        permission: "discord.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Discord access token");
      const result = await discordRequest({
        method: "GET",
        path: "/users/@me",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Discord 当前用户: ${readObjectText(result, "username", "unknown")}`
      };
    },
    listGuilds: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Discord access token");
      const result = await discordRequest({
        method: "GET",
        path: "/users/@me/guilds",
        token
      });

      return {
        output: Array.isArray(result) ? { guilds: result } : toOutputRecord(result),
        outputSummary: `Discord 返回 ${readArrayLength(result)} 个服务器`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: () => "discord"
  };
}

function createAction({
  confirmation,
  description,
  id,
  label,
  permission,
  properties,
  required = [],
  risk
}: Pick<
  ExtensionActionDefinition,
  "confirmation" | "description" | "id" | "label" | "permission" | "risk"
> & {
  properties: Record<string, unknown>;
  required?: string[];
}): ExtensionActionDefinition {
  return {
    id,
    description,
    label,
    permission,
    risk,
    confirmation,
    inputSchema: {
      type: "object",
      properties,
      required
    },
    outputSchema: {
      type: "object",
      properties: {}
    }
  };
}

async function githubRequest({
  body,
  context,
  method = "GET",
  path,
  query
}: {
  body?: Record<string, unknown>;
  context: ExtensionActionHandlerContext;
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  const token = await readSecret(context, "token", "GitHub token");
  return requestJson({
    body,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    },
    method,
    service: "GitHub",
    url: withQuery(`https://api.github.com${path}`, query)
  });
}

async function gitlabRequest({
  method,
  path,
  query,
  token
}: {
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "GitLab",
    url: withQuery(`https://gitlab.com/api/v4${path}`, query)
  });
}

async function slackRequest({
  body,
  method,
  path,
  query,
  token
}: {
  body?: Record<string, unknown>;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  const result = await requestJson({
    body,
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Slack",
    url: withQuery(`https://slack.com/api${path}`, query)
  });
  const record = readRecord(result);

  if (record.ok === false) {
    throw new Error(`Slack API request failed: ${String(record.error ?? "unknown_error")}`);
  }

  return result;
}

async function notionRequest({
  body,
  path,
  token
}: {
  body: Record<string, unknown>;
  path: string;
  token: string;
}): Promise<unknown> {
  return requestJson({
    body,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": notionVersion
    },
    method: "POST",
    service: "Notion",
    url: `https://api.notion.com/v1${path}`
  });
}

async function googleCalendarRequest({
  body,
  method = "POST",
  path,
  query,
  token
}: {
  body?: Record<string, unknown>;
  method?: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    body,
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Google Calendar",
    url: withQuery(`https://www.googleapis.com/calendar/v3${path}`, query)
  });
}

async function gmailRequest({
  method,
  path,
  query,
  token
}: {
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Gmail",
    url: withQuery(`https://gmail.googleapis.com/gmail/v1${path}`, query)
  });
}

async function googleDriveRequest({
  method,
  path,
  query,
  token
}: {
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Google Drive",
    url: withQuery(`https://www.googleapis.com/drive/v3${path}`, query)
  });
}

async function airtableRequest({
  method,
  path,
  query,
  token
}: {
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Airtable",
    url: withQuery(`https://api.airtable.com/v0${path}`, query)
  });
}

async function todoistRequest({
  body,
  method,
  path,
  query,
  token
}: {
  body?: Record<string, unknown>;
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    body,
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Todoist",
    url: withQuery(`https://api.todoist.com/api/v1${path}`, query)
  });
}

async function dropboxRequest({
  body,
  path,
  token
}: {
  body: Record<string, unknown>;
  path: string;
  token: string;
}): Promise<unknown> {
  return requestJson({
    body,
    headers: {
      Authorization: `Bearer ${token}`
    },
    method: "POST",
    service: "Dropbox",
    url: `https://api.dropboxapi.com/2${path}`
  });
}

async function microsoftGraphRequest({
  method,
  path,
  query,
  token
}: {
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Microsoft Graph",
    url: withQuery(`https://graph.microsoft.com/v1.0${path}`, query)
  });
}

async function linearGraphqlRequest({
  query,
  token,
  variables
}: {
  query: string;
  token: string;
  variables?: Record<string, unknown>;
}): Promise<unknown> {
  const result = await requestJson({
    body: {
      query,
      ...(variables ? { variables } : {})
    },
    headers: {
      Authorization: `Bearer ${token}`
    },
    method: "POST",
    service: "Linear",
    url: "https://api.linear.app/graphql"
  });
  const record = readRecord(result);

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    throw new Error(`Linear API request failed: ${formatErrorPayload(record.errors[0])}`);
  }

  return readRecord(record.data);
}

async function jiraApiRequest({
  method,
  path,
  query,
  token
}: {
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Jira Cloud",
    url: withQuery(`https://api.atlassian.com${path}`, query)
  });
}

async function discordRequest({
  method,
  path,
  token
}: {
  method: "GET";
  path: string;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Discord",
    url: `https://discord.com/api/v10${path}`
  });
}

async function figmaRequest({
  method,
  path,
  query,
  token
}: {
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: createFigmaAuthHeaders(token),
    method,
    service: "Figma",
    url: withQuery(`https://api.figma.com/v1${path}`, query)
  });
}

function createFigmaAuthHeaders(token: string): Record<string, string> {
  return token.startsWith("figd_")
    ? { "X-Figma-Token": token }
    : { Authorization: `Bearer ${token}` };
}

async function requestJson<T = unknown>({
  body,
  headers = {},
  method = "GET",
  service,
  url
}: HttpRequestOptions): Promise<T> {
  const response = await fetch(url, {
    body: body ? JSON.stringify(body) : undefined,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    method
  });
  const rawText = await response.text();
  const data = parseJsonOrText(rawText);

  if (!response.ok) {
    throw new Error(
      `${service} API request failed (${response.status}): ${formatErrorPayload(data)}`
    );
  }

  return data as T;
}

function parseJsonOrText(value: string): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch {
    return { message: value };
  }
}

function formatErrorPayload(value: unknown): string {
  if (isRecord(value)) {
    const message = value.message ?? value.error ?? value.error_description;
    if (typeof message === "string" && message.trim()) {
      return message.slice(0, 300);
    }
  }

  return JSON.stringify(value).slice(0, 300);
}

async function readSecret(
  context: ExtensionActionHandlerContext,
  fieldId: string,
  label: string
): Promise<string> {
  const value = await context.readSecret(fieldId);

  if (!value) {
    throw new Error(`${label} is not configured`);
  }

  return value;
}

function readRequiredString(value: unknown, fieldName: string, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    throw new Error(`${fieldName} is required`);
  }

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} is too long`);
  }

  return normalized;
}

function readOptionalString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function readRequiredIsoDate(value: unknown, fieldName: string): string {
  const text = readRequiredString(value, fieldName, 120);
  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`${fieldName} must be a valid ISO date-time`);
  }

  return text;
}

function readOptionalStringList(
  value: unknown,
  fieldName: string,
  maxLength: number
): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[;,]/u)
      : [];
  const normalized = values
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

  if (normalized.length > maxLength) {
    throw new Error(`${fieldName} has too many values`);
  }

  return normalized;
}

function readLimit(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(maxListLimit, Math.max(1, Math.round(value)));
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function withQuery(url: string, query: Record<string, string> | undefined): string {
  if (!query) {
    return url;
  }

  const parsed = new URL(url);

  for (const [key, value] of Object.entries(query)) {
    if (value) {
      parsed.searchParams.set(key, value);
    }
  }

  return parsed.toString();
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function toOutputRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : { result: value };
}

function readObjectText(value: unknown, field: string, fallback: string): string {
  const candidate = readRecord(value)[field];
  return typeof candidate === "string" && candidate.trim() ? candidate : fallback;
}

function readNestedObjectText(value: unknown, fields: string[], fallback: string): string {
  let current: unknown = value;

  for (const field of fields) {
    current = readRecord(current)[field];
  }

  return typeof current === "string" && current.trim() ? current : fallback;
}

function readArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function readCollectionLength(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }

  return readArrayLength(readRecord(value).results);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
