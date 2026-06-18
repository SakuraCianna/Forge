// 本文件说明: 注册中国境内和欧洲常见服务的内置 Extension
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type { ExtensionActionHandler } from "./qqMailExtension.js";
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import { createOAuthTokenAuth } from "./serviceAuth.js";
import {
  readNextcloudCredentials,
  readSecret,
  readWebhookUrl
} from "./serviceCredentials.js";
import {
  createAction,
  defaultListLimit
} from "./serviceExtensionCore.js";
import {
  giteeRequest,
  hetznerCloudRequest,
  nextcloudOcsRequest,
  webhookJsonPost
} from "./serviceRequests.js";
import {
  encodePathSegment,
  readArrayLength,
  readEnum,
  readLimit,
  readNestedRecord,
  readObjectText,
  readOptionalString,
  readOptionalStringList,
  readRecord,
  readRequiredString,
  toOutputRecord
} from "./serviceInput.js";

export function createRegionalExtensions(): BuiltInServiceExtension[] {
  return [
    createGiteeExtension(),
    createDingTalkExtension(),
    createWeComExtension(),
    createFeishuExtension(),
    createNextcloudExtension(),
    createHetznerCloudExtension()
  ];
}

function createGiteeExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "gitee",
    name: "Gitee",
    description: "读取 Gitee 当前用户、仓库和 Issue 摘要",
    version: "0.3.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Gitee personal access token, 建议只授予目标仓库所需只读权限",
      accessTokenFieldId: "accessToken",
      accessTokenLabel: "Personal access token",
      accessTokenPlaceholder: "gitee_access_token"
    }),
    permissions: [
      {
        id: "gitee.read",
        label: "读取 Gitee",
        description: "允许读取 Gitee 当前用户、仓库和 Issue 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Gitee token 对应的用户摘要",
        permission: "gitee.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listRepositories",
        label: "列出仓库",
        description: "读取当前用户可访问的 Gitee 仓库列表",
        permission: "gitee.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listRepositoryIssues",
        label: "列出仓库 Issues",
        description: "读取指定 Gitee 仓库的 Issue 列表",
        permission: "gitee.read",
        risk: "read",
        confirmation: "ask",
        required: ["owner", "repo"],
        properties: {
          owner: { type: "string", description: "仓库 owner 或组织名" },
          repo: { type: "string", description: "仓库名称" },
          state: { type: "string", enum: ["open", "closed", "all"], description: "Issue 状态" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Gitee access token");
      const user = await giteeRequest({
        method: "GET",
        path: "/user",
        token
      });

      return {
        output: toOutputRecord(user),
        outputSummary: `Gitee 当前用户: ${readObjectText(user, "login", "unknown")}`
      };
    },
    listRepositories: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Gitee access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const repos = await giteeRequest({
        method: "GET",
        path: "/user/repos",
        query: {
          page: "1",
          per_page: String(limit),
          sort: "updated"
        },
        token
      });

      return {
        output: Array.isArray(repos) ? { repositories: repos } : toOutputRecord(repos),
        outputSummary: `Gitee 返回 ${readArrayLength(repos)} 个仓库`
      };
    },
    listRepositoryIssues: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Gitee access token");
      const owner = readRequiredString(input.owner, "owner", 120);
      const repo = readRequiredString(input.repo, "repo", 120);
      const state = readEnum(input.state, ["open", "closed", "all"], "open");
      const limit = readLimit(input.limit, defaultListLimit);
      const issues = await giteeRequest({
        method: "GET",
        path: `/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/issues`,
        query: {
          page: "1",
          per_page: String(limit),
          state
        },
        token
      });

      return {
        output: Array.isArray(issues) ? { issues } : toOutputRecord(issues),
        outputSummary: `Gitee ${owner}/${repo} 返回 ${readArrayLength(issues)} 个 Issue`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listRepositoryIssues"
        ? `gitee ${String(input.owner ?? "")}/${String(input.repo ?? "")}`
        : `gitee ${actionId}`
  };
}

function createDingTalkExtension(): BuiltInServiceExtension {
  return createWebhookMessagingExtension({
    id: "dingtalk",
    name: "DingTalk",
    description: "通过钉钉群机器人 webhook 发送文本和 Markdown 消息",
    permissionId: "dingtalk.send",
    permissionLabel: "发送钉钉消息",
    permissionDescription: "允许向已配置的钉钉群机器人发送真实消息",
    webhookLabel: "钉钉机器人 Webhook",
    webhookDescription: "钉钉群自定义机器人 webhook 地址",
    webhookHosts: ["oapi.dingtalk.com"],
    webhookPlaceholder: "https://oapi.dingtalk.com/robot/send?access_token=...",
    textBody: (content) => ({
      msgtype: "text",
      text: {
        content
      }
    }),
    markdownBody: (title, text) => ({
      markdown: {
        text,
        title
      },
      msgtype: "markdown"
    })
  });
}

function createWeComExtension(): BuiltInServiceExtension {
  return createWebhookMessagingExtension({
    id: "wecom",
    name: "WeCom",
    description: "通过企业微信群机器人 webhook 发送文本和 Markdown 消息",
    permissionId: "wecom.send",
    permissionLabel: "发送企业微信消息",
    permissionDescription: "允许向已配置的企业微信群机器人发送真实消息",
    webhookLabel: "企业微信机器人 Webhook",
    webhookDescription: "企业微信群机器人 webhook 地址",
    webhookHosts: ["qyapi.weixin.qq.com"],
    webhookPlaceholder: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=...",
    textBody: (content, mentionedList) => ({
      msgtype: "text",
      text: {
        content,
        ...(mentionedList.length > 0 ? { mentioned_list: mentionedList } : {})
      }
    }),
    markdownBody: (_title, text) => ({
      markdown: {
        content: text
      },
      msgtype: "markdown"
    })
  });
}

function createFeishuExtension(): BuiltInServiceExtension {
  return createWebhookMessagingExtension({
    id: "feishu",
    name: "Feishu",
    description: "通过飞书自定义机器人 webhook 发送文本和富文本消息",
    permissionId: "feishu.send",
    permissionLabel: "发送飞书消息",
    permissionDescription: "允许向已配置的飞书群机器人发送真实消息",
    webhookLabel: "飞书机器人 Webhook",
    webhookDescription: "飞书群自定义机器人 webhook 地址",
    webhookHosts: ["open.feishu.cn", "open.larksuite.com"],
    webhookPlaceholder: "https://open.feishu.cn/open-apis/bot/v2/hook/...",
    markdownActionLabel: "发送富文本",
    markdownActionDescription: "向飞书群机器人发送富文本消息",
    textBody: (content) => ({
      content: {
        text: content
      },
      msg_type: "text"
    }),
    markdownBody: (title, text) => ({
      content: {
        post: {
          zh_cn: {
            content: [
              [
                {
                  tag: "text",
                  text
                }
              ]
            ],
            title
          }
        }
      },
      msg_type: "post"
    })
  });
}

type WebhookMessagingOptions = {
  description: string;
  id: string;
  markdownActionDescription?: string;
  markdownActionLabel?: string;
  markdownBody: (title: string, text: string, mentionedList: string[]) => Record<string, unknown>;
  name: string;
  permissionDescription: string;
  permissionId: string;
  permissionLabel: string;
  textBody: (content: string, mentionedList: string[]) => Record<string, unknown>;
  webhookDescription: string;
  webhookHosts: readonly string[];
  webhookLabel: string;
  webhookPlaceholder: string;
};

function createWebhookMessagingExtension({
  description,
  id,
  markdownActionDescription = "向群机器人发送 Markdown 消息",
  markdownActionLabel = "发送 Markdown",
  markdownBody,
  name,
  permissionDescription,
  permissionId,
  permissionLabel,
  textBody,
  webhookDescription,
  webhookHosts,
  webhookLabel,
  webhookPlaceholder
}: WebhookMessagingOptions): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id,
    name,
    description,
    version: "0.3.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "webhookUrl",
          label: webhookLabel,
          description: webhookDescription,
          placeholder: webhookPlaceholder
        }
      ]
    },
    permissions: [
      {
        id: permissionId,
        label: permissionLabel,
        description: permissionDescription,
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "sendTextMessage",
        label: "发送文本",
        description: "向群机器人发送文本消息",
        permission: permissionId,
        risk: "send",
        confirmation: "always",
        required: ["content"],
        properties: {
          content: { type: "string", description: "消息正文" },
          mentionedList: {
            type: "array",
            items: { type: "string" },
            description: "可选 @ 用户列表, 企业微信可使用成员 ID 或 @all"
          }
        }
      }),
      createAction({
        id: "sendMarkdownMessage",
        label: markdownActionLabel,
        description: markdownActionDescription,
        permission: permissionId,
        risk: "send",
        confirmation: "always",
        required: ["title", "text"],
        properties: {
          text: { type: "string", description: "Markdown 或富文本正文" },
          title: { type: "string", description: "消息标题" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    sendTextMessage: async (input, context) => {
      const webhookUrl = await readWebhookUrl(
        context,
        "webhookUrl",
        `${name} webhook URL`,
        webhookHosts
      );
      const content = readRequiredString(input.content, "content", 4_000);
      const mentionedList = readWebhookMentionList(input.mentionedList);
      const result = await webhookJsonPost({
        body: textBody(content, mentionedList),
        service: name,
        url: webhookUrl
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `已发送 ${name} 文本消息`
      };
    },
    sendMarkdownMessage: async (input, context) => {
      const webhookUrl = await readWebhookUrl(
        context,
        "webhookUrl",
        `${name} webhook URL`,
        webhookHosts
      );
      const title = readRequiredString(input.title, "title", 200);
      const text = readRequiredString(input.text, "text", 8_000);
      const result = await webhookJsonPost({
        body: markdownBody(title, text, []),
        service: name,
        url: webhookUrl
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `已发送 ${name} 消息: ${title}`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "sendMarkdownMessage"
        ? `${id} ${String(input.title ?? "")}`
        : `${id} ${String(input.content ?? "").slice(0, 80)}`
  };
}

function readWebhookMentionList(value: unknown): string[] {
  return readOptionalStringList(value, "mentionedList", 20).map((item) => {
    if (item.length > 80) {
      throw new Error("mentionedList item is too long");
    }

    return item;
  });
}

function createNextcloudExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "nextcloud",
    name: "Nextcloud",
    description: "读取 Nextcloud OCS 能力、用户资料和用户搜索摘要",
    version: "0.3.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "serverUrl",
          label: "Nextcloud server URL",
          description: "Nextcloud 实例 HTTPS 地址",
          placeholder: "https://cloud.example.com"
        },
        {
          id: "username",
          label: "Username",
          description: "Nextcloud 用户名",
          placeholder: "username"
        },
        {
          id: "appPassword",
          label: "App password",
          description: "Nextcloud 应用密码, 建议不要使用主登录密码",
          placeholder: "nextcloud_app_password"
        }
      ]
    },
    permissions: [
      {
        id: "nextcloud.read",
        label: "读取 Nextcloud",
        description: "允许读取 Nextcloud 服务器能力、用户资料和用户搜索结果",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCapabilities",
        label: "读取能力",
        description: "读取 Nextcloud OCS capabilities",
        permission: "nextcloud.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "getUserMetadata",
        label: "读取用户资料",
        description: "读取指定 Nextcloud 用户资料",
        permission: "nextcloud.read",
        risk: "read",
        confirmation: "ask",
        required: ["userId"],
        properties: {
          userId: { type: "string", description: "Nextcloud 用户 ID" }
        }
      }),
      createAction({
        id: "autocompleteUsers",
        label: "搜索用户",
        description: "使用 Nextcloud OCS autocomplete 搜索用户",
        permission: "nextcloud.read",
        risk: "read",
        confirmation: "ask",
        required: ["query"],
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          query: { type: "string", description: "搜索关键词" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCapabilities: async (_input, context) => {
      const credentials = await readNextcloudCredentials(context);
      const result = await nextcloudOcsRequest({
        credentials,
        path: "/ocs/v1.php/cloud/capabilities"
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Nextcloud capabilities: ${readNextcloudVersion(result)}`
      };
    },
    getUserMetadata: async (input, context) => {
      const credentials = await readNextcloudCredentials(context);
      const userId = readRequiredString(input.userId, "userId", 160);
      const result = await nextcloudOcsRequest({
        credentials,
        path: `/ocs/v1.php/cloud/users/${encodePathSegment(userId)}`
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Nextcloud 用户: ${readNextcloudUserDisplayName(result, userId)}`
      };
    },
    autocompleteUsers: async (input, context) => {
      const credentials = await readNextcloudCredentials(context);
      const query = readRequiredString(input.query, "query", 200);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await nextcloudOcsRequest({
        credentials,
        path: "/ocs/v2.php/core/autocomplete/get",
        query: {
          itemId: " ",
          itemType: " ",
          limit: String(limit),
          search: query,
          "shareTypes[]": "0"
        }
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Nextcloud 搜索返回 ${readNextcloudAutocompleteCount(result)} 个用户`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "getUserMetadata"
        ? `nextcloud user ${String(input.userId ?? "")}`
        : `nextcloud ${String(input.query ?? actionId)}`
  };
}

function createHetznerCloudExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "hetzner-cloud",
    name: "Hetzner Cloud",
    description: "读取 Hetzner Cloud 服务器、地域和镜像摘要",
    version: "0.3.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Hetzner Cloud project API token, 建议使用只读 token",
      accessTokenFieldId: "apiToken",
      accessTokenLabel: "API token",
      accessTokenPlaceholder: "hcloud_api_token"
    }),
    permissions: [
      {
        id: "hetzner-cloud.read",
        label: "读取 Hetzner Cloud",
        description: "允许读取 Hetzner Cloud 项目内服务器、地域和镜像摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "listServers",
        label: "列出服务器",
        description: "读取 Hetzner Cloud servers",
        permission: "hetzner-cloud.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listLocations",
        label: "列出地域",
        description: "读取 Hetzner Cloud locations",
        permission: "hetzner-cloud.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listImages",
        label: "列出镜像",
        description: "读取 Hetzner Cloud images",
        permission: "hetzner-cloud.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" },
          type: { type: "string", description: "镜像类型, 例如 system, snapshot, backup, app" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    listServers: async (input, context) => {
      const token = await readSecret(context, "apiToken", "Hetzner Cloud API token");
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await hetznerCloudRequest({
        method: "GET",
        path: "/servers",
        query: {
          per_page: String(limit)
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Hetzner Cloud 返回 ${readArrayLength(readRecord(result).servers)} 台服务器`
      };
    },
    listLocations: async (_input, context) => {
      const token = await readSecret(context, "apiToken", "Hetzner Cloud API token");
      const result = await hetznerCloudRequest({
        method: "GET",
        path: "/locations",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Hetzner Cloud 返回 ${readArrayLength(readRecord(result).locations)} 个地域`
      };
    },
    listImages: async (input, context) => {
      const token = await readSecret(context, "apiToken", "Hetzner Cloud API token");
      const limit = readLimit(input.limit, defaultListLimit);
      const type = readOptionalString(input.type, 80);
      const result = await hetznerCloudRequest({
        method: "GET",
        path: "/images",
        query: {
          per_page: String(limit),
          ...(type ? { type } : {})
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Hetzner Cloud 返回 ${readArrayLength(readRecord(result).images)} 个镜像`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId) => `hetzner-cloud ${actionId}`
  };
}

function readNextcloudVersion(result: unknown): string {
  const version = readNestedRecord(result, ["ocs", "data", "version"]);
  return readObjectText(version, "string", "unknown");
}

function readNextcloudUserDisplayName(result: unknown, fallback: string): string {
  const data = readNestedRecord(result, ["ocs", "data"]);
  return readObjectText(data, "displayname", readObjectText(data, "id", fallback));
}

function readNextcloudAutocompleteCount(result: unknown): number {
  const exact = readNestedRecord(result, ["ocs", "data"]);
  const results = readRecord(exact).exact ?? readRecord(exact).users;

  if (Array.isArray(results)) {
    return results.length;
  }

  const record = readRecord(results);
  let count = 0;

  for (const value of Object.values(record)) {
    count += Array.isArray(value) ? value.length : 0;
  }

  return count;
}
