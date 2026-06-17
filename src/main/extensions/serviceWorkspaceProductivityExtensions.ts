// 本文件说明: 注册工作台生产力类内置服务 Extension
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type { ExtensionActionHandler } from "./qqMailExtension.js";
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import {
  createBrokerUrl,
  createOAuthTokenAuth
} from "./serviceAuth.js";
import {
  createAction,
  defaultListLimit
} from "./serviceExtensionCore.js";
import { readSecret } from "./serviceCredentials.js";
import {
  airtableRequest,
  confluenceApiRequest,
  hubspotRequest,
  jiraApiRequest,
  notionRequest,
  slackRequest
} from "./serviceRequests.js";
import {
  encodePathSegment,
  readArrayLength,
  readLimit,
  readOptionalString,
  readRecord,
  readRequiredString,
  toOutputRecord
} from "./serviceInput.js";

export function createWorkspaceProductivityExtensions(): BuiltInServiceExtension[] {
  return [
    createConfluenceExtension(),
    createSlackExtension(),
    createNotionExtension(),
    createAirtableExtension(),
    createHubSpotExtension()
  ];
}

function createConfluenceExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "confluence",
    name: "Confluence Cloud",
    description: "读取 Atlassian Confluence Cloud 空间和页面搜索结果",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Atlassian OAuth access token, 需要 Confluence read scope",
      accessTokenPlaceholder: "atlassian_access_token",
      oauth: {
        provider: "Atlassian",
        authorizationUrl: "https://auth.atlassian.com/authorize",
        tokenUrl: "https://auth.atlassian.com/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("confluence", "authorize"),
        brokerTokenUrl: createBrokerUrl("confluence", "token"),
        scopes: ["read:confluence-content.summary", "read:confluence-space.summary", "read:me", "offline_access"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/",
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
        id: "confluence.read",
        label: "读取 Confluence",
        description: "允许读取 Confluence Cloud 站点、空间和页面搜索摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listAccessibleResources",
        label: "列出 Confluence 站点",
        description: "读取当前 token 可访问的 Atlassian Cloud 资源",
        permission: "confluence.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listSpaces",
        label: "列出空间",
        description: "读取指定 Confluence Cloud 站点的空间列表",
        permission: "confluence.read",
        risk: "read",
        confirmation: "ask",
        required: ["cloudId"],
        properties: {
          cloudId: { type: "string", description: "Atlassian Cloud resource ID" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "searchPages",
        label: "搜索页面",
        description: "使用 CQL 搜索 Confluence 页面",
        permission: "confluence.read",
        risk: "read",
        confirmation: "ask",
        required: ["cloudId", "query"],
        properties: {
          cloudId: { type: "string", description: "Atlassian Cloud resource ID" },
          query: { type: "string", description: "页面关键词, 会自动转为 CQL text 搜索" },
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
        outputSummary: `Confluence Cloud 返回 ${readArrayLength(result)} 个站点`
      };
    },
    listSpaces: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Atlassian access token");
      const cloudId = readRequiredString(input.cloudId, "cloudId", 200);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await confluenceApiRequest({
        cloudId,
        method: "GET",
        path: "/rest/api/space",
        query: {
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Confluence Cloud 返回 ${readArrayLength(readRecord(result).results)} 个空间`
      };
    },
    searchPages: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Atlassian access token");
      const cloudId = readRequiredString(input.cloudId, "cloudId", 200);
      const query = readRequiredString(input.query, "query", 500);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await confluenceApiRequest({
        cloudId,
        method: "GET",
        path: "/rest/api/content/search",
        query: {
          cql: `type = page AND text ~ "${query.replace(/"/gu, '\\"')}"`,
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Confluence Cloud 搜索返回 ${readArrayLength(readRecord(result).results)} 个页面`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "searchPages"
        ? `confluence ${String(input.query ?? "")}`
        : `confluence ${String(input.cloudId ?? "")}`
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

function createHubSpotExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "hubspot",
    name: "HubSpot",
    description: "读取 HubSpot CRM 联系人、公司和交易摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "HubSpot OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "hubspot_access_token",
      oauth: {
        provider: "HubSpot",
        authorizationUrl: "https://app.hubspot.com/oauth/authorize",
        tokenUrl: "https://api.hubapi.com/oauth/v1/token",
        brokerAuthorizationUrl: createBrokerUrl("hubspot", "authorize"),
        brokerTokenUrl: createBrokerUrl("hubspot", "token"),
        scopes: [
          "oauth",
          "crm.objects.contacts.read",
          "crm.objects.companies.read",
          "crm.objects.deals.read"
        ],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl:
          "https://developers.hubspot.com/docs/apps/legacy-apps/authentication/oauth-quickstart-guide",
        setupUrl: "https://app.hubspot.com/developer",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "hubspot.read",
        label: "读取 HubSpot",
        description: "允许读取 HubSpot CRM 联系人、公司和交易摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listContacts",
        label: "列出联系人",
        description: "读取 HubSpot CRM 联系人摘要",
        permission: "hubspot.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listCompanies",
        label: "列出公司",
        description: "读取 HubSpot CRM 公司摘要",
        permission: "hubspot.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listDeals",
        label: "列出交易",
        description: "读取 HubSpot CRM 交易摘要",
        permission: "hubspot.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listContacts: async (input, context) => {
      const token = await readSecret(context, "accessToken", "HubSpot access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await hubspotRequest({
        method: "GET",
        path: "/crm/objects/2026-03/0-1",
        query: {
          limit: String(limit),
          properties: "email,firstname,lastname,company,createdate,lastmodifieddate"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `HubSpot 返回 ${readArrayLength(readRecord(result).results)} 个联系人`
      };
    },
    listCompanies: async (input, context) => {
      const token = await readSecret(context, "accessToken", "HubSpot access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await hubspotRequest({
        method: "GET",
        path: "/crm/objects/2026-03/0-2",
        query: {
          limit: String(limit),
          properties: "name,domain,industry,createdate,lastmodifieddate"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `HubSpot 返回 ${readArrayLength(readRecord(result).results)} 个公司`
      };
    },
    listDeals: async (input, context) => {
      const token = await readSecret(context, "accessToken", "HubSpot access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await hubspotRequest({
        method: "GET",
        path: "/crm/objects/2026-03/0-3",
        query: {
          limit: String(limit),
          properties: "dealname,dealstage,amount,closedate,createdate,lastmodifieddate"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `HubSpot 返回 ${readArrayLength(readRecord(result).results)} 个交易`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `hubspot ${actionId}`
  };
}
