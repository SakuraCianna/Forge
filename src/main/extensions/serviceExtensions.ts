// 本文件说明: 注册常见外部服务内置 Extension, 通过官方 REST API 执行受控动作
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type {
  ExtensionActionHandler
} from "./qqMailExtension.js";
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import {
  createBrokerUrl,
  createGoogleOAuth,
  createOAuthTokenAuth
} from "./serviceAuth.js";
import {
  createAction,
  defaultListLimit
} from "./serviceExtensionCore.js";
import {
  readSecret
} from "./serviceCredentials.js";
import {
  airtableRequest,
  calendlyRequest,
  confluenceApiRequest,
  discordRequest,
  dropboxRequest,
  figmaRequest,
  gmailRequest,
  googleCalendarRequest,
  googleDriveRequest,
  hubspotRequest,
  jiraApiRequest,
  microsoftGraphRequest,
  miroRequest,
  notionRequest,
  slackRequest,
  zoomRequest
} from "./serviceRequests.js";
import {
  encodePathSegment,
  readArrayLength,
  readEnum,
  readLimit,
  readNestedObjectText,
  readObjectText,
  readOptionalString,
  readRecord,
  readRequiredIsoDate,
  readRequiredString,
  toOutputRecord
} from "./serviceInput.js";
import { createSourceControlExtensions } from "./serviceSourceControlExtensions.js";
import { createCustomerExtensions } from "./serviceCustomerExtensions.js";
import { createTaskCollaborationExtensions } from "./serviceTaskCollaborationExtensions.js";
import { createCommerceMessagingExtensions } from "./serviceCommerceMessagingExtensions.js";
import { createOperationsExtensions } from "./serviceOperationsExtensions.js";

export const serviceExtensionDefinitions: BuiltInServiceExtension[] = [
  ...createSourceControlExtensions(),
  createConfluenceExtension(),
  createSlackExtension(),
  createNotionExtension(),
  createAirtableExtension(),
  createHubSpotExtension(),
  ...createCustomerExtensions(),
  ...createTaskCollaborationExtensions(),
  ...createCommerceMessagingExtensions(),
  createGoogleCalendarExtension(),
  createCalendlyExtension(),
  createMiroExtension(),
  createZoomExtension(),
  createFigmaExtension(),
  createGmailExtension(),
  createGoogleDriveExtension(),
  createDropboxExtension(),
  createMicrosoft365Extension(),
  ...createOperationsExtensions(),
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

function createCalendlyExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "calendly",
    name: "Calendly",
    description: "读取 Calendly 当前用户、事件类型和已预约事件摘要",
    version: "0.2.1",
    category: "calendar",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Calendly OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "calendly_access_token",
      oauth: {
        provider: "Calendly",
        authorizationUrl: "https://auth.calendly.com/oauth/authorize",
        tokenUrl: "https://auth.calendly.com/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("calendly", "authorize"),
        brokerTokenUrl: createBrokerUrl("calendly", "token"),
        scopes: ["users:read", "event_types:read", "scheduled_events:read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developer.calendly.com/authentication",
        setupUrl: "https://developer.calendly.com/creating-an-oauth-app",
        redirectUriMode: "brokered",
        usePkce: true,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "calendly.read",
        label: "读取 Calendly",
        description: "允许读取 Calendly 当前用户、事件类型和已预约事件摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Calendly 用户资料",
        permission: "calendly.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listEventTypes",
        label: "列出事件类型",
        description: "读取指定 Calendly 用户的事件类型",
        permission: "calendly.read",
        risk: "read",
        confirmation: "ask",
        required: ["userUri"],
        properties: {
          userUri: { type: "string", description: "Calendly user URI, 可从 getCurrentUser 返回值获取" },
          active: { type: "boolean", description: "是否只返回启用中的事件类型" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listScheduledEvents",
        label: "列出预约事件",
        description: "读取指定 Calendly 用户的已预约事件",
        permission: "calendly.read",
        risk: "read",
        confirmation: "ask",
        required: ["userUri"],
        properties: {
          userUri: { type: "string", description: "Calendly user URI, 可从 getCurrentUser 返回值获取" },
          minStartTime: { type: "string", description: "可选 ISO 起始时间" },
          maxStartTime: { type: "string", description: "可选 ISO 结束时间" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Calendly access token");
      const result = await calendlyRequest({
        method: "GET",
        path: "/users/me",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Calendly 当前用户: ${readNestedObjectText(result, ["resource", "name"], "unknown")}`
      };
    },
    listEventTypes: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Calendly access token");
      const userUri = readRequiredString(input.userUri, "userUri", 500);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await calendlyRequest({
        method: "GET",
        path: "/event_types",
        query: {
          count: String(limit),
          user: userUri,
          ...(typeof input.active === "boolean" ? { active: String(input.active) } : {})
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Calendly 返回 ${readArrayLength(readRecord(result).collection)} 个事件类型`
      };
    },
    listScheduledEvents: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Calendly access token");
      const userUri = readRequiredString(input.userUri, "userUri", 500);
      const limit = readLimit(input.limit, defaultListLimit);
      const minStartTime = readOptionalString(input.minStartTime, 120);
      const maxStartTime = readOptionalString(input.maxStartTime, 120);
      const result = await calendlyRequest({
        method: "GET",
        path: "/scheduled_events",
        query: {
          count: String(limit),
          sort: "start_time:asc",
          user: userUri,
          ...(minStartTime ? { min_start_time: minStartTime } : {}),
          ...(maxStartTime ? { max_start_time: maxStartTime } : {})
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Calendly 返回 ${readArrayLength(readRecord(result).collection)} 个预约事件`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "getCurrentUser"
        ? "calendly user"
        : `calendly ${String(input.userUri ?? actionId)}`
  };
}

function createMiroExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "miro",
    name: "Miro",
    description: "读取 Miro boards 摘要和单个 board 元数据",
    version: "0.2.1",
    category: "design",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Miro OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "miro_access_token",
      oauth: {
        provider: "Miro",
        authorizationUrl: "https://miro.com/oauth/authorize",
        tokenUrl: "https://api.miro.com/v1/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("miro", "authorize"),
        brokerTokenUrl: createBrokerUrl("miro", "token"),
        scopes: ["boards:read", "identity:read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developers.miro.com/docs/getting-started-with-oauth",
        setupUrl: "https://miro.com/app/settings/user-profile/apps",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "miro.read",
        label: "读取 Miro",
        description: "允许读取 Miro boards 摘要和单个 board 元数据",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listBoards",
        label: "列出 Boards",
        description: "读取当前授权账号可访问的 Miro boards",
        permission: "miro.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "getBoard",
        label: "查看 Board",
        description: "读取指定 Miro board 元数据",
        permission: "miro.read",
        risk: "read",
        confirmation: "ask",
        required: ["boardId"],
        properties: {
          boardId: { type: "string", description: "Miro board ID" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listBoards: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Miro access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await miroRequest({
        method: "GET",
        path: "/boards",
        query: {
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Miro 返回 ${readArrayLength(readRecord(result).data)} 个 board`
      };
    },
    getBoard: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Miro access token");
      const boardId = readRequiredString(input.boardId, "boardId", 200);
      const result = await miroRequest({
        method: "GET",
        path: `/boards/${encodePathSegment(boardId)}`,
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Miro board: ${readObjectText(result, "name", boardId)}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "getBoard" ? `miro ${String(input.boardId ?? "")}` : "miro boards"
  };
}

function createZoomExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "zoom",
    name: "Zoom",
    description: "读取 Zoom 当前用户和会议列表摘要",
    version: "0.2.1",
    category: "calendar",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Zoom OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "zoom_access_token",
      oauth: {
        provider: "Zoom",
        authorizationUrl: "https://zoom.us/oauth/authorize",
        tokenUrl: "https://zoom.us/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("zoom", "authorize"),
        brokerTokenUrl: createBrokerUrl("zoom", "token"),
        scopes: ["user:read:user", "meeting:read:list_user_meetings"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developers.zoom.us/docs/integrations/oauth/",
        setupUrl: "https://marketplace.zoom.us/develop/create",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "basic"
      }
    }),
    permissions: [
      {
        id: "zoom.read",
        label: "读取 Zoom",
        description: "允许读取 Zoom 当前用户和会议列表摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Zoom 用户资料",
        permission: "zoom.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listMeetings",
        label: "列出会议",
        description: "读取当前 Zoom 用户的会议列表",
        permission: "zoom.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          type: {
            type: "string",
            enum: ["scheduled", "live", "upcoming", "upcoming_meetings", "previous_meetings"],
            description: "会议类型, 默认 scheduled"
          }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Zoom access token");
      const result = await zoomRequest({
        method: "GET",
        path: "/users/me",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Zoom 当前用户: ${readObjectText(result, "email", "unknown")}`
      };
    },
    listMeetings: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Zoom access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const type = readEnum(
        input.type,
        ["scheduled", "live", "upcoming", "upcoming_meetings", "previous_meetings"],
        "scheduled"
      );
      const result = await zoomRequest({
        method: "GET",
        path: "/users/me/meetings",
        query: {
          page_size: String(limit),
          type
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Zoom 返回 ${readArrayLength(readRecord(result).meetings)} 个会议`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `zoom ${actionId}`
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
