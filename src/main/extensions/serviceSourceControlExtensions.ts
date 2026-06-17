// 本文件说明: 注册源码托管类内置服务 Extension
import type { ExtensionManifest } from "../../shared/extensionTypes.js";
import type { ExtensionActionHandler } from "./qqMailExtension.js";
import type { BuiltInServiceExtension } from "./serviceExtensionCore.js";
import {
  createAction,
  defaultListLimit
} from "./serviceExtensionCore.js";
import {
  createBrokerUrl,
  createOAuthTokenAuth,
  readProductClientId
} from "./serviceAuth.js";
import { readSecret } from "./serviceCredentials.js";
import {
  bitbucketRequest,
  githubRequest,
  gitlabRequest
} from "./serviceRequests.js";
import {
  encodePathSegment,
  readArrayLength,
  readEnum,
  readLimit,
  readObjectText,
  readOptionalString,
  readOptionalStringList,
  readRecord,
  readRequiredString,
  toOutputRecord
} from "./serviceInput.js";

export function createSourceControlExtensions(): BuiltInServiceExtension[] {
  return [
    createGitHubExtension(),
    createGitLabExtension(),
    createBitbucketExtension()
  ];
}

function createGitHubExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "github",
    name: "GitHub",
    description: "读取仓库 Issue, 查看账号信息, 并在确认后创建 Issue",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription:
        "GitHub fine-grained/classic token 或 OAuth access token, 建议只授予目标仓库所需权限",
      accessTokenFieldId: "token",
      accessTokenLabel: "Personal access token",
      accessTokenPlaceholder: "github_pat_...",
      oauth: {
        provider: "GitHub",
        authorizationUrl: "https://github.com/login/device",
        tokenUrl: "https://github.com/login/oauth/access_token",
        deviceAuthorizationUrl: "https://github.com/login/device/code",
        scopes: ["repo", "read:user"],
        accessTokenFieldId: "token",
        refreshTokenFieldId: "refreshToken",
        productClientId: readProductClientId("FORGE_GITHUB_OAUTH_CLIENT_ID"),
        productClientIdEnvVar: "FORGE_GITHUB_OAUTH_CLIENT_ID",
        docsUrl:
          "https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps",
        setupUrl: "https://github.com/settings/developers",
        redirectUriMode: "device-code",
        usePkce: false,
        tokenRequestAuth: "none"
      }
    }),
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

function createGitLabExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "gitlab",
    name: "GitLab",
    description: "读取 GitLab 当前用户、项目和 Issue 摘要",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "GitLab OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "gitlab_access_token",
      oauth: {
        provider: "GitLab",
        authorizationUrl: "https://gitlab.com/oauth/authorize",
        tokenUrl: "https://gitlab.com/oauth/token",
        brokerAuthorizationUrl: createBrokerUrl("gitlab", "authorize"),
        brokerTokenUrl: createBrokerUrl("gitlab", "token"),
        scopes: ["read_user", "read_api"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://docs.gitlab.com/integration/oauth_provider/",
        setupUrl: "https://gitlab.com/-/user_settings/applications",
        redirectUriMode: "brokered",
        usePkce: true,
        tokenRequestAuth: "body"
      }
    }),
    permissions: [
      {
        id: "gitlab.read",
        label: "读取 GitLab",
        description: "允许读取 GitLab 当前用户、项目和 Issue 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 GitLab 用户摘要",
        permission: "gitlab.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listProjects",
        label: "列出项目",
        description: "读取当前用户参与的 GitLab 项目列表",
        permission: "gitlab.read",
        risk: "read",
        confirmation: "ask",
        properties: {
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listProjectIssues",
        label: "列出项目 Issues",
        description: "读取指定 GitLab 项目的 Issue 列表",
        permission: "gitlab.read",
        risk: "read",
        confirmation: "ask",
        required: ["projectId"],
        properties: {
          projectId: { type: "string", description: "项目数字 ID 或 namespace/project 路径" },
          state: { type: "string", enum: ["opened", "closed", "all"], description: "Issue 状态" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "GitLab access token");
      const user = await gitlabRequest({
        method: "GET",
        path: "/user",
        token
      });

      return {
        output: toOutputRecord(user),
        outputSummary: `GitLab 当前用户: ${readObjectText(user, "username", "unknown")}`
      };
    },
    listProjects: async (input, context) => {
      const token = await readSecret(context, "accessToken", "GitLab access token");
      const limit = readLimit(input.limit, defaultListLimit);
      const projects = await gitlabRequest({
        method: "GET",
        path: "/projects",
        query: {
          membership: "true",
          order_by: "last_activity_at",
          per_page: String(limit),
          simple: "true",
          sort: "desc"
        },
        token
      });

      return {
        output: Array.isArray(projects) ? { projects } : toOutputRecord(projects),
        outputSummary: `GitLab 返回 ${readArrayLength(projects)} 个项目`
      };
    },
    listProjectIssues: async (input, context) => {
      const token = await readSecret(context, "accessToken", "GitLab access token");
      const projectId = readRequiredString(input.projectId, "projectId", 240);
      const state = readEnum(input.state, ["opened", "closed", "all"], "opened");
      const limit = readLimit(input.limit, defaultListLimit);
      const issues = await gitlabRequest({
        method: "GET",
        path: `/projects/${encodePathSegment(projectId)}/issues`,
        query: {
          per_page: String(limit),
          state
        },
        token
      });

      return {
        output: Array.isArray(issues) ? { issues } : toOutputRecord(issues),
        outputSummary: `GitLab ${projectId} 返回 ${readArrayLength(issues)} 个 Issue`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "listProjectIssues"
        ? `gitlab ${String(input.projectId ?? "")}`
        : "gitlab"
  };
}

function createBitbucketExtension(): BuiltInServiceExtension {
  const manifest: ExtensionManifest = {
    id: "bitbucket",
    name: "Bitbucket",
    description: "读取 Bitbucket Cloud 当前用户、仓库和 Issue 摘要",
    version: "0.2.1",
    category: "developer",
    builtIn: true,
    auth: createOAuthTokenAuth({
      accessTokenDescription: "Bitbucket OAuth access token, 通过 Forge OAuth broker 自动保存",
      accessTokenPlaceholder: "bitbucket_access_token",
      oauth: {
        provider: "Bitbucket",
        authorizationUrl: "https://bitbucket.org/site/oauth2/authorize",
        tokenUrl: "https://bitbucket.org/site/oauth2/access_token",
        brokerAuthorizationUrl: createBrokerUrl("bitbucket", "authorize"),
        brokerTokenUrl: createBrokerUrl("bitbucket", "token"),
        scopes: ["account", "repository", "issue"],
        accessTokenFieldId: "accessToken",
        refreshTokenFieldId: "refreshToken",
        docsUrl: "https://developer.atlassian.com/cloud/bitbucket/rest/intro/#oauth-2-0",
        setupUrl: "https://support.atlassian.com/bitbucket-cloud/docs/use-oauth-on-bitbucket-cloud/",
        redirectUriMode: "brokered",
        usePkce: false,
        tokenRequestAuth: "basic"
      }
    }),
    permissions: [
      {
        id: "bitbucket.read",
        label: "读取 Bitbucket",
        description: "允许读取 Bitbucket Cloud 当前用户、仓库和 Issue 摘要",
        defaultMode: "ask"
      }
    ],
    actions: [
      createAction({
        id: "getCurrentUser",
        label: "查看当前用户",
        description: "读取当前 Bitbucket 用户资料",
        permission: "bitbucket.read",
        risk: "read",
        confirmation: "ask",
        properties: {}
      }),
      createAction({
        id: "listRepositories",
        label: "列出仓库",
        description: "读取指定 Bitbucket workspace 下的仓库",
        permission: "bitbucket.read",
        risk: "read",
        confirmation: "ask",
        required: ["workspace"],
        properties: {
          workspace: { type: "string", description: "Bitbucket workspace slug" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      }),
      createAction({
        id: "listRepositoryIssues",
        label: "列出仓库 Issues",
        description: "读取指定 Bitbucket 仓库的 Issue 列表",
        permission: "bitbucket.read",
        risk: "read",
        confirmation: "ask",
        required: ["workspace", "repoSlug"],
        properties: {
          repoSlug: { type: "string", description: "Bitbucket repository slug" },
          workspace: { type: "string", description: "Bitbucket workspace slug" },
          limit: { type: "number", description: "最多返回数量, 默认 20, 最大 100" }
        }
      })
    ]
  };

  const handlers: Record<string, ExtensionActionHandler> = {
    getCurrentUser: async (_input, context) => {
      const token = await readSecret(context, "accessToken", "Bitbucket access token");
      const result = await bitbucketRequest({
        method: "GET",
        path: "/user",
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Bitbucket 当前用户: ${readObjectText(result, "display_name", "unknown")}`
      };
    },
    listRepositories: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Bitbucket access token");
      const workspace = readRequiredString(input.workspace, "workspace", 120);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await bitbucketRequest({
        method: "GET",
        path: `/repositories/${encodePathSegment(workspace)}`,
        query: {
          pagelen: String(limit),
          sort: "-updated_on"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Bitbucket ${workspace} 返回 ${readArrayLength(readRecord(result).values)} 个仓库`
      };
    },
    listRepositoryIssues: async (input, context) => {
      const token = await readSecret(context, "accessToken", "Bitbucket access token");
      const workspace = readRequiredString(input.workspace, "workspace", 120);
      const repoSlug = readRequiredString(input.repoSlug, "repoSlug", 160);
      const limit = readLimit(input.limit, defaultListLimit);
      const result = await bitbucketRequest({
        method: "GET",
        path: `/repositories/${encodePathSegment(workspace)}/${encodePathSegment(repoSlug)}/issues`,
        query: {
          pagelen: String(limit),
          sort: "-updated_on"
        },
        token
      });

      return {
        output: toOutputRecord(result),
        outputSummary: `Bitbucket ${workspace}/${repoSlug} 返回 ${readArrayLength(readRecord(result).values)} 个 Issue`
      };
    }
  };

  return {
    handlers,
    manifest,
    summarizeInput: (actionId, input) =>
      actionId === "getCurrentUser"
        ? "bitbucket user"
        : `bitbucket ${String(input.workspace ?? "")}/${String(input.repoSlug ?? "")}`
  };
}
