// 本文件说明: 定义任务协作类内置服务 Extension, 包含 Todoist/Asana/ClickUp/monday.com/Trello
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
import {
  readSecret,
  readTrelloCredentials
} from "./serviceCredentials.js";
import {
  asanaRequest,
  clickupRequest,
  mondayGraphqlRequest,
  todoistRequest,
  trelloRequest
} from "./serviceRequests.js";
import {
  encodePathSegment,
  readArrayLength,
  readCollectionLength,
  readLimit,
  readNestedObjectText,
  readObjectText,
  readOptionalString,
  readRecord,
  readRequiredString,
  toOutputRecord
} from "./serviceInput.js";

export function createTaskCollaborationExtensions(): BuiltInServiceExtension[] {
  return [
    createTodoistExtension(),
    createAsanaExtension(),
    createClickUpExtension(),
    createMondayExtension(),
    createTrelloExtension()
  ];
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