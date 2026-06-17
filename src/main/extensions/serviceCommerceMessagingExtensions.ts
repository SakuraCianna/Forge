// 本文件说明: 定义商业与消息类内置服务 Extension, 包含 Stripe/Shopify/Mailchimp/Postmark/Twilio
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type { ExtensionActionHandler } from "./qqMailExtension.js";
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import {
  createAction,
  defaultListLimit
} from "./serviceExtensionCore.js";
import {
  readMailchimpCredentials,
  readSecret,
  readShopifyCredentials,
  readTwilioCredentials
} from "./serviceCredentials.js";
import {
  mailchimpRequest,
  postmarkRequest,
  shopifyGraphqlRequest,
  stripeRequest,
  twilioRequest
} from "./serviceRequests.js";
import {
  encodePathSegment,
  readArrayLength,
  readLimit,
  readNestedObjectText,
  readNestedRecord,
  readObjectText,
  readOptionalString,
  readRecord,
  readRequiredString,
  toOutputRecord
} from "./serviceInput.js";

export function createCommerceMessagingExtensions(): BuiltInServiceExtension[] {
  return [
    createStripeExtension(),
    createShopifyExtension(),
    createMailchimpExtension(),
    createPostmarkExtension(),
    createTwilioExtension()
  ];
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