// 本文件说明: 提供服务扩展共享的凭据读取和规范化辅助函数
import type { ExtensionActionHandlerContext } from "./qqMailExtension.js";
import {
  normalizeDatadogSite,
  normalizeFreshdeskDomain,
  normalizeHttpsOrigin,
  normalizeShopifyStoreDomain,
  normalizeSimpleHostLabel,
  normalizeZendeskSubdomain
} from "./serviceInput.js";

export async function readSalesforceCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ instanceUrl: string; token: string }> {
  const rawInstanceUrl = await readSecret(context, "instanceUrl", "Salesforce instance URL");
  const token = await readSecret(context, "accessToken", "Salesforce access token");
  const instanceUrl = normalizeHttpsOrigin(rawInstanceUrl, "Salesforce instance URL");

  return { instanceUrl, token };
}

export async function readZendeskCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ subdomain: string; token: string }> {
  const rawSubdomain = await readSecret(context, "subdomain", "Zendesk subdomain");
  const token = await readSecret(context, "accessToken", "Zendesk access token");
  const subdomain = normalizeZendeskSubdomain(rawSubdomain);

  return { subdomain, token };
}

export async function readTrelloCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ apiKey: string; token: string }> {
  const apiKey = await readSecret(context, "apiKey", "Trello API key");
  const token = await readSecret(context, "token", "Trello token");

  return { apiKey, token };
}

export async function readShopifyCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ adminAccessToken: string; storeDomain: string }> {
  const rawStoreDomain = await readSecret(context, "storeDomain", "Shopify store domain");
  const adminAccessToken = await readSecret(
    context,
    "adminAccessToken",
    "Shopify Admin API access token"
  );
  const storeDomain = normalizeShopifyStoreDomain(rawStoreDomain);

  return { adminAccessToken, storeDomain };
}

export async function readDatadogCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ apiKey: string; applicationKey: string; site: string }> {
  const rawSite = await context.readSecret("site");
  const apiKey = await readSecret(context, "apiKey", "Datadog API key");
  const applicationKey = await readSecret(
    context,
    "applicationKey",
    "Datadog application key"
  );
  const site = normalizeDatadogSite(rawSite || "datadoghq.com");

  return { apiKey, applicationKey, site };
}

export async function readFreshdeskCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ apiKey: string; domain: string }> {
  const rawDomain = await readSecret(context, "domain", "Freshdesk domain");
  const apiKey = await readSecret(context, "apiKey", "Freshdesk API key");
  const domain = normalizeFreshdeskDomain(rawDomain);

  return { apiKey, domain };
}

export async function readMailchimpCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ apiKey: string; serverPrefix: string }> {
  const rawServerPrefix = await readSecret(context, "serverPrefix", "Mailchimp server prefix");
  const apiKey = await readSecret(context, "apiKey", "Mailchimp API key");
  const serverPrefix = normalizeSimpleHostLabel(rawServerPrefix, "Mailchimp server prefix");

  return { apiKey, serverPrefix };
}

export async function readOktaCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ apiToken: string; orgUrl: string }> {
  const rawOrgUrl = await readSecret(context, "orgUrl", "Okta org URL");
  const apiToken = await readSecret(context, "apiToken", "Okta API token");
  const orgUrl = normalizeHttpsOrigin(rawOrgUrl, "Okta org URL");

  return { apiToken, orgUrl };
}

export async function readTwilioCredentials(
  context: ExtensionActionHandlerContext
): Promise<{ accountSid: string; authToken: string }> {
  const accountSid = await readSecret(context, "accountSid", "Twilio Account SID");
  const authToken = await readSecret(context, "authToken", "Twilio Auth Token");

  return { accountSid, authToken };
}

export async function readSecret(
  context: Pick<ExtensionActionHandlerContext, "readSecret">,
  fieldId: string,
  label: string
): Promise<string> {
  const value = await context.readSecret(fieldId);

  if (!value) {
    throw new Error(`${label} is not configured`);
  }

  return value;
}
