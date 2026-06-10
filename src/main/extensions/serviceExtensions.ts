// 本文件说明: 注册常见外部服务内置 Extension, 通过官方 REST API 执行受控动作
import type {
  ExtensionActionDefinition,
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

export const serviceExtensionDefinitions: BuiltInServiceExtension[] = [
  createGitHubExtension(),
  createSlackExtension(),
  createNotionExtension(),
  createGoogleCalendarExtension(),
  createFigmaExtension()
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
    auth: {
      type: "secret",
      fields: [
        {
          id: "token",
          label: "Personal access token",
          description: "GitHub fine-grained 或 classic token, 建议只授予目标仓库所需权限",
          placeholder: "github_pat_..."
        }
      ]
    },
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

function createSlackExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "slack",
    name: "Slack",
    description: "读取 Slack 频道列表, 并在确认后发送消息",
    version: "0.2.1",
    category: "other",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "botToken",
          label: "Bot token",
          description: "Slack app 的 xoxb bot token, 建议只授予 channels:read 和 chat:write 等必要 scope",
          placeholder: "xoxb-..."
        }
      ]
    },
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
    auth: {
      type: "secret",
      fields: [
        {
          id: "integrationToken",
          label: "Integration token",
          description: "Notion internal integration secret, 需要把目标页面或数据库分享给该连接",
          placeholder: "secret_..."
        }
      ]
    },
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

function createGoogleCalendarExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "google-calendar",
    name: "Google Calendar",
    description: "读取 Google Calendar 日程, 并在确认后创建事件",
    version: "0.2.1",
    category: "calendar",
    builtIn: true,
    auth: {
      type: "secret",
      fields: [
        {
          id: "accessToken",
          label: "OAuth access token",
          description: "Google Calendar API OAuth 访问令牌, 需要 calendar 相关 scope",
          placeholder: "ya29..."
        }
      ]
    },
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
    auth: {
      type: "secret",
      fields: [
        {
          id: "personalAccessToken",
          label: "Personal access token",
          description: "Figma personal access token 或 OAuth token, 需要文件读取权限",
          placeholder: "figd_..."
        }
      ]
    },
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
    headers: {
      "X-Figma-Token": token
    },
    method,
    service: "Figma",
    url: withQuery(`https://api.figma.com/v1${path}`, query)
  });
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

function readArrayLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
