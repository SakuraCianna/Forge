// 本文件说明: 注册运维与可观测性类内置服务 Extension, 通过官方 API 执行受控只读动作
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type { ExtensionActionHandler } from "./qqMailExtension.js";
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import {
  createBrokerUrl,
  createOAuthTokenAuth,
  readProductClientId
} from "./serviceAuth.js";
import {
  readDatadogCredentials,
  readOktaCredentials,
  readSecret
} from "./serviceCredentials.js";
import {
  cloudflareRequest,
  datadogRequest,
  linearGraphqlRequest,
  oktaRequest,
  pagerDutyRequest,
  sentryRequest
} from "./serviceRequests.js";
import {
  encodePathSegment,
  readArrayLength,
  readEnum,
  readLimit,
  readNestedObjectText,
  readOptionalString,
  readRecord,
  readRequiredString,
  toOutputRecord
} from "./serviceInput.js";
import {
  createAction,
  defaultListLimit
} from "./serviceExtensionCore.js";

export function createOperationsExtensions(): BuiltInServiceExtension[] {
  return [
    createLinearExtension(),
    createSentryExtension(),
    createPagerDutyExtension(),
    createDatadogExtension(),
    createCloudflareExtension(),
    createOktaExtension()
  ];
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

function createSentryExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "sentry",
    name: "Sentry",
    description: "读取 Sentry 组织、项目和 Issue 摘要",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Sentry OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "sentry_access_token",
      oauth: {
        provider: "Sentry",
        authorizationUrl: "https://sentry.io/oauth/authorize/",
        tokenUrl: "https://sentry.io/oauth/token/",
        brokerAuthorizationUrl: createBrokerUrl("sentry", "authorize"),
        brokerTokenUrl: createBrokerUrl("sentry", "token"),
        scopes: ["org:read", "project:read", "event:read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://docs.sentry.io/api/auth/",
        setupUrl: "https://sentry.io/settings/account/api/applications/",
        redirectUriMode: "brokered",
        usePkce: true,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "sentry.read",
        label: "读取 Sentry",
        description: "允许读取 Sentry 组织、项目和 Issue 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listOrganizations",
        label: "列出组织",
        description: "读取当前授权账号可访问的 Sentry 组织",
        permission: "sentry.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listProjects",
        label: "列出项目",
        description: "读取指定 Sentry 组织下的项目",
        permission: "sentry.read",
        risk: "read",
        confirmation: "ask",
        required: ["organizationSlug"],
        properties: {
          organizationSlug: { type: "string", description: "Sentry organization slug" }
        }
      }),
      createAction({
        id: "listIssues",
        label: "列出 Issues",
        description: "读取指定 Sentry 组织下的 Issue 列表",
        permission: "sentry.read",
        risk: "read",
        confirmation: "ask",
        required: ["organizationSlug"],
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          organizationSlug: { type: "string", description: "Sentry organization slug" },
          query: { type: "string", description: "Sentry issue 查询, 默认 is:unresolved" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listOrganizations: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Sentry access token");
      const result = await sentryRequest({
        method: "GET",
        path: "/organizations/",
        token
      });

      return {
        output: Array.isArray(result) ? { organizations: result } : toOutputRecord(result),
        outputSummary: `Sentry 返回 ${readArrayLength(result)} 个组织`
      };
    },
    listProjects: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Sentry access token");
      const organizationSlug = readRequiredString(input.organizationSlug, "organizationSlug", 160);
      const result = await sentryRequest({
        method: "GET",
        path: `/organizations/${encodePathSegment(organizationSlug)}/projects/`,
        token
      });

      return {
        output: Array.isArray(result) ? { projects: result } : toOutputRecord(result),
        outputSummary: `Sentry ${organizationSlug} 返回 ${readArrayLength(result)} 个项目`
      };
    },
    listIssues: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Sentry access token");
      const organizationSlug = readRequiredString(input.organizationSlug, "organizationSlug", 160);
      const limit = readLimit(input.limit, defaultListLimit);
      const query = readOptionalString(input.query, 500) || "is:unresolved";
      const result = await sentryRequest({
        method: "GET",
        path: `/organizations/${encodePathSegment(organizationSlug)}/issues/`,
        query: {
          limit: String(limit),
          query
        },
        token
      });

      return {
        output: Array.isArray(result) ? { issues: result } : toOutputRecord(result),
        outputSummary: `Sentry ${organizationSlug} 返回 ${readArrayLength(result)} 个 Issue`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listOrganizations"
        ? "sentry organizations"
        : `sentry ${String(input.organizationSlug ?? "")}`
  };
}

function createPagerDutyExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "pagerduty",
    name: "PagerDuty",
    description: "读取 PagerDuty 当前用户、事件和服务摘要",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "apiToken",
          label: "PagerDuty API token",
          description: "PagerDuty REST API token, 建议使用只读权限",
          placeholder: "pd_api_token"
        }
      ]
    },
    permissions: [
      {
        id: "pagerduty.read",
        label: "读取 PagerDuty",
        description: "允许读取 PagerDuty 当前用户、事件和服务摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 PagerDuty 用户资料",
        permission: "pagerduty.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listIncidents",
        label: "列出事件",
        description: "读取 PagerDuty incidents 摘要",
        permission: "pagerduty.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          status: { type: "string", enum: ["triggered", "acknowledged", "resolved"], description: "事件状态, 默认 triggered" }
        }
      }),
      createAction({
        id: "listServices",
        label: "列出服务",
        description: "读取 PagerDuty services 摘要",
        permission: "pagerduty.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "apiToken", "PagerDuty API token");
      const result = await pagerDutyRequest({
        method: "GET",
        path: "/users/me",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `PagerDuty 当前用户: ${readNestedObjectText(result, ["user", "name"], "unknown")}`
      };
    },
    listIncidents: async (input, context) => {
      const token = await readSecret(context, "apiToken", "PagerDuty API token");
      const limit = readLimit(input.limit, defaultListLimit);
      const status = readEnum(input.status, ["triggered", "acknowledged", "resolved"], "triggered");
      const result = await pagerDutyRequest({
        method: "GET",
        path: "/incidents",
        query: {
          limit: String(limit),
          "statuses[]": status
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `PagerDuty 返回 ${readArrayLength(readRecord(result).incidents)} 个事件`
      };
    },
    listServices: async (input, context) => {
      const token = await readSecret(context, "apiToken", "PagerDuty API token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await pagerDutyRequest({
        method: "GET",
        path: "/services",
        query: {
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `PagerDuty 返回 ${readArrayLength(readRecord(result).services)} 个服务`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `pagerduty ${actionId}`
  };
}

function createDatadogExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "datadog",
    name: "Datadog",
    description: "读取 Datadog monitors、incidents 和 dashboard 摘要",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "site",
          label: "Datadog site",
          description: "Datadog 站点域名, 例如 datadoghq.com 或 datadoghq.eu",
          placeholder: "datadoghq.com",
          required: false
        },
        {
          id: "apiKey",
          label: "Datadog API key",
          description: "Datadog API key",
          placeholder: "dd_api_key"
        },
        {
          id: "applicationKey",
          label: "Datadog application key",
          description: "Datadog application key, 用于调用 REST API",
          placeholder: "dd_app_key"
        }
      ]
    },
    permissions: [
      {
        id: "datadog.read",
        label: "读取 Datadog",
        description: "允许读取 Datadog monitors、incidents 和 dashboard 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listMonitors",
        label: "列出监控",
        description: "读取 Datadog monitors 摘要",
        permission: "datadog.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          query: { type: "string", description: "Datadog monitor 搜索查询" }
        }
      }),
      createAction({
        id: "listIncidents",
        label: "列出事件",
        description: "读取 Datadog incidents 摘要",
        permission: "datadog.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listDashboards",
        label: "列出仪表盘",
        description: "读取 Datadog dashboards 摘要",
        permission: "datadog.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listMonitors: async (input, context) => {
      const credentials = await readDatadogCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const query = readOptionalString(input.query, 500);
      const result = await datadogRequest({
        credentials,
        method: "GET",
        path: "/api/v1/monitor",
        query: {
          ...(query ? { query } : {}),
          per_page: String(limit)
        }
      });

      return {
        output: Array.isArray(result) ? { monitors: result } : toOutputRecord(result),
        outputSummary: `Datadog 返回 ${readArrayLength(result)} 个监控`
      };
    },
    listIncidents: async (input, context) => {
      const credentials = await readDatadogCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await datadogRequest({
        credentials,
        method: "GET",
        path: "/api/v2/incidents",
        query: {
          "page[size]": String(limit)
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Datadog 返回 ${readArrayLength(readRecord(result).data)} 个事件`
      };
    },
    listDashboards: async (input, context) => {
      const credentials = await readDatadogCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await datadogRequest({
        credentials,
        method: "GET",
        path: "/api/v1/dashboard",
        query: {
          count: String(limit)
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Datadog 返回 ${readArrayLength(readRecord(result).dashboards)} 个仪表盘`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `datadog ${actionId}`
  };
}

function createCloudflareExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "cloudflare",
    name: "Cloudflare",
    description: "读取 Cloudflare 账号、域名和 Workers 脚本摘要",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "apiToken",
          label: "Cloudflare API token",
          description: "Cloudflare API token, 建议只授予 Account/Zone 读取权限",
          placeholder: "cloudflare_api_token"
        }
      ]
    },
    permissions: [
      {
        id: "cloudflare.read",
        label: "读取 Cloudflare",
        description: "允许读取 Cloudflare 账号、域名和 Workers 脚本摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listAccounts",
        label: "列出账号",
        description: "读取 Cloudflare accounts 摘要",
        permission: "cloudflare.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listZones",
        label: "列出域名",
        description: "读取 Cloudflare zones 摘要",
        permission: "cloudflare.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listWorkerScripts",
        label: "列出 Workers",
        description: "读取指定 Cloudflare account 下的 Workers 脚本",
        permission: "cloudflare.read",
        risk: "read",
        confirmation: "ask",
        required: ["accountId"],
        properties: {
          accountId: { type: "string", description: "Cloudflare account ID" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listAccounts: async (input, context) => {
      const token = await readSecret(context, "apiToken", "Cloudflare API token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await cloudflareRequest({
        method: "GET",
        path: "/accounts",
        query: {
          per_page: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Cloudflare 返回 ${readArrayLength(readRecord(result).result)} 个账号`
      };
    },
    listZones: async (input, context) => {
      const token = await readSecret(context, "apiToken", "Cloudflare API token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await cloudflareRequest({
        method: "GET",
        path: "/zones",
        query: {
          per_page: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Cloudflare 返回 ${readArrayLength(readRecord(result).result)} 个域名`
      };
    },
    listWorkerScripts: async (input, context) => {
      const token = await readSecret(context, "apiToken", "Cloudflare API token");
      const accountId = readRequiredString(input.accountId, "accountId", 200);
      const result = await cloudflareRequest({
        method: "GET",
        path: `/accounts/${encodePathSegment(accountId)}/workers/scripts`,
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Cloudflare 返回 ${readArrayLength(readRecord(result).result)} 个 Workers 脚本`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listWorkerScripts"
        ? `cloudflare ${String(input.accountId ?? "")}`
        : `cloudflare ${actionId}`
  };
}

function createOktaExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "okta",
    name: "Okta",
    description: "读取 Okta 当前用户、应用和用户组摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "orgUrl",
          label: "Okta org URL",
          description: "Okta 组织地址, 例如 https://example.okta.com",
          placeholder: "https://example.okta.com"
        },
        {
          id: "apiToken",
          label: "Okta API token",
          description: "Okta SSWS API token, 建议使用最小权限服务账号",
          placeholder: "okta_api_token"
        }
      ]
    },
    permissions: [
      {
        id: "okta.read",
        label: "读取 Okta",
        description: "允许读取 Okta 当前用户、应用和用户组摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Okta token 对应用户摘要",
        permission: "okta.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listApplications",
        label: "列出应用",
        description: "读取 Okta apps 摘要",
        permission: "okta.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listGroups",
        label: "列出用户组",
        description: "读取 Okta groups 摘要",
        permission: "okta.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const credentials = await readOktaCredentials(context);
      const result = await oktaRequest({
        credentials,
        method: "GET",
        path: "/api/v1/users/me"
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Okta 当前用户: ${readNestedObjectText(result, ["profile", "login"], "unknown")}`
      };
    },
    listApplications: async (input, context) => {
      const credentials = await readOktaCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await oktaRequest({
        credentials,
        method: "GET",
        path: "/api/v1/apps",
        query: {
          limit: String(limit)
        }
      });

      return {
        output: Array.isArray(result) ? { applications: result } : toOutputRecord(result),
        outputSummary: `Okta 返回 ${readArrayLength(result)} 个应用`
      };
    },
    listGroups: async (input, context) => {
      const credentials = await readOktaCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await oktaRequest({
        credentials,
        method: "GET",
        path: "/api/v1/groups",
        query: {
          limit: String(limit)
        }
      });

      return {
        output: Array.isArray(result) ? { groups: result } : toOutputRecord(result),
        outputSummary: `Okta 返回 ${readArrayLength(result)} 个用户组`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `okta ${actionId}`
  };
}
