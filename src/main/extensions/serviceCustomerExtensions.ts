// 本文件说明: 注册客户与支持类内置服务 Extension, 通过官方 API 执行受控只读动作
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type { ExtensionActionHandler } from "./qqMailExtension.js";
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import {
  readFreshdeskCredentials,
  readSalesforceCredentials,
  readSecret,
  readZendeskCredentials
} from "./serviceCredentials.js";
import {
  freshdeskRequest,
  intercomRequest,
  pipedriveRequest,
  salesforceRequest,
  zendeskRequest
} from "./serviceRequests.js";
import {
  readArrayLength,
  readLimit,
  readNestedObjectText,
  readObjectText,
  readOptionalString,
  readRecord,
  toOutputRecord
} from "./serviceInput.js";
import {
  createAction,
  defaultListLimit
} from "./serviceExtensionCore.js";

export function createCustomerExtensions(): BuiltInServiceExtension[] {
  return [
    createSalesforceExtension(),
    createZendeskExtension(),
    createIntercomExtension(),
    createFreshdeskExtension(),
    createPipedriveExtension()
  ];
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
