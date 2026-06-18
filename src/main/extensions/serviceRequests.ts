// 本文件说明: 提供内置服务 Extension 各外部服务 API 请求封装
import type { ExtensionActionHandlerContext } from "./qqMailExtension.js";
import { trimTrailingSlash } from "./serviceAuth.js";
import { readSecret } from "./serviceCredentials.js";
import { formatErrorPayload, requestJson } from "./serviceHttp.js";
import {
  createBasicAuthHeader,
  encodePathSegment,
  readRecord,
  withQuery
} from "./serviceInput.js";

const notionVersion = "2022-06-28";

export async function githubRequest({
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

export async function gitlabRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "GitLab",
    url: withQuery(`https://gitlab.com/api/v4${path}`, query)
  });
}

export async function bitbucketRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Bitbucket",
    url: withQuery(`https://api.bitbucket.org/2.0${path}`, query)
  });
}

export async function giteeRequest({
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
    method,
    service: "Gitee",
    url: withQuery(`https://gitee.com/api/v5${path}`, {
      ...query,
      access_token: token
    })
  });
}

export async function slackRequest({
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

export async function notionRequest({
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

export async function googleCalendarRequest({
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

export async function miroRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Miro",
    url: withQuery(`https://api.miro.com/v2${path}`, query)
  });
}

export async function zoomRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Zoom",
    url: withQuery(`https://api.zoom.us/v2${path}`, query)
  });
}

export async function calendlyRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Calendly",
    url: withQuery(`https://api.calendly.com${path}`, query)
  });
}

export async function gmailRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Gmail",
    url: withQuery(`https://gmail.googleapis.com/gmail/v1${path}`, query)
  });
}

export async function googleDriveRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Google Drive",
    url: withQuery(`https://www.googleapis.com/drive/v3${path}`, query)
  });
}

export async function nextcloudOcsRequest({
  credentials,
  path,
  query
}: {
  credentials: { appPassword: string; serverUrl: string; username: string };
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Accept: "application/json",
      Authorization: createBasicAuthHeader(credentials.username, credentials.appPassword),
      "OCS-APIRequest": "true"
    },
    method: "GET",
    service: "Nextcloud",
    url: withQuery(`${credentials.serverUrl}${path}`, {
      ...query,
      format: "json"
    })
  });
}

export async function hetznerCloudRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Hetzner Cloud",
    url: withQuery(`https://api.hetzner.cloud/v1${path}`, query)
  });
}

export async function webhookJsonPost({
  body,
  service,
  url
}: {
  body: Record<string, unknown>;
  service: string;
  url: string;
}): Promise<unknown> {
  const result = await requestJson({
    body,
    method: "POST",
    retry: false,
    service,
    url
  });
  const record = readRecord(result);
  const statusCode = record.errcode ?? record.code ?? record.StatusCode;

  if (statusCode === undefined) {
    throw new Error(`${service} webhook request failed: missing success code`);
  }

  if (
    (typeof statusCode === "number" && statusCode !== 0) ||
    (typeof statusCode === "string" && statusCode !== "0")
  ) {
    throw new Error(`${service} webhook request failed: ${formatErrorPayload(result)}`);
  }

  return result;
}

export async function asanaRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Asana",
    url: withQuery(`https://app.asana.com/api/1.0${path}`, query)
  });
}

export async function airtableRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Airtable",
    url: withQuery(`https://api.airtable.com/v0${path}`, query)
  });
}

export async function hubspotRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "HubSpot",
    url: withQuery(`https://api.hubapi.com${path}`, query)
  });
}

export async function salesforceRequest({
  instanceUrl,
  method,
  path,
  query,
  token
}: {
  instanceUrl: string;
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Salesforce",
    url: withQuery(`${trimTrailingSlash(instanceUrl)}${path}`, query)
  });
}

export async function zendeskRequest({
  method,
  path,
  query,
  subdomain,
  token
}: {
  method: "GET";
  path: string;
  query?: Record<string, string>;
  subdomain: string;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Zendesk",
    url: withQuery(`https://${subdomain}.zendesk.com/api/v2${path}`, query)
  });
}

export async function intercomRequest({
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
      Authorization: `Bearer ${token}`,
      "Intercom-Version": "2.15"
    },
    method,
    service: "Intercom",
    url: withQuery(`https://api.intercom.io${path}`, query)
  });
}

export async function todoistRequest({
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
  return requestJson({
    body,
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Todoist",
    url: withQuery(`https://api.todoist.com/api/v1${path}`, query)
  });
}

export async function clickupRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "ClickUp",
    url: withQuery(`https://api.clickup.com/api/v2${path}`, query)
  });
}

export async function dropboxRequest({
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
      Authorization: `Bearer ${token}`
    },
    method: "POST",
    service: "Dropbox",
    url: `https://api.dropboxapi.com/2${path}`
  });
}

export async function microsoftGraphRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Microsoft Graph",
    url: withQuery(`https://graph.microsoft.com/v1.0${path}`, query)
  });
}

export async function trelloRequest({
  credentials,
  method,
  path,
  query
}: {
  credentials: { apiKey: string; token: string };
  method: "GET";
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  return requestJson({
    method,
    service: "Trello",
    url: withQuery(`https://api.trello.com/1${path}`, {
      ...query,
      key: credentials.apiKey,
      token: credentials.token
    })
  });
}

export async function stripeRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Stripe",
    url: withQuery(`https://api.stripe.com/v1${path}`, query)
  });
}

export async function shopifyGraphqlRequest({
  credentials,
  query,
  variables
}: {
  credentials: { adminAccessToken: string; storeDomain: string };
  query: string;
  variables?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const result = await requestJson({
    body: {
      query,
      ...(variables ? { variables } : {})
    },
    headers: {
      "X-Shopify-Access-Token": credentials.adminAccessToken
    },
    method: "POST",
    service: "Shopify",
    url: `https://${credentials.storeDomain}/admin/api/2026-04/graphql.json`
  });
  const record = readRecord(result);

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    throw new Error(`Shopify API request failed: ${formatErrorPayload(record.errors[0])}`);
  }

  return readRecord(record.data);
}

export async function mondayGraphqlRequest({
  query,
  token,
  variables
}: {
  query: string;
  token: string;
  variables?: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const result = await requestJson({
    body: {
      query,
      ...(variables ? { variables } : {})
    },
    headers: {
      Authorization: token,
      "API-Version": "2026-01"
    },
    method: "POST",
    service: "monday.com",
    url: "https://api.monday.com/v2"
  });
  const record = readRecord(result);

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    throw new Error(`monday.com API request failed: ${formatErrorPayload(record.errors[0])}`);
  }

  return readRecord(record.data);
}

export async function linearGraphqlRequest({
  query,
  token,
  variables
}: {
  query: string;
  token: string;
  variables?: Record<string, unknown>;
}): Promise<unknown> {
  const result = await requestJson({
    body: {
      query,
      ...(variables ? { variables } : {})
    },
    headers: {
      Authorization: `Bearer ${token}`
    },
    method: "POST",
    service: "Linear",
    url: "https://api.linear.app/graphql"
  });
  const record = readRecord(result);

  if (Array.isArray(record.errors) && record.errors.length > 0) {
    throw new Error(`Linear API request failed: ${formatErrorPayload(record.errors[0])}`);
  }

  return readRecord(record.data);
}

export async function jiraApiRequest({
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
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Jira Cloud",
    url: withQuery(`https://api.atlassian.com${path}`, query)
  });
}

export async function confluenceApiRequest({
  cloudId,
  method,
  path,
  query,
  token
}: {
  cloudId: string;
  method: "GET";
  path: string;
  query?: Record<string, string>;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Confluence Cloud",
    url: withQuery(
      `https://api.atlassian.com/ex/confluence/${encodePathSegment(cloudId)}/wiki${path}`,
      query
    )
  });
}

export async function sentryRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Sentry",
    url: withQuery(`https://sentry.io/api/0${path}`, query)
  });
}

export async function pagerDutyRequest({
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
      Accept: "application/vnd.pagerduty+json;version=2",
      Authorization: `Token token=${token}`
    },
    method,
    service: "PagerDuty",
    url: withQuery(`https://api.pagerduty.com${path}`, query)
  });
}

export async function datadogRequest({
  credentials,
  method,
  path,
  query
}: {
  credentials: { apiKey: string; applicationKey: string; site: string };
  method: "GET";
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  return requestJson({
    headers: {
      "DD-API-KEY": credentials.apiKey,
      "DD-APPLICATION-KEY": credentials.applicationKey
    },
    method,
    service: "Datadog",
    url: withQuery(`https://api.${credentials.site}${path}`, query)
  });
}

export async function cloudflareRequest({
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
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Cloudflare",
    url: withQuery(`https://api.cloudflare.com/client/v4${path}`, query)
  });
}

export async function freshdeskRequest({
  credentials,
  method,
  path,
  query
}: {
  credentials: { apiKey: string; domain: string };
  method: "GET";
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: createBasicAuthHeader(credentials.apiKey, "X")
    },
    method,
    service: "Freshdesk",
    url: withQuery(`https://${credentials.domain}/api/v2${path}`, query)
  });
}

export async function mailchimpRequest({
  credentials,
  method,
  path,
  query
}: {
  credentials: { apiKey: string; serverPrefix: string };
  method: "GET";
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: createBasicAuthHeader("Forge", credentials.apiKey)
    },
    method,
    service: "Mailchimp",
    url: withQuery(`https://${credentials.serverPrefix}.api.mailchimp.com/3.0${path}`, query)
  });
}

export async function oktaRequest({
  credentials,
  method,
  path,
  query
}: {
  credentials: { apiToken: string; orgUrl: string };
  method: "GET";
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `SSWS ${credentials.apiToken}`
    },
    method,
    service: "Okta",
    url: withQuery(`${credentials.orgUrl}${path}`, query)
  });
}

export async function pipedriveRequest({
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
    method,
    service: "Pipedrive",
    url: withQuery(`https://api.pipedrive.com/v1${path}`, {
      ...query,
      api_token: token
    })
  });
}

export async function postmarkRequest({
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
  return requestJson({
    body,
    headers: {
      Accept: "application/json",
      "X-Postmark-Server-Token": token
    },
    method,
    service: "Postmark",
    url: withQuery(`https://api.postmarkapp.com${path}`, query)
  });
}

export async function twilioRequest({
  credentials,
  method,
  path,
  query
}: {
  credentials: { accountSid: string; authToken: string };
  method: "GET";
  path: string;
  query?: Record<string, string>;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: createBasicAuthHeader(credentials.accountSid, credentials.authToken)
    },
    method,
    service: "Twilio",
    url: withQuery(`https://api.twilio.com${path}`, query)
  });
}

export async function discordRequest({
  method,
  path,
  token
}: {
  method: "GET";
  path: string;
  token: string;
}): Promise<unknown> {
  return requestJson({
    headers: {
      Authorization: `Bearer ${token}`
    },
    method,
    service: "Discord",
    url: `https://discord.com/api/v10${path}`
  });
}

export async function figmaRequest({
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
    headers: createFigmaAuthHeaders(token),
    method,
    service: "Figma",
    url: withQuery(`https://api.figma.com/v1${path}`, query)
  });
}

export function createFigmaAuthHeaders(token: string): Record<string, string> {
  return token.startsWith("figd_")
    ? { "X-Figma-Token": token }
    : { Authorization: `Bearer ${token}` };
}
