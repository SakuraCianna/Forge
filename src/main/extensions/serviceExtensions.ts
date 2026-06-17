// 本文件说明: 注册常见外部服务内置 Extension, 通过官方 REST API 执行受控动作
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type {
  ExtensionActionHandler
} from "./qqMailExtension.js";
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import {
  createBrokerUrl,
  createGoogleOAuth,
  createOAuthTokenAuth,
  readProductClientId
} from "./serviceAuth.js";
import {
  createAction,
  defaultListLimit
} from "./serviceExtensionCore.js";
import {
  readDatadogCredentials,
  readFreshdeskCredentials,
  readMailchimpCredentials,
  readOktaCredentials,
  readSalesforceCredentials,
  readSecret,
  readShopifyCredentials,
  readTrelloCredentials,
  readTwilioCredentials,
  readZendeskCredentials
} from "./serviceCredentials.js";
import {
  airtableRequest,
  asanaRequest,
  calendlyRequest,
  clickupRequest,
  cloudflareRequest,
  confluenceApiRequest,
  datadogRequest,
  discordRequest,
  dropboxRequest,
  figmaRequest,
  freshdeskRequest,
  gmailRequest,
  googleCalendarRequest,
  googleDriveRequest,
  hubspotRequest,
  intercomRequest,
  jiraApiRequest,
  linearGraphqlRequest,
  mailchimpRequest,
  microsoftGraphRequest,
  miroRequest,
  mondayGraphqlRequest,
  notionRequest,
  oktaRequest,
  pagerDutyRequest,
  pipedriveRequest,
  postmarkRequest,
  salesforceRequest,
  sentryRequest,
  shopifyGraphqlRequest,
  slackRequest,
  stripeRequest,
  todoistRequest,
  trelloRequest,
  twilioRequest,
  zendeskRequest,
  zoomRequest
} from "./serviceRequests.js";
import {
  encodePathSegment,
  readArrayLength,
  readCollectionLength,
  readEnum,
  readLimit,
  readNestedObjectText,
  readNestedRecord,
  readObjectText,
  readOptionalString,
  readRecord,
  readRequiredIsoDate,
  readRequiredString,
  toOutputRecord
} from "./serviceInput.js";
import { createSourceControlExtensions } from "./serviceSourceControlExtensions.js";

export const serviceExtensionDefinitions: BuiltInServiceExtension[] = [
  ...createSourceControlExtensions(),
  createConfluenceExtension(),
  createSlackExtension(),
  createNotionExtension(),
  createAirtableExtension(),
  createHubSpotExtension(),
  createSalesforceExtension(),
  createZendeskExtension(),
  createIntercomExtension(),
  createFreshdeskExtension(),
  createPipedriveExtension(),
  createTodoistExtension(),
  createAsanaExtension(),
  createClickUpExtension(),
  createMondayExtension(),
  createTrelloExtension(),
  createStripeExtension(),
  createShopifyExtension(),
  createMailchimpExtension(),
  createPostmarkExtension(),
  createTwilioExtension(),
  createGoogleCalendarExtension(),
  createCalendlyExtension(),
  createMiroExtension(),
  createZoomExtension(),
  createFigmaExtension(),
  createGmailExtension(),
  createGoogleDriveExtension(),
  createDropboxExtension(),
  createMicrosoft365Extension(),
  createLinearExtension(),
  createSentryExtension(),
  createPagerDutyExtension(),
  createDatadogExtension(),
  createCloudflareExtension(),
  createOktaExtension(),
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

function createSalesforceExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "salesforce",
    name: "Salesforce",
    description: "通过 Salesforce REST API 读取账号、联系人和商机摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "instanceUrl",
          label: "Salesforce instance URL",
          description: "Salesforce 实例地址, 例如 https://your-domain.my.salesforce.com",
          placeholder: "https://your-domain.my.salesforce.com"
        },
        {
          id: "accessToken",
          label: "OAuth access token",
          description: "Salesforce Connected App OAuth access token",
          placeholder: "salesforce_access_token"
        }
      ]
    },
    permissions: [
      {
        id: "salesforce.read",
        label: "读取 Salesforce",
        description: "允许读取 Salesforce 当前用户、账号、联系人和商机摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getIdentity",
        label: "查看身份",
        description: "读取当前 Salesforce OAuth 身份摘要",
        permission: "salesforce.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listAccounts",
        label: "列出客户",
        description: "读取 Salesforce Account 摘要",
        permission: "salesforce.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listOpportunities",
        label: "列出商机",
        description: "读取 Salesforce Opportunity 摘要",
        permission: "salesforce.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getIdentity: async (_input, context) => {
      const { instanceUrl, token } = await readSalesforceCredentials(context);
      const result = await salesforceRequest({
        instanceUrl,
        method: "GET",
        path: "/services/oauth2/userinfo",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Salesforce 当前用户: ${readObjectText(result, "name", "unknown")}`
      };
    },
    listAccounts: async (input, context) => {
      const { instanceUrl, token } = await readSalesforceCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await salesforceRequest({
        instanceUrl,
        method: "GET",
        path: "/services/data/v61.0/query",
        query: {
          q: `SELECT Id, Name, Industry, Type, LastModifiedDate FROM Account ORDER BY LastModifiedDate DESC LIMIT ${limit}`
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Salesforce 返回 ${readArrayLength(readRecord(result).records)} 个客户`
      };
    },
    listOpportunities: async (input, context) => {
      const { instanceUrl, token } = await readSalesforceCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await salesforceRequest({
        instanceUrl,
        method: "GET",
        path: "/services/data/v61.0/query",
        query: {
          q: `SELECT Id, Name, StageName, Amount, CloseDate, LastModifiedDate FROM Opportunity ORDER BY LastModifiedDate DESC LIMIT ${limit}`
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Salesforce 返回 ${readArrayLength(readRecord(result).records)} 个商机`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `salesforce ${actionId}`
  };
}

function createZendeskExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "zendesk",
    name: "Zendesk",
    description: "读取 Zendesk Support 当前用户、工单列表和工单搜索结果",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "subdomain",
          label: "Zendesk subdomain",
          description: "Zendesk 子域名, 例如 example 表示 https://example.zendesk.com",
          placeholder: "example"
        },
        {
          id: "accessToken",
          label: "OAuth access token",
          description: "Zendesk OAuth access token",
          placeholder: "zendesk_access_token"
        }
      ]
    },
    permissions: [
      {
        id: "zendesk.read",
        label: "读取 Zendesk",
        description: "允许读取 Zendesk 当前用户、工单和搜索结果摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Zendesk 用户资料",
        permission: "zendesk.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listTickets",
        label: "列出工单",
        description: "读取 Zendesk 最近工单摘要",
        permission: "zendesk.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "searchTickets",
        label: "搜索工单",
        description: "按 Zendesk 搜索语法读取工单摘要",
        permission: "zendesk.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          query: { type: "string", description: "搜索条件, 会自动追加 type:ticket" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const { subdomain, token } = await readZendeskCredentials(context);
      const result = await zendeskRequest({
        method: "GET",
        path: "/users/me.json",
        subdomain,
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Zendesk 当前用户: ${readNestedObjectText(result, ["user", "name"], "unknown")}`
      };
    },
    listTickets: async (input, context) => {
      const { subdomain, token } = await readZendeskCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await zendeskRequest({
        method: "GET",
        path: "/tickets.json",
        query: {
          per_page: String(limit)
        },
        subdomain,
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Zendesk 返回 ${readArrayLength(readRecord(result).tickets)} 个工单`
      };
    },
    searchTickets: async (input, context) => {
      const { subdomain, token } = await readZendeskCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const query = readOptionalString(input.query, 500);
      const result = await zendeskRequest({
        method: "GET",
        path: "/search.json",
        query: {
          per_page: String(limit),
          query: query ? `type:ticket ${query}` : "type:ticket"
        },
        subdomain,
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Zendesk 搜索返回 ${readArrayLength(readRecord(result).results)} 个工单`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "searchTickets"
        ? `zendesk ${String(input.query ?? "")}`
        : `zendesk ${actionId}`
  };
}

function createIntercomExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "intercom",
    name: "Intercom",
    description: "读取 Intercom 当前管理员、联系人和会话摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "accessToken",
          label: "Access token",
          description: "Intercom private app access token 或 OAuth access token",
          placeholder: "intercom_access_token"
        }
      ]
    },
    permissions: [
      {
        id: "intercom.read",
        label: "读取 Intercom",
        description: "允许读取 Intercom 当前管理员、联系人和会话摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentAdmin",
        label: "查看当前管理员",
        description: "读取当前授权 Intercom 管理员和 workspace 摘要",
        permission: "intercom.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listContacts",
        label: "列出联系人",
        description: "读取 Intercom 联系人摘要",
        permission: "intercom.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listConversations",
        label: "列出会话",
        description: "读取 Intercom 会话摘要",
        permission: "intercom.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentAdmin: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Intercom access token");
      const result = await intercomRequest({
        method: "GET",
        path: "/me",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Intercom 当前管理员: ${readObjectText(result, "name", "unknown")}`
      };
    },
    listContacts: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Intercom access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await intercomRequest({
        method: "GET",
        path: "/contacts",
        query: {
          per_page: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Intercom 返回 ${readArrayLength(readRecord(result).data)} 个联系人`
      };
    },
    listConversations: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Intercom access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await intercomRequest({
        method: "GET",
        path: "/conversations",
        query: {
          per_page: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Intercom 返回 ${readArrayLength(readRecord(result).conversations)} 个会话`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `intercom ${actionId}`
  };
}

function createFreshdeskExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "freshdesk",
    name: "Freshdesk",
    description: "读取 Freshdesk 工单、联系人和公司摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "domain",
          label: "Freshdesk domain",
          description: "Freshdesk 域名, 例如 example.freshdesk.com 或 example",
          placeholder: "example.freshdesk.com"
        },
        {
          id: "apiKey",
          label: "Freshdesk API key",
          description: "Freshdesk API key, 建议使用只读角色或最小权限账号",
          placeholder: "freshdesk_api_key"
        }
      ]
    },
    permissions: [
      {
        id: "freshdesk.read",
        label: "读取 Freshdesk",
        description: "允许读取 Freshdesk 工单、联系人和公司摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listTickets",
        label: "列出工单",
        description: "读取 Freshdesk 最近工单摘要",
        permission: "freshdesk.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listContacts",
        label: "列出联系人",
        description: "读取 Freshdesk 联系人摘要",
        permission: "freshdesk.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listCompanies",
        label: "列出公司",
        description: "读取 Freshdesk 公司摘要",
        permission: "freshdesk.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listTickets: async (input, context) => {
      const credentials = await readFreshdeskCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await freshdeskRequest({
        credentials,
        method: "GET",
        path: "/tickets",
        query: {
          per_page: String(limit)
        }
      });

      return {
        output: Array.isArray(result) ? { tickets: result } : toOutputRecord(result),
        outputSummary: `Freshdesk 返回 ${readArrayLength(result)} 个工单`
      };
    },
    listContacts: async (input, context) => {
      const credentials = await readFreshdeskCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await freshdeskRequest({
        credentials,
        method: "GET",
        path: "/contacts",
        query: {
          per_page: String(limit)
        }
      });

      return {
        output: Array.isArray(result) ? { contacts: result } : toOutputRecord(result),
        outputSummary: `Freshdesk 返回 ${readArrayLength(result)} 个联系人`
      };
    },
    listCompanies: async (input, context) => {
      const credentials = await readFreshdeskCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await freshdeskRequest({
        credentials,
        method: "GET",
        path: "/companies",
        query: {
          per_page: String(limit)
        }
      });

      return {
        output: Array.isArray(result) ? { companies: result } : toOutputRecord(result),
        outputSummary: `Freshdesk 返回 ${readArrayLength(result)} 个公司`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `freshdesk ${actionId}`
  };
}

function createPipedriveExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "pipedrive",
    name: "Pipedrive",
    description: "读取 Pipedrive 当前用户、交易和组织摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "apiToken",
          label: "Pipedrive API token",
          description: "Pipedrive app 里生成的 API token",
          placeholder: "pipedrive_api_token"
        }
      ]
    },
    permissions: [
      {
        id: "pipedrive.read",
        label: "读取 Pipedrive",
        description: "允许读取 Pipedrive 当前用户、交易和组织摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Pipedrive 用户资料",
        permission: "pipedrive.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listDeals",
        label: "列出交易",
        description: "读取 Pipedrive Deals 摘要",
        permission: "pipedrive.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listOrganizations",
        label: "列出组织",
        description: "读取 Pipedrive Organizations 摘要",
        permission: "pipedrive.read",
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
      const token = await readSecret(context, "apiToken", "Pipedrive API token");
      const result = await pipedriveRequest({
        method: "GET",
        path: "/users/me",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Pipedrive 当前用户: ${readNestedObjectText(result, ["data", "name"], "unknown")}`
      };
    },
    listDeals: async (input, context) => {
      const token = await readSecret(context, "apiToken", "Pipedrive API token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await pipedriveRequest({
        method: "GET",
        path: "/deals",
        query: {
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Pipedrive 返回 ${readArrayLength(readRecord(result).data)} 个交易`
      };
    },
    listOrganizations: async (input, context) => {
      const token = await readSecret(context, "apiToken", "Pipedrive API token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await pipedriveRequest({
        method: "GET",
        path: "/organizations",
        query: {
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Pipedrive 返回 ${readArrayLength(readRecord(result).data)} 个组织`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `pipedrive ${actionId}`
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

function createAsanaExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "asana",
    name: "Asana",
    description: "读取 Asana 当前用户、工作区、项目和任务摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Asana OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "asana_access_token",
      oauth: {
        provider: "Asana",
        authorizationUrl: "https://app.asana.com/-/oauth_authorize",
        tokenUrl: "https://app.asana.com/-/oauth_token",
        brokerAuthorizationUrl: createBrokerUrl("asana", "authorize"),
        brokerTokenUrl: createBrokerUrl("asana", "token"),
        scopes: ["users:read", "workspaces:read", "projects:read", "tasks:read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developers.asana.com/docs/oauth",
        setupUrl: "https://app.asana.com/0/my-apps",
        redirectUriMode: "brokered",
        usePkce: true,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "asana.read",
        label: "读取 Asana",
        description: "允许读取 Asana 当前用户、工作区、项目和任务摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Asana 用户资料",
        permission: "asana.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listWorkspaces",
        label: "列出工作区",
        description: "读取当前授权账号可见的 Asana 工作区",
        permission: "asana.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listProjects",
        label: "列出项目",
        description: "读取指定 Asana 工作区下的项目",
        permission: "asana.read",
        risk: "read",
        confirmation: "ask",
        required: ["workspaceGid"],
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          workspaceGid: { type: "string", description: "Asana workspace gid" }
        }
      }),
      createAction({
        id: "listTasks",
        label: "列出任务",
        description: "读取指定 Asana 项目下的任务",
        permission: "asana.read",
        risk: "read",
        confirmation: "ask",
        required: ["projectGid"],
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          projectGid: { type: "string", description: "Asana project gid" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Asana access token");
      const result = await asanaRequest({
        method: "GET",
        path: "/users/me",
        query: {
          opt_fields: "gid,name,email"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Asana 当前用户: ${readNestedObjectText(result, ["data", "name"], "unknown")}`
      };
    },
    listWorkspaces: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Asana access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await asanaRequest({
        method: "GET",
        path: "/workspaces",
        query: {
          limit: String(limit),
          opt_fields: "gid,name"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Asana 返回 ${readArrayLength(readRecord(result).data)} 个工作区`
      };
    },
    listProjects: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Asana access token");
      const workspaceGid = readRequiredString(input.workspaceGid, "workspaceGid", 120);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await asanaRequest({
        method: "GET",
        path: `/workspaces/${encodePathSegment(workspaceGid)}/projects`,
        query: {
          limit: String(limit),
          opt_fields: "gid,name,archived,modified_at,permalink_url"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Asana 返回 ${readArrayLength(readRecord(result).data)} 个项目`
      };
    },
    listTasks: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Asana access token");
      const projectGid = readRequiredString(input.projectGid, "projectGid", 120);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await asanaRequest({
        method: "GET",
        path: `/projects/${encodePathSegment(projectGid)}/tasks`,
        query: {
          limit: String(limit),
          opt_fields: "gid,name,completed,assignee.name,due_on,permalink_url"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Asana 返回 ${readArrayLength(readRecord(result).data)} 个任务`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listTasks"
        ? `asana tasks ${String(input.projectGid ?? "")}`
        : `asana ${String(input.workspaceGid ?? actionId)}`
  };
}

function createClickUpExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "clickup",
    name: "ClickUp",
    description: "读取 ClickUp 当前用户、工作区、空间和任务摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "ClickUp OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "clickup_access_token",
      oauth: {
        provider: "ClickUp",
        authorizationUrl: "https://app.clickup.com/api",
        tokenUrl: "https://api.clickup.com/api/v2/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("clickup", "authorize"),
        brokerTokenUrl: createBrokerUrl("clickup", "token"),
        scopes: [],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developer.clickup.com/docs/authentication",
        setupUrl: "https://app.clickup.com/settings/apps",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "clickup.read",
        label: "读取 ClickUp",
        description: "允许读取 ClickUp 当前用户、工作区、空间和任务摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 ClickUp 用户资料",
        permission: "clickup.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listWorkspaces",
        label: "列出工作区",
        description: "读取当前授权账号可访问的 ClickUp 工作区",
        permission: "clickup.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listSpaces",
        label: "列出空间",
        description: "读取指定 ClickUp 工作区下的空间",
        permission: "clickup.read",
        risk: "read",
        confirmation: "ask",
        required: ["teamId"],
        properties: {
          teamId: { type: "string", description: "ClickUp 工作区 team ID" },
          archived: { type: "boolean", description: "是否包含归档空间, 默认 false" }
        }
      }),
      createAction({
        id: "listTasks",
        label: "列出任务",
        description: "读取指定 ClickUp list 下的任务",
        permission: "clickup.read",
        risk: "read",
        confirmation: "ask",
        required: ["listId"],
        properties: {
          listId: { type: "string", description: "ClickUp list ID" },
          includeClosed: { type: "boolean", description: "是否包含已关闭任务, 默认 false" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "ClickUp access token");
      const result = await clickupRequest({
        method: "GET",
        path: "/user",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `ClickUp 当前用户: ${readNestedObjectText(result, ["user", "username"], "unknown")}`
      };
    },
    listWorkspaces: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "ClickUp access token");
      const result = await clickupRequest({
        method: "GET",
        path: "/team",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `ClickUp 返回 ${readArrayLength(readRecord(result).teams)} 个工作区`
      };
    },
    listSpaces: async (input, context) => {
      const token = await readSecret(context, "accessToken", "ClickUp access token");
      const teamId = readRequiredString(input.teamId, "teamId", 120);
      const includeArchived = input.archived === true;
      const result = await clickupRequest({
        method: "GET",
        path: `/team/${encodePathSegment(teamId)}/space`,
        query: {
          archived: String(includeArchived)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `ClickUp 返回 ${readArrayLength(readRecord(result).spaces)} 个空间`
      };
    },
    listTasks: async (input, context) => {
      const token = await readSecret(context, "accessToken", "ClickUp access token");
      const listId = readRequiredString(input.listId, "listId", 120);
      const includeClosed = input.includeClosed === true;
      const result = await clickupRequest({
        method: "GET",
        path: `/list/${encodePathSegment(listId)}/task`,
        query: {
          include_closed: String(includeClosed)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `ClickUp 返回 ${readArrayLength(readRecord(result).tasks)} 个任务`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listTasks"
        ? `clickup list ${String(input.listId ?? "")}`
        : `clickup ${String(input.teamId ?? actionId)}`
  };
}

function createMondayExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "monday",
    name: "monday.com",
    description: "读取 monday.com 当前用户、看板和工作区摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "monday.com OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "monday_access_token",
      oauth: {
        provider: "monday.com",
        authorizationUrl: "https://auth.monday.com/oauth2/authorize",
        tokenUrl: "https://auth.monday.com/oauth2/token",
        brokerAuthorizationUrl: createBrokerUrl("monday", "authorize"),
        brokerTokenUrl: createBrokerUrl("monday", "token"),
        scopes: ["me:read", "boards:read", "workspaces:read"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developer.monday.com/apps/docs/oauth",
        setupUrl: "https://developer.monday.com/apps",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "monday.read",
        label: "读取 monday.com",
        description: "允许读取 monday.com 当前用户、看板和工作区摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 monday.com 用户资料",
        permission: "monday.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listBoards",
        label: "列出看板",
        description: "读取当前授权账号可见的 monday.com boards",
        permission: "monday.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listWorkspaces",
        label: "列出工作区",
        description: "读取当前授权账号可见的 monday.com workspaces",
        permission: "monday.read",
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
      const token = await readSecret(context, "accessToken", "monday.com access token");
      const result = await mondayGraphqlRequest({
        query: `query ForgeCurrentUser {
          me {
            id
            name
            email
            account {
              id
              name
              slug
            }
          }
        }`,
        token
      });

      return {
        output: result,
        outputSummary: `monday.com 当前用户: ${readNestedObjectText(result, ["me", "name"], "unknown")}`
      };
    },
    listBoards: async (input, context) => {
      const token = await readSecret(context, "accessToken", "monday.com access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await mondayGraphqlRequest({
        query: `query ForgeBoards($limit: Int!) {
          boards(limit: $limit) {
            id
            name
            state
            board_kind
            updated_at
          }
        }`,
        token,
        variables: {
          limit
        }
      });

      return {
        output: result,
        outputSummary: `monday.com 返回 ${readArrayLength(readRecord(result).boards)} 个看板`
      };
    },
    listWorkspaces: async (input, context) => {
      const token = await readSecret(context, "accessToken", "monday.com access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await mondayGraphqlRequest({
        query: `query ForgeWorkspaces($limit: Int!) {
          workspaces(limit: $limit) {
            id
            name
            kind
            description
          }
        }`,
        token,
        variables: {
          limit
        }
      });

      return {
        output: result,
        outputSummary: `monday.com 返回 ${readArrayLength(readRecord(result).workspaces)} 个工作区`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `monday ${actionId}`
  };
}

function createTrelloExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "trello",
    name: "Trello",
    description: "读取 Trello 当前成员、看板和卡片摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "apiKey",
          label: "Trello API key",
          description: "Trello Power-Up API key",
          placeholder: "trello_api_key"
        },
        {
          id: "token",
          label: "Trello token",
          description: "通过 Trello 授权页面生成的用户 token",
          placeholder: "trello_token"
        }
      ]
    },
    permissions: [
      {
        id: "trello.read",
        label: "读取 Trello",
        description: "允许读取 Trello 当前成员、看板和卡片摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentMember",
        label: "查看当前成员",
        description: "读取当前 Trello 成员资料",
        permission: "trello.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listBoards",
        label: "列出看板",
        description: "读取当前成员可见的 Trello 看板",
        permission: "trello.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listBoardCards",
        label: "列出卡片",
        description: "读取指定 Trello 看板的打开卡片",
        permission: "trello.read",
        risk: "read",
        confirmation: "ask",
        required: ["boardId"],
        properties: {
          boardId: { type: "string", description: "Trello board ID" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentMember: async (_input, context) => {
      const credentials = await readTrelloCredentials(context);
      const result = await trelloRequest({
        credentials,
        method: "GET",
        path: "/members/me",
        query: {
          fields: "username,fullName,url"
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Trello 当前成员: ${readObjectText(result, "username", "unknown")}`
      };
    },
    listBoards: async (_input, context) => {
      const credentials = await readTrelloCredentials(context);
      const result = await trelloRequest({
        credentials,
        method: "GET",
        path: "/members/me/boards",
        query: {
          fields: "name,url,dateLastActivity",
          filter: "open",
          lists: "none"
        }
      });

      return {
        output: Array.isArray(result) ? { boards: result } : toOutputRecord(result),
        outputSummary: `Trello 返回 ${readArrayLength(result)} 个看板`
      };
    },
    listBoardCards: async (input, context) => {
      const credentials = await readTrelloCredentials(context);
      const boardId = readRequiredString(input.boardId, "boardId", 120);
      const result = await trelloRequest({
        credentials,
        method: "GET",
        path: `/boards/${encodePathSegment(boardId)}/cards`,
        query: {
          fields: "name,url,due,dateLastActivity,idList",
          filter: "open"
        }
      });

      return {
        output: Array.isArray(result) ? { cards: result } : toOutputRecord(result),
        outputSummary: `Trello 看板 ${boardId} 返回 ${readArrayLength(result)} 张卡片`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listBoardCards"
        ? `trello ${String(input.boardId ?? "")}`
        : `trello ${actionId}`
  };
}

function createStripeExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "stripe",
    name: "Stripe",
    description: "读取 Stripe 账号、客户和付款摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "secretKey",
          label: "Stripe secret key",
          description: "Stripe restricted key 或 secret key, 建议只授予读取权限",
          placeholder: "sk_live_..."
        }
      ]
    },
    permissions: [
      {
        id: "stripe.read",
        label: "读取 Stripe",
        description: "允许读取 Stripe 账号、客户和付款摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getAccount",
        label: "查看账号",
        description: "读取当前 Stripe 账号摘要",
        permission: "stripe.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listCustomers",
        label: "列出客户",
        description: "读取 Stripe 客户列表",
        permission: "stripe.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listCharges",
        label: "列出付款",
        description: "读取 Stripe charges 摘要",
        permission: "stripe.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getAccount: async (_input, context) => {
      const token = await readSecret(context, "secretKey", "Stripe secret key");
      const result = await stripeRequest({
        method: "GET",
        path: "/account",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Stripe 账号: ${readObjectText(result, "id", "unknown")}`
      };
    },
    listCustomers: async (input, context) => {
      const token = await readSecret(context, "secretKey", "Stripe secret key");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await stripeRequest({
        method: "GET",
        path: "/customers",
        query: {
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Stripe 返回 ${readArrayLength(readRecord(result).data)} 个客户`
      };
    },
    listCharges: async (input, context) => {
      const token = await readSecret(context, "secretKey", "Stripe secret key");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await stripeRequest({
        method: "GET",
        path: "/charges",
        query: {
          limit: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Stripe 返回 ${readArrayLength(readRecord(result).data)} 条付款记录`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `stripe ${actionId}`
  };
}

function createShopifyExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "shopify",
    name: "Shopify",
    description: "通过 Shopify Admin API 读取店铺、商品和订单摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "storeDomain",
          label: "Shopify store domain",
          description: "Shopify 店铺域名, 例如 example.myshopify.com",
          placeholder: "example.myshopify.com"
        },
        {
          id: "adminAccessToken",
          label: "Admin API access token",
          description: "Shopify Admin API access token, 建议只授予读取商品和订单的 scope",
          placeholder: "shpat_..."
        }
      ]
    },
    permissions: [
      {
        id: "shopify.read",
        label: "读取 Shopify",
        description: "允许读取 Shopify 店铺、商品和订单摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getShop",
        label: "查看店铺",
        description: "读取 Shopify 店铺摘要",
        permission: "shopify.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listProducts",
        label: "列出商品",
        description: "读取 Shopify 商品摘要",
        permission: "shopify.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          query: { type: "string", description: "Shopify 商品搜索语法" }
        }
      }),
      createAction({
        id: "listOrders",
        label: "列出订单",
        description: "读取 Shopify 订单摘要",
        permission: "shopify.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          query: { type: "string", description: "Shopify 订单搜索语法" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getShop: async (_input, context) => {
      const credentials = await readShopifyCredentials(context);
      const result = await shopifyGraphqlRequest({
        credentials,
        query: `query ForgeShop {
          shop {
            name
            myshopifyDomain
            primaryDomain {
              url
            }
          }
        }`
      });

      return {
        output: result,
        outputSummary: `Shopify 店铺: ${readNestedObjectText(result, ["shop", "name"], "unknown")}`
      };
    },
    listProducts: async (input, context) => {
      const credentials = await readShopifyCredentials(context);
      const first = readLimit(input.limit, defaultListLimit);
      const queryText = readOptionalString(input.query, 500);
      const result = await shopifyGraphqlRequest({
        credentials,
        query: `query ForgeProducts($first: Int!, $query: String) {
          products(first: $first, query: $query) {
            nodes {
              id
              title
              handle
              status
              updatedAt
            }
          }
        }`,
        variables: {
          first,
          query: queryText || null
        }
      });

      return {
        output: result,
        outputSummary: `Shopify 返回 ${readArrayLength(readNestedRecord(result, ["products"]).nodes)} 个商品`
      };
    },
    listOrders: async (input, context) => {
      const credentials = await readShopifyCredentials(context);
      const first = readLimit(input.limit, defaultListLimit);
      const queryText = readOptionalString(input.query, 500);
      const result = await shopifyGraphqlRequest({
        credentials,
        query: `query ForgeOrders($first: Int!, $query: String) {
          orders(first: $first, query: $query) {
            nodes {
              id
              name
              displayFinancialStatus
              displayFulfillmentStatus
              updatedAt
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
          }
        }`,
        variables: {
          first,
          query: queryText || null
        }
      });

      return {
        output: result,
        outputSummary: `Shopify 返回 ${readArrayLength(readNestedRecord(result, ["orders"]).nodes)} 个订单`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listProducts" || actionId === "listOrders"
        ? `shopify ${actionId} ${String(input.query ?? "")}`
        : `shopify ${actionId}`
  };
}

function createMailchimpExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "mailchimp",
    name: "Mailchimp",
    description: "读取 Mailchimp 账号、受众和营销活动摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "serverPrefix",
          label: "Mailchimp server prefix",
          description: "Mailchimp API key 末尾的 data center 前缀, 例如 us21",
          placeholder: "us21"
        },
        {
          id: "apiKey",
          label: "Mailchimp API key",
          description: "Mailchimp Marketing API key",
          placeholder: "mailchimp_api_key"
        }
      ]
    },
    permissions: [
      {
        id: "mailchimp.read",
        label: "读取 Mailchimp",
        description: "允许读取 Mailchimp 账号、受众和营销活动摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getAccount",
        label: "查看账号",
        description: "读取当前 Mailchimp 账号摘要",
        permission: "mailchimp.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listAudiences",
        label: "列出受众",
        description: "读取 Mailchimp audiences/lists 摘要",
        permission: "mailchimp.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listCampaigns",
        label: "列出活动",
        description: "读取 Mailchimp campaigns 摘要",
        permission: "mailchimp.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getAccount: async (_input, context) => {
      const credentials = await readMailchimpCredentials(context);
      const result = await mailchimpRequest({
        credentials,
        method: "GET",
        path: "/"
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Mailchimp 账号: ${readObjectText(result, "account_name", "unknown")}`
      };
    },
    listAudiences: async (input, context) => {
      const credentials = await readMailchimpCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await mailchimpRequest({
        credentials,
        method: "GET",
        path: "/lists",
        query: {
          count: String(limit)
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Mailchimp 返回 ${readArrayLength(readRecord(result).lists)} 个受众`
      };
    },
    listCampaigns: async (input, context) => {
      const credentials = await readMailchimpCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await mailchimpRequest({
        credentials,
        method: "GET",
        path: "/campaigns",
        query: {
          count: String(limit)
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Mailchimp 返回 ${readArrayLength(readRecord(result).campaigns)} 个活动`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `mailchimp ${actionId}`
  };
}

function createPostmarkExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "postmark",
    name: "Postmark",
    description: "读取 Postmark 消息摘要, 并在确认后发送事务邮件",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "serverToken",
          label: "Postmark server token",
          description: "Postmark Server API token, 测试可使用 POSTMARK_API_TEST",
          placeholder: "postmark_server_token"
        }
      ]
    },
    permissions: [
      {
        id: "postmark.read",
        label: "读取 Postmark",
        description: "允许读取 Postmark outbound/inbound 消息摘要",
        defaultMode: "ask"
      },
      {
        id: "postmark.send",
        label: "发送 Postmark 邮件",
        description: "允许通过 Postmark 发送真实事务邮件",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listOutboundMessages",
        label: "列出发件",
        description: "读取 Postmark outbound messages 摘要",
        permission: "postmark.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listInboundMessages",
        label: "列出收件",
        description: "读取 Postmark inbound messages 摘要",
        permission: "postmark.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "sendEmail",
        label: "发送邮件",
        description: "通过 Postmark 发送事务邮件",
        permission: "postmark.send",
        risk: "send",
        confirmation: "always",
        required: ["from", "to", "subject", "textBody"],
        properties: {
          from: { type: "string", description: "发件人邮箱" },
          to: { type: "string", description: "收件人邮箱, 多人用逗号分隔" },
          subject: { type: "string", description: "邮件标题" },
          textBody: { type: "string", description: "纯文本正文" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listOutboundMessages: async (input, context) => {
      const token = await readSecret(context, "serverToken", "Postmark server token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await postmarkRequest({
        method: "GET",
        path: "/messages/outbound",
        query: {
          count: String(limit),
          offset: "0"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Postmark 返回 ${readArrayLength(readRecord(result).Messages)} 个发件`
      };
    },
    listInboundMessages: async (input, context) => {
      const token = await readSecret(context, "serverToken", "Postmark server token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await postmarkRequest({
        method: "GET",
        path: "/messages/inbound",
        query: {
          count: String(limit),
          offset: "0"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Postmark 返回 ${readArrayLength(readRecord(result).InboundMessages)} 个收件`
      };
    },
    sendEmail: async (input, context) => {
      const token = await readSecret(context, "serverToken", "Postmark server token");
      const from = readRequiredString(input.from, "from", 320);
      const to = readRequiredString(input.to, "to", 2_000);
      const subject = readRequiredString(input.subject, "subject", 300);
      const textBody = readRequiredString(input.textBody, "textBody", 20_000);
      const result = await postmarkRequest({
        body: {
          From: from,
          To: to,
          Subject: subject,
          TextBody: textBody
        },
        method: "POST",
        path: "/email",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `已通过 Postmark 发送邮件: ${subject}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "sendEmail"
        ? `postmark send ${String(input.subject ?? "")}`
        : `postmark ${actionId}`
  };
}

function createTwilioExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "twilio",
    name: "Twilio",
    description: "读取 Twilio 账号、短信和通话摘要",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "accountSid",
          label: "Twilio Account SID",
          description: "Twilio Account SID",
          placeholder: "AC..."
        },
        {
          id: "authToken",
          label: "Twilio Auth Token",
          description: "Twilio Auth Token 或用于测试的受限凭据",
          placeholder: "twilio_auth_token"
        }
      ]
    },
    permissions: [
      {
        id: "twilio.read",
        label: "读取 Twilio",
        description: "允许读取 Twilio 账号、短信和通话摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getAccount",
        label: "查看账号",
        description: "读取 Twilio 账号摘要",
        permission: "twilio.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listMessages",
        label: "列出短信",
        description: "读取 Twilio Message 日志摘要",
        permission: "twilio.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listCalls",
        label: "列出通话",
        description: "读取 Twilio Call 日志摘要",
        permission: "twilio.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getAccount: async (_input, context) => {
      const credentials = await readTwilioCredentials(context);
      const result = await twilioRequest({
        credentials,
        method: "GET",
        path: `/2010-04-01/Accounts/${encodePathSegment(credentials.accountSid)}.json`
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Twilio 账号: ${readObjectText(result, "friendly_name", credentials.accountSid)}`
      };
    },
    listMessages: async (input, context) => {
      const credentials = await readTwilioCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await twilioRequest({
        credentials,
        method: "GET",
        path: `/2010-04-01/Accounts/${encodePathSegment(credentials.accountSid)}/Messages.json`,
        query: {
          PageSize: String(limit)
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Twilio 返回 ${readArrayLength(readRecord(result).messages)} 条短信`
      };
    },
    listCalls: async (input, context) => {
      const credentials = await readTwilioCredentials(context);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await twilioRequest({
        credentials,
        method: "GET",
        path: `/2010-04-01/Accounts/${encodePathSegment(credentials.accountSid)}/Calls.json`,
        query: {
          PageSize: String(limit)
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Twilio 返回 ${readArrayLength(readRecord(result).calls)} 条通话记录`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `twilio ${actionId}`
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
