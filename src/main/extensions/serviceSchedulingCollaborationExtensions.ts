// 本文件说明: 定义日程会议与设计协作类内置服务 Extension, 包含 Google Calendar/Calendly/Miro/Zoom/Figma
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type { ExtensionActionHandler } from "./qqMailExtension.js";
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
  calendlyRequest,
  figmaRequest,
  googleCalendarRequest,
  miroRequest,
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

export function createSchedulingCollaborationExtensions(): BuiltInServiceExtension[] {
  return [
    createGoogleCalendarExtension(),
    createCalendlyExtension(),
    createMiroExtension(),
    createZoomExtension(),
    createFigmaExtension()
  ];
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